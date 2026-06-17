import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

console.log('Lines containing startTrip or endTrip:');
lines.forEach((line, index) => {
  if (line.includes('startTrip') || line.includes('endTrip') || line.includes('tripOdo') || line.includes('tripMedia') || line.includes('tripPhoto')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
