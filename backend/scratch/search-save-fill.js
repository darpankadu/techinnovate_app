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
        results.push({ file: fullPath, content });
      }
    }
  });
  return results;
}

const srcDir = 'C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src';
const found = walkDir(srcDir, 'saveFill');
found.forEach(item => {
  console.log('File:', item.file);
  const lines = item.content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('saveFill')) {
      console.log(`  ${idx+1}: ${line.trim()}`);
    }
  });
});
