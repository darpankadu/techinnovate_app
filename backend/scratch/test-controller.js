import { authController } from '../src/controllers/authController.js';

(async () => {
  console.log('Testing authController directly...');
  try {
    const res = await authController.handleSendLoginOTP({ email: 'test_owner_1781683166536@example.com' });
    console.log('Result:', res);
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
})();
