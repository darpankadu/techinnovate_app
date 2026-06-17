import { google } from 'googleapis';
import dotenv from 'dotenv';
import { getServiceAccountKey } from './envLoader.js';

dotenv.config();

let googleAuth = null;
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

try {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/oauth2callback'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    googleAuth = oauth2Client;
    console.log('Google APIs OAuth2 Client configured successfully.');
  } else {
    const parsedKey = getServiceAccountKey('GOOGLE_SERVICE_ACCOUNT_KEY');
    if (parsedKey) {
      googleAuth = new google.auth.JWT(
        parsedKey.client_email,
        null,
        parsedKey.private_key.replace(/\\n/g, '\n'), // Ensure newlines are correctly handled
        [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/cloud-platform'
        ]
      );
      console.log('Google APIs JWT Auth Client configured successfully.');
    } else {
      console.warn('WARNING: Neither GOOGLE_REFRESH_TOKEN nor GOOGLE_SERVICE_ACCOUNT_KEY could be loaded.');
    }
  }
} catch (error) {
  console.error('ERROR: Failed to configure Google APIs Client:', error.message);
}

export { googleAuth, google, spreadsheetId, driveFolderId };
