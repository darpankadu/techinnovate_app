import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const clientStatus = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET
};

if (!clientStatus.clientId || !clientStatus.clientSecret) {
  console.error('\nError: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env file first!');
  console.error('Please add them to C:\\backend cng fleet\\.env and run this script again.\n');
  process.exit(1);
}

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  clientStatus.clientId,
  clientStatus.clientSecret,
  REDIRECT_URI
);

// Generate the authorization URL
const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // Force consent screen to ensure refresh token is always returned
  scope: scopes
});

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/oauth2callback') {
      const code = parsedUrl.query.code;
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization Failed</h1><p>No authorization code received.</p>');
        return;
      }
      
      console.log('Authorization code received. Exchanging for tokens...');
      const { tokens } = await oauth2Client.getToken(code);
      
      const refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Warning</h1><p>Authorization succeeded but no Refresh Token was returned. Try removing access for this app in your Google Account settings and re-authenticating.</p>');
        console.warn('Warning: No Refresh Token was returned. Make sure to choose "Consent" prompt.');
        return;
      }
      
      console.log('Refresh token successfully retrieved.');
      
      // Update .env file
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      const tokenLine = `GOOGLE_REFRESH_TOKEN="${refreshToken}"`;
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN\s*=\s*.*?(?:\r?\n|$)/g, `${tokenLine}\n`);
      } else {
        envContent += `\n${tokenLine}\n`;
      }
      
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log(`Saved GOOGLE_REFRESH_TOKEN to ${envPath}`);
      
      // Respond to browser
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 100px; background-color: #f7fafc; color: #2d3748;">
            <div style="max-width: 500px; margin: 0 auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h1 style="color: #48bb78; margin-bottom: 20px;">✓ Authentication Successful!</h1>
              <p style="font-size: 16px; line-height: 1.6;">The Google Drive Refresh Token has been successfully retrieved and saved to your backend <b>.env</b> file.</p>
              <p style="color: #718096; margin-top: 20px; font-size: 14px;">You can now close this browser tab and return to your terminal.</p>
            </div>
          </body>
        </html>
      `);
      
      // Shut down server
      console.log('Closing server...');
      server.close(() => {
        console.log('OAuth2 Authorization flow complete.');
        process.exit(0);
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Internal Server Error</h1><p>${error.message}</p>`);
  }
});

server.listen(PORT, () => {
  console.log('\n================================================================');
  console.log(`OAuth2 Redirect Server running on http://localhost:${PORT}`);
  console.log('================================================================\n');
  console.log('Please open the following link in your web browser to authenticate:\n');
  console.log(authUrl);
  console.log('\n================================================================\n');
});
