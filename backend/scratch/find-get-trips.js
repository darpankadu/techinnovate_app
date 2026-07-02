import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

console.log('Lines containing getTrips:');
lines.forEach((line, index) => {
  if (line.includes('getTrips')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
