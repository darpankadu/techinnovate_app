import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < 50; i++) {
  if (lines[i].includes('lucide-react')) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
