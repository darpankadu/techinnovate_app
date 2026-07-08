import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('frontend/dist');
const rootDir = path.resolve('.');

console.log('Building frontend with GH_PAGES=true...');
process.env.GH_PAGES = 'true';

try {
  execSync('npm run build', { cwd: path.resolve('frontend'), stdio: 'inherit' });
  
  console.log('Copying build assets to root (skipping .git)...');
  fs.cpSync(distDir, rootDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(distDir, src);
      if (rel === '.git' || rel.startsWith('.git' + path.sep)) {
        return false;
      }
      return true;
    }
  });
  
  console.log('Adding and committing deployed files...');
  execSync('git add .', { stdio: 'inherit' });
  try {
    execSync('git commit -m "Deploy PWA updates to target main branch"', { stdio: 'inherit' });
  } catch (e) {
    console.log('No changes to commit.');
  }
  
  console.log('Pushing to target main...');
  execSync('git push target main', { stdio: 'inherit' });
  console.log('Deployed successfully!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}
