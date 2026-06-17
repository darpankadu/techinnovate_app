import fs from 'fs';
import path from 'path';

function walkDir(dir, results = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(fullPath);
    }
  });
  return results;
}

const srcDir = 'C:/Users/athar/Downloads/tech innovative zip ex/techinnovate_app-main/techinnovate_app-main/src';
const allFiles = walkDir(srcDir);
const authFiles = allFiles.filter(f => f.toLowerCase().includes('register') || f.toLowerCase().includes('login') || f.toLowerCase().includes('auth'));
console.log('Auth related files in frontend:', authFiles);
