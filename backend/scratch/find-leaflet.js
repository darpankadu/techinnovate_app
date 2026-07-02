import fs from 'fs';
import path from 'path';

function walkDir(dir, pattern, results = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        walkDir(fullPath, pattern, results);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.html') || file.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        results.push({ file: fullPath, matches: true });
      }
    }
  });
  return results;
}

const frontendDir = 'C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main';
const foundFiles = walkDir(frontendDir, 'leaflet');
console.log('Files containing "leaflet":', foundFiles);
