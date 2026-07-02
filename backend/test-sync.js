import app from './src/app.js';
import http from 'http';

const PORT = 8099;
const server = app.listen(PORT, () => {
  console.log(`[TEST] Test server started on port ${PORT}`);
  
  // Query status endpoint
  http.get(`http://localhost:${PORT}/api/status`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('\n[TEST] Received response from status route:');
      console.log(JSON.stringify(JSON.parse(data), null, 2));
      console.log('\n[TEST] Architecture compilation and routing verification: PASSED');
      
      server.close(() => {
        console.log('[TEST] Server closed. Exiting test.');
        process.exit(0);
      });
    });
  }).on('error', (err) => {
    console.error('[TEST] Request failed:', err.message);
    server.close(() => {
      process.exit(1);
    });
  });
});
