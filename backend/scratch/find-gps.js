import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('geolocation') || line.includes('getCurrentPosition')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
