import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error('[Browser Error/Crash]', err.toString());
  });

  console.log('Navigating to live site...');
  await page.goto('https://nil3108.github.io/techinnovate_app/', { waitUntil: 'networkidle2' });

  console.log('Setting up mock session and data in localStorage...');
  await page.evaluate(() => {
    const sessionObj = { role: 'driver', userId: 'driver123', ownerId: 'owner123', name: 'Test Driver' };
    sessionStorage.setItem('cng_session', JSON.stringify(sessionObj));

    const activeTripObj = {
      id: 'trip123',
      driverId: 'driver123',
      driverName: 'Test Driver',
      vehicleId: 'GJ01AB1234',
      ownerId: 'owner123',
      status: 'active',
      start: {
        time: new Date().toISOString(),
        odoReading: 10000,
        odoPhotoUrl: '',
        gps: null
      },
      end: null,
      refuelIds: [],
      distanceKms: 0,
      fuelConsumedKgs: 0
    };
    localStorage.setItem('cng_active_trip_driver123', JSON.stringify(activeTripObj));

    const vehiclesList = [{ id: 'veh123', plate: 'GJ01AB1234', ownerId: 'owner123' }];
    localStorage.setItem('cng_vehicles', JSON.stringify(vehiclesList));

    const driversList = [{ id: 'driver123', name: 'Test Driver', assignedVehicleId: 'GJ01AB1234', code: '1234' }];
    localStorage.setItem('cng_drivers', JSON.stringify(driversList));
  });

  console.log('Reloading page to apply mock session...');
  await page.reload({ waitUntil: 'networkidle2' });

  console.log('Waiting for driver dashboard to load...');
  await new Promise(res => setTimeout(res, 5000));

  // Click CNG Fill-up module card first
  console.log('Clicking "CNG Fill-up" module card...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    console.log('Dashboard buttons:', JSON.stringify(buttons.map(b => b.textContent?.trim())));
    const moduleBtn = buttons.find(b => b.textContent?.toLowerCase().includes('cng fill-up') || b.textContent?.toLowerCase().includes('cng fill'));
    if (moduleBtn) {
      moduleBtn.click();
    } else {
      throw new Error('CNG Fill-up module card not found');
    }
  });

  // Wait for module view transition
  await new Promise(res => setTimeout(res, 2000));

  // Click Record CNG Fill
  console.log('Clicking "Record CNG Fill"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    console.log('Available buttons inside CNG module:', JSON.stringify(buttons.map(b => b.textContent?.trim())));
    const fillBtn = buttons.find(b => b.textContent?.toLowerCase().includes('record cng'));
    if (fillBtn) {
      fillBtn.click();
    } else {
      throw new Error('Record CNG Fill button not found');
    }
  });

  // Wait for transition to wizard
  console.log('Waiting for FillWizard to render...');
  await new Promise(res => setTimeout(res, 3000));

  console.log('Taking a screenshot of the CNG filling flow...');
  await page.screenshot({ path: 'live-cng-debug.png' });
  console.log('Screenshot saved to live-cng-debug.png');

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('DOM HTML:', html);

  await browser.close();
})();
