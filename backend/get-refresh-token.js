import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import opn from 'open'; // We can use direct console print and let them click or open automatically
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in backend/.env!');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // crucial to get refresh token
    prompt: 'consent',     // force consent screen to ensure refresh token is returned
    scope: ['https://www.googleapis.com/auth/drive']
  });

  // Start local server to receive redirect
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const query = url.parse(req.url, true).query;
        const code = query.code;

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Successful!</h1><p>You can close this tab and return to the terminal.</p>');

          // Exchange code for tokens
          console.log('\nExchanging authorization code for tokens...');
          const { tokens } = await oauth2Client.getToken(code);
          
          if (tokens.refresh_token) {
            console.log('\n==================================================');
            console.log('SUCCESS! YOUR NEW GOOGLE REFRESH TOKEN:');
            console.log('--------------------------------------------------');
            console.log(tokens.refresh_token);
            console.log('==================================================\n');
            console.log('1. Copy the token above.');
            console.log('2. Update your backend/.env file:');
            console.log(`   GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
            console.log('3. Update the GOOGLE_REFRESH_TOKEN environment variable in Vercel settings.');
            console.log('4. Redeploy the backend to Vercel to apply the change.');
          } else {
            console.log('\nWARNING: No refresh token returned. This usually happens if you did not grant permission or if you authorized recently without revoking access first.');
            console.log('Try visiting: https://myaccount.google.com/connections to remove access for your app, and run this script again.');
          }

          server.close(() => {
            process.exit(0);
          });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Authorization code missing.');
        }
      }
    } catch (err) {
      console.error('Error during token exchange:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error.');
      server.close(() => {
        process.exit(1);
      });
    }
  });

  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`Google OAuth Authorizer running on port ${PORT}`);
    console.log(`==================================================\n`);
    console.log(`Please click the link below to authorize the application with your Google Account:\n`);
    console.log(authUrl);
    console.log(`\n==================================================\n`);
    
    // Automatically open browser
    try {
      // Direct command to start URL in default browser based on OS
      const command = process.platform === 'win32' ? 'start' : 'open';
      const exec = import('child_process').then(cp => {
        cp.exec(`${command} "${authUrl.replace(/&/g, '^&')}"`);
      });
    } catch (e) {
      // Ignore open failure, they can copy-paste the link
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
