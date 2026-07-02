import { googleAuth } from '../config/google.js';

export const ocrController = {
  async performOCR(req, res) {
    try {
      const { base64Data, type } = req.body;
      const apiKey = process.env.GOOGLE_OCR_API_KEY;

      if (!base64Data) {
        return res.status(400).json({ success: false, error: 'base64Data is required.' });
      }

      // Check if we should use Gemini API (indicated by "AQ." key prefix)
      const useGemini = apiKey && apiKey.startsWith('AQ.');

      if (useGemini) {
        console.log(`[OCR] Using Gemini 2.5 Flash for type: "${type}"`);
        
        let rawBase64 = base64Data;
        let mimeType = 'image/jpeg';
        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            mimeType = match[1];
            rawBase64 = match[2];
          }
        }

        let promptText = '';
        if (type === 'odometer') {
          promptText = `Identify the odometer reading in the image. Return a JSON object with keys:
"text": the raw text/numbers detected,
"parsed": {
  "odometer": <number or null>
}
Ensure the output is valid raw JSON only, no markdown tags.`;
        } else {
          promptText = `Identify the quantity (in KGs), rate per KG, total amount paid, and any vehicle odometer/KM reading written on the fuel receipt. Return a JSON object with keys:
"text": the raw text detected,
"parsed": {
  "kgs": <number or null>,
  "rate": <number or null>,
  "total": <number or null>,
  "odometer": <number or null>
}
Ensure the output is valid raw JSON only, no markdown tags.`;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType,
                    data: rawBase64
                  }
                }
              ]
            }]
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error('[OCR] Gemini API error response:', response.status, errBody);
          return res.status(response.status).json({ success: false, error: 'Gemini API request failed.' });
        }

        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!responseText) {
          console.error('[OCR] Empty response from Gemini API:', JSON.stringify(result));
          return res.status(500).json({ success: false, error: 'Empty response from Gemini API.' });
        }

        const cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(cleanJsonStr);
        } catch (parseErr) {
          console.error('[OCR] Failed to parse Gemini response as JSON. Content:', responseText);
          return res.json({
            success: true,
            text: responseText,
            parsed: null
          });
        }

        // Perform math healing for receipt type if missing some values
        if (type === 'receipt' && parsedResponse.parsed) {
          const data = parsedResponse.parsed;
          if (data.rate && data.kgs && !data.total) {
            data.total = parseFloat((data.rate * data.kgs).toFixed(2));
          } else if (data.total && data.kgs && !data.rate) {
            data.rate = parseFloat((data.total / data.kgs).toFixed(2));
          } else if (data.total && data.rate && !data.kgs) {
            data.kgs = parseFloat((data.total / data.rate).toFixed(2));
          }
        }

        console.log('[OCR] Gemini processing results:', parsedResponse);
        return res.json({
          success: true,
          text: parsedResponse.text || responseText,
          parsed: parsedResponse.parsed || null
        });

      } else {
        // Fallback to Google Cloud Vision API
        console.log(`[OCR] Using Google Cloud Vision API for type: "${type}"`);
        
        if (!googleAuth) {
          return res.status(500).json({ success: false, error: 'Google Auth is not configured on the server.' });
        }

        const tokenRes = await googleAuth.getAccessToken();
        const accessToken = tokenRes.token;

        if (!accessToken) {
          return res.status(500).json({ success: false, error: 'Failed to retrieve Google OAuth2 access token.' });
        }

        let rawBase64 = base64Data;
        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            rawBase64 = match[2];
          }
        }

        const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            requests: [
              {
                image: { content: rawBase64 },
                features: [{ type: 'TEXT_DETECTION' }]
              }
            ]
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error('[OCR] Google Vision API error response:', response.status, errBody);
          return res.status(response.status).json({ success: false, error: 'Google Vision API request failed.' });
        }

        const result = await response.json();
        const textAnnotations = result.responses?.[0]?.textAnnotations;

        if (!textAnnotations || textAnnotations.length === 0) {
          console.log('[OCR] No text detected in image.');
          return res.json({ success: true, text: '', parsed: null });
        }

        const fullText = textAnnotations[0].description;
        console.log(`[OCR] Extracted text from image:\n---\n${fullText}\n---`);

        const parsedData = ocrController.parseOCRText(fullText, type);
        console.log('[OCR] Text parsing results:', parsedData);

        return res.json({
          success: true,
          text: fullText,
          parsed: parsedData
        });
      }

    } catch (err) {
      console.error('[OCR] Request failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  parseOCRText(text, type) {
    if (!text) return null;

    if (type === 'odometer') {
      const odoMatch = text.match(/\b\d{5,6}\b/);
      return odoMatch ? { odometer: parseInt(odoMatch[0]) } : null;
    }

    if (type === 'receipt') {
      const data = { kgs: null, rate: null, total: null };
      const lines = text.split('\n');

      for (const line of lines) {
        const lower = line.toLowerCase().replace(/[^a-z0-9\s/.]/g, '');
        
        if (lower.includes('rate') || lower.includes('rs/kg') || lower.includes('/kg')) {
          const match = line.match(/\d+(\.\d+)?/);
          if (match && !data.rate) {
            data.rate = parseFloat(match[0]);
          }
        }
        
        if (lower.includes('kg') || lower.includes('qty') || lower.includes('quantity') || lower.includes('vol') || lower.includes('mass')) {
          const match = line.match(/\d+(\.\d+)?/);
          if (match && !data.kgs) {
            data.kgs = parseFloat(match[0]);
          }
        }
        
        if (lower.includes('total') || lower.includes('net') || lower.includes('amt') || lower.includes('amount') || lower.includes('paid')) {
          const match = line.match(/\d+(\.\d+)?/);
          if (match && !data.total) {
            data.total = parseFloat(match[0]);
          }
        }
      }

      if (data.rate && data.kgs && !data.total) {
        data.total = parseFloat((data.rate * data.kgs).toFixed(2));
      } else if (data.total && data.kgs && !data.rate) {
        data.rate = parseFloat((data.total / data.kgs).toFixed(2));
      } else if (data.total && data.rate && !data.kgs) {
        data.kgs = parseFloat((data.total / data.rate).toFixed(2));
      }

      return data;
    }

    return null;
  }
};
