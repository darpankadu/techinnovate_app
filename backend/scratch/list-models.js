import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.GOOGLE_OCR_API_KEY;

async function listModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.models) {
      const geminiModels = result.models
        .map(m => m.name)
        .filter(name => name.toLowerCase().includes('gemini'));
      console.log('Available Gemini Models:', geminiModels);
    } else {
      console.log('No models returned:', result);
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
