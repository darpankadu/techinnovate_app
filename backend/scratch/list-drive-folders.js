import dotenv from 'dotenv';
import { google } from 'googleapis';
import { getServiceAccountKey } from '../src/config/envLoader.js';

dotenv.config();

async function listFolders() {
  try {
    const parsedKey = getServiceAccountKey('GOOGLE_SERVICE_ACCOUNT_KEY');
    if (!parsedKey) {
      console.error('Failed to load Service Account Key.');
      return;
    }

    const auth = new google.auth.JWT(
      parsedKey.client_email,
      null,
      parsedKey.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });

    console.log('Querying Google Drive files/folders visible to:', parsedKey.client_email);
    
    const res = await drive.files.list({
      q: "trashed = false",
      fields: 'files(id, name, mimeType, owners, parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const items = res.data.files || [];
    console.log(`Found ${items.length} item(s):`);
    items.forEach(item => {
      console.log(`- Name: "${item.name}", ID: "${item.id}", Type: "${item.mimeType}", Parents: ${JSON.stringify(item.parents)}`);
    });

  } catch (error) {
    console.error('Error listing Google Drive folders:', error);
  }
}

listFolders();
