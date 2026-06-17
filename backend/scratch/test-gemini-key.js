import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.GOOGLE_OCR_API_KEY;
console.log('Testing Gemini API key:', apiKey ? apiKey.substring(0, 10) + '...' : 'undefined');

async function testGemini() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // 1x1 black pixel PNG in base64
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "This is a test image. Output 'OK' if you can read this." },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    const status = response.status;
    const result = await response.json();
    console.log(`Response Status: ${status}`);
    console.log('Response Body:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Fetch Error:', error);
  }
}

testGemini();
