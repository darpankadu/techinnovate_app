import fs from 'fs';
import path from 'path';

function walkDir(dir, pattern, results = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, pattern, results);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes(pattern)) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const srcDir = 'C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src';
const foundFiles = walkDir(srcDir, 'saveTrip');
console.log('Frontend files calling "saveTrip":', foundFiles);
