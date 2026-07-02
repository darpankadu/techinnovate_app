import dotenv from 'dotenv';
import { googleAuth, driveFolderId } from '../src/config/google.js';
import { googleDriveService } from '../src/services/googleDriveService.js';

dotenv.config();

console.log('Testing Google Drive Concurrent Large Uploads...');
console.log('Root Folder ID:', driveFolderId);
console.log('Google Auth status:', googleAuth ? 'Configured' : 'Missing');

async function testConcurrentLargeUploads() {
  if (!googleAuth) {
    console.error('Google Auth client not initialized.');
    return;
  }

  try {
    console.log('Generating three 3MB mock image buffers...');
    const buffer1 = Buffer.alloc(3 * 1024 * 1024);
    const base64Data1 = buffer1.toString('base64');
    
    const buffer2 = Buffer.alloc(3 * 1024 * 1024);
    const base64Data2 = buffer2.toString('base64');
    
    const buffer3 = Buffer.alloc(3 * 1024 * 1024);
    const base64Data3 = buffer3.toString('base64');

    const filesToUpload = [
      {
        vehiclePlate: 'CONCURRENT-LARGE-PLATE',
        fillDate: new Date().toISOString().split('T')[0],
        fileName: 'receipt_large_concurrent.png',
        mimeType: 'image/png',
        base64Data: base64Data1
      },
      {
        vehiclePlate: 'CONCURRENT-LARGE-PLATE',
        fillDate: new Date().toISOString().split('T')[0],
        fileName: 'odo_large_concurrent.png',
        mimeType: 'image/png',
        base64Data: base64Data2
      },
      {
        vehiclePlate: 'CONCURRENT-LARGE-PLATE',
        fillDate: new Date().toISOString().split('T')[0],
        fileName: 'pump_large_concurrent.png',
        mimeType: 'image/png',
        base64Data: base64Data3
      }
    ];

    console.log('Starting concurrent uploads of 3 large files...');
    const startTime = Date.now();
    
    const uploadPromises = filesToUpload.map(file => 
      googleDriveService.uploadMedia(file, driveFolderId)
        .then(result => {
          console.log(`Uploaded ${file.fileName} successfully! File ID: ${result.fileId}`);
          return result;
        })
        .catch(err => {
          console.error(`Failed to upload ${file.fileName}:`, err.message);
          throw err;
        })
    );

    const results = await Promise.all(uploadPromises);
    const endTime = Date.now();
    console.log(`\nAll concurrent uploads finished in ${((endTime - startTime) / 1000).toFixed(2)} seconds.`);
    console.log('Results:', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('\nConcurrent Large Upload Test Failed:');
    console.error(error);
  }
}

testConcurrentLargeUploads();
