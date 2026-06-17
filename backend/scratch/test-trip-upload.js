import dotenv from 'dotenv';
import { googleAuth, driveFolderId } from '../src/config/google.js';
import { googleDriveService } from '../src/services/googleDriveService.js';

dotenv.config();

console.log('Testing Google Drive Trip Media Routing...');
console.log('Root Folder ID:', driveFolderId);
console.log('Google Auth status:', googleAuth ? 'Configured' : 'Missing');

async function testTripUpload() {
  if (!googleAuth) {
    console.error('Google Auth client not initialized.');
    return;
  }

  try {
    // 1x1 black pixel PNG in base64
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const testData = {
      vehiclePlate: 'GJ01BR9999',
      fillDate: new Date().toISOString().split('T')[0],
      fileName: 'video_dashcam_test.webm',
      mimeType: 'video/webm',
      base64Data
    };

    console.log('Starting upload of mock video...');
    const result = await googleDriveService.uploadMedia(testData, driveFolderId);
    console.log('Upload Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Upload Failed with Error:');
    console.error(error);
  }
}

testTripUpload();
