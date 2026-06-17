import { googleAuth, google } from '../config/google.js';
import { Readable } from 'stream';

const getDriveClient = () => {
  if (!googleAuth) throw new Error('Google Drive API is not authenticated.');
  return google.drive({ version: 'v3', auth: googleAuth });
};

const folderCreationPromises = {};

async function getOrCreateFolder(parentFolderId, folderName) {
  const cacheKey = `${parentFolderId}_${folderName}`;
  
  if (folderCreationPromises[cacheKey]) {
    return folderCreationPromises[cacheKey];
  }
  
  const promise = (async () => {
    const drive = getDriveClient();
    const q = `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    
    const listRes = await drive.files.list({
      q,
      fields: 'files(id)'
    });
    
    const files = listRes.data.files || [];
    if (files.length > 0) {
      return files[0].id;
    }
    
    // Create folder
    const createRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      },
      fields: 'id'
    });
    
    return createRes.data.id;
  })();
  
  folderCreationPromises[cacheKey] = promise;
  
  try {
    const folderId = await promise;
    return folderId;
  } finally {
    delete folderCreationPromises[cacheKey];
  }
}

export const googleDriveService = {
  async uploadMedia(data, rootFolderId) {
    const drive = getDriveClient();
    
    const plate = (data.vehiclePlate || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
    const fillDate = data.fillDate || new Date().toISOString().split('T')[0];
    
    // 1. Determine super category folder (trip media for videos/trip odometer, cng media for others)
    let superCategory = 'cng media';
    if (data.fileName.startsWith('video_') || data.fileName.startsWith('trip_')) {
      superCategory = 'trip media';
    }
    
    // 2. Get or create super category folder under root folder
    const superFolderId = await getOrCreateFolder(rootFolderId, superCategory);
    
    // 3. Get or create vehicle folder under the super category folder
    const vehicleFolderId = await getOrCreateFolder(superFolderId, plate);
    
    // 4. Get or create date folder under vehicle folder
    const dateFolderId = await getOrCreateFolder(vehicleFolderId, fillDate);
    
    // 5. Decode base64
    const buffer = Buffer.from(data.base64Data, 'base64');
    
    // 6. Create stream
    const mediaStream = Readable.from(buffer);
    
    // 7. Upload file
    const fileMetadata = {
      name: data.fileName,
      parents: [dateFolderId]
    };
    
    const media = {
      mimeType: data.mimeType || 'image/jpeg',
      body: mediaStream
    };
    
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });
    
    const fileId = file.data.id;
    
    // 6. Make file public (anyone with link can view)
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permError) {
      console.warn(`Failed to set public view permissions for file ${fileId}:`, permError.message);
    }
    
    return {
      success: true,
      fileUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      fileId
    };
  }
};
