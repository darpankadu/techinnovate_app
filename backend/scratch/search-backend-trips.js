import fs from 'fs';
import path from 'path';

function walkDir(dir, pattern, results = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, pattern, results);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.toLowerCase().includes(pattern)) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const srcDir = 'C:/backend cng fleet/src';
const foundFiles = walkDir(srcDir, 'trip');
console.log('Backend files referencing "trip":', foundFiles);
