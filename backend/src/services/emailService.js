import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;
const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
} else {
  console.log('INFO: SMTP credentials not provided. OTP emails will be output directly to the server logs.');
}

export const emailService = {
  async sendEmail({ to, subject, htmlBody }) {
    // Extract and log OTP code for test automation / debugging
    const otpMatch = htmlBody.match(/dashed #cbd5e0\s*".*?>\s*(\d{6})\s*<\/div>/s) || htmlBody.match(/>\s*(\d{6})\s*</) || htmlBody.match(/(\d{6})/);
    const extractedOtp = otpMatch ? otpMatch[1].trim() : null;
    if (extractedOtp) {
      console.log(`[Extracted OTP Verification Code]: ${extractedOtp}`);
    }

    if (smtpConfigured && transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to,
          subject,
          html: htmlBody
        });
        return true;
      } catch (err) {
        console.error(`Error sending email to ${to} via SMTP:`, err.message);
        throw err;
      }
    } else {
      console.log('\n================================ MOCK EMAIL SENT ================================');
      console.log(`TO:      ${to}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`BODY:`);
      console.log(`[Extracted OTP Verification Code]: ${extractedOtp || 'Could not extract OTP'}`);
      console.log('=================================================================================\n');
      return true;
    }
  }
};
