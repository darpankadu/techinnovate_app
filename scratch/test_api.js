async function test() {
  const url = 'https://script.google.com/macros/s/AKfycbzUpsxThHu-3tE509FcKe6TyMRsqXX2k6t7_F-FPjN7P6dD6j4ZWyBmCwNxjUX59tu2gA/exec';
  try {
    console.log('Fetching data from Apps Script...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getData' })
    });
    const text = await response.text();
    const data = JSON.parse(text);
    if (data.success && data.fills) {
      console.log(`Total fills retrieved: ${data.fills.length}`);
      console.log('Last 2 fills completely:');
      console.log(JSON.stringify(data.fills.slice(-2), null, 2));
    } else {
      console.log('API responded with failure or empty fills:', data);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

test();
