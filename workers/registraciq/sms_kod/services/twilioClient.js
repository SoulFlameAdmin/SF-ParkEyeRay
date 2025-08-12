import twilio from 'twilio';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;

if (!SID || !TOKEN || !FROM) {
  console.warn('[sms_kod] ВНИМАНИЕ: Липсват Twilio променливи в .env');
}

export const client = twilio(SID, TOKEN);
