// server.js (ESM)
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(bodyParser.json());

const codes = {}; // { email: { code, expires } }

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000);
}

async function sendCode(email) {
  const code = generateCode();
  const ttlMin = Number(process.env.OTP_TTL_MIN || 10);
  codes[email] = { code, expires: Date.now() + ttlMin * 60 * 1000 };

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // без интервали!
    },
  });

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'ParkEyeRay'}" <${process.env.EMAIL_FROM_ADDR || process.env.SMTP_USER}>`,
    to: email,
    subject: 'Вашият код за потвърждение',
    text: `Вашият код е: ${code}`,
  });

  console.log(`Код ${code} изпратен до ${email}`);
}

app.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Липсва имейл' });
    await sendCode(email);
    res.json({ message: 'Кодът е изпратен, проверете пощата си.' });
  } catch (err) {
    console.error('Грешка при изпращане:', err);
    res.status(500).json({ error: 'Неуспешно изпращане на кода.' });
  }
});

app.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Липсва имейл' });
    await sendCode(email);
    res.json({ message: 'Нов код е изпратен успешно!' });
  } catch (err) {
    console.error('Грешка при изпращане:', err);
    res.status(500).json({ error: 'Неуспешно изпращане на кода.' });
  }
});

app.post('/verify-code', (req, res) => {
  const { email, code } = req.body || {};
  const rec = codes[email];
  if (!rec) return res.status(400).json({ error: 'Няма код за този имейл.' });
  if (Date.now() > rec.expires) {
    delete codes[email];
    return res.status(400).json({ error: 'Кодът е изтекъл. Изпратете отново.' });
  }
  if (parseInt(code, 10) !== rec.code) {
    return res.status(400).json({ success: false, error: 'Грешен код.' });
  }
  delete codes[email];
  res.json({ success: true, message: 'Кодът е потвърден успешно!' });
});

const PORT = Number(process.env.PORT) || 4100;
app.listen(PORT, () => console.log(`Сървърът слуша на порт ${PORT}`));
