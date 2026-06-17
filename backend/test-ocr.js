import app from './src/app.js';
import http from 'http';

const PORT = 8099;
const server = app.listen(PORT, () => {
  console.log(`[TEST] OCR Test server started on port ${PORT}`);
  
  // Post mock 1x1 pixel black PNG image
  const postData = JSON.stringify({
    base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    type: 'odometer'
  });
  
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/ocr',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('\n[TEST] Received response from OCR route:');
      console.log(JSON.stringify(JSON.parse(data), null, 2));
      
      server.close(() => {
        console.log('[TEST] Server closed. Exiting test.');
        process.exit(0);
      });
    });
  });
  
  req.on('error', (err) => {
    console.error('[TEST] Request failed:', err.message);
    server.close(() => {
      process.exit(1);
    });
  });
  
  req.write(postData);
  req.end();
});
