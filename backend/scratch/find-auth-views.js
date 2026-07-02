import fs from 'fs';

const content = fs.readFileSync('C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src/App.tsx', 'utf-8');
const lines = content.split('\n');

console.log('Lines referencing owner login/register views:');
lines.forEach((line, index) => {
  if (line.includes('owner-') || line.includes('Register') || line.includes('Login')) {
    if (line.includes('view') || line.includes('setView') || line.includes('render')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
