

(async () => {
  console.log('Sending sendLoginOTP action to running server...');
  try {
    const start = Date.now();
    const res = await fetch('http://localhost:8080/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendLoginOTP',
        email: 'test_owner_1781683166536@example.com'
      })
    });
    console.log(`Response status: ${res.status} (took ${Date.now() - start}ms)`);
    const json = await res.json();
    console.log('Response JSON:', json);
  } catch (err) {
    console.error('Request failed:', err);
  }
})();
