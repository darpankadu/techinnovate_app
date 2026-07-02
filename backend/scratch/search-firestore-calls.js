import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

console.log('Lines importing from firestore:');
lines.forEach((line, index) => {
  if (line.includes('/firestore') || line.includes('firestore.ts') || line.includes('firestore.js')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});

console.log('\nLines containing db or collection:');
lines.forEach((line, index) => {
  if (line.includes('collection(') || line.includes('getDocs(')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
