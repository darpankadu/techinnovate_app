import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

console.log('Lines containing "trip" (case-insensitive):');
let count = 0;
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('trip') && !line.includes('tripMediaFilter')) {
    count++;
    if (count < 40) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
console.log(`Total occurrences: ${count}`);
