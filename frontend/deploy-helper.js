import { execSync } from 'child_process';

console.log('Building for GitHub Pages...');
process.env.GH_PAGES = 'true';

try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('Deploying to GitHub Pages...');
  execSync('npx gh-pages -d dist -r https://github.com/nil3108/techinnovate_app.git', { stdio: 'inherit' });
  console.log('Deployment successful!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}
