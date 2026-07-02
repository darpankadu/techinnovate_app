import dotenv from 'dotenv';
import { googleAuth, driveFolderId } from '../src/config/google.js';
import { googleDriveService } from '../src/services/googleDriveService.js';

dotenv.config();

console.log('Testing large upload...');
console.log('Root Folder ID:', driveFolderId);
console.log('Google Auth status:', googleAuth ? 'Configured' : 'Missing');

async function testLargeUpload() {
  if (!googleAuth) {
    console.error('Google Auth client not initialized.');
    return;
  }

  try {
    // Generate 3MB of base64 data (mocking a real photo)
    console.log('Generating 3MB mock image buffer...');
    const buffer = Buffer.alloc(3 * 1024 * 1024); // 3MB zero-filled buffer
    const base64Data = buffer.toString('base64');
    console.log('Generated base64 data length:', base64Data.length);

    const testData = {
      vehiclePlate: 'LARGE-TEST-PLATE',
      fillDate: new Date().toISOString().split('T')[0],
      fileName: 'large_receipt_test.jpg',
      mimeType: 'image/jpeg',
      base64Data
    };

    console.log('Starting upload of large file...');
    const startTime = Date.now();
    const result = await googleDriveService.uploadMedia(testData, driveFolderId);
    const endTime = Date.now();
    console.log(`Upload finished in ${((endTime - startTime) / 1000).toFixed(2)} seconds.`);
    console.log('Upload Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Upload Failed with Error:');
    console.error(error);
  }
}

testLargeUpload();
