import dotenv from 'dotenv';
import { google } from 'googleapis';
import { getServiceAccountKey } from '../src/config/envLoader.js';

dotenv.config();

const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
console.log('Target folder to clear:', driveFolderId);

// 1. Setup OAuth2 Client
let oauth2Client = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

// 2. Setup Service Account JWT Client
let jwtClient = null;
try {
  const parsedKey = getServiceAccountKey('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (parsedKey) {
    jwtClient = new google.auth.JWT(
      parsedKey.client_email,
      null,
      parsedKey.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive']
    );
  }
} catch (err) {
  console.warn('Failed to parse Service Account Key:', err.message);
}

async function attemptDelete(client, clientName, fileId, fileName) {
  try {
    const drive = google.drive({ version: 'v3', auth: client });
    console.log(`[${clientName}] Attempting to delete: ${fileName} (${fileId})`);
    await drive.files.delete({ fileId });
    console.log(`[${clientName}] Successfully deleted ${fileName}`);
    return true;
  } catch (error) {
    console.warn(`[${clientName}] Failed to delete:`, error.message);
    return false;
  }
}

async function clearFolder() {
  const clients = [];
  if (oauth2Client) clients.push({ auth: oauth2Client, name: 'OAuth2' });
  if (jwtClient) clients.push({ auth: jwtClient, name: 'ServiceAccount' });

  if (clients.length === 0) {
    console.error('No authenticated clients available.');
    return;
  }

  // Use the first client (OAuth2) to list items
  const drive = google.drive({ version: 'v3', auth: clients[0].auth });
  try {
    const q = `'${driveFolderId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)'
    });
    
    const items = res.data.files || [];
    console.log(`Found ${items.length} items to delete inside the root folder.`);
    
    for (const item of items) {
      let success = false;
      for (const clientObj of clients) {
        success = await attemptDelete(clientObj.auth, clientObj.name, item.id, item.name);
        if (success) break;
      }
      if (!success) {
        console.error(`Failed to delete item ${item.name} (${item.id}) with all available credentials.`);
      }
    }
    console.log('Finished clearing root folder.');
  } catch (error) {
    console.error('Error listing root folder:', error.message);
  }
}

clearFolder();
