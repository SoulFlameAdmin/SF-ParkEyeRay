import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { client } from './services/twilioClient.js';
import { codesStore } from './utils/store.js';
import { isValidPhone, normalizeE164, genCode, now } from './utils/validation.js';

const app = express();
const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.ORIGIN || '*';

app.use(cors({ origin: ORIGIN, credentials: false }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sms/send', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Невалиден телефонен номер.' });
    }
    const to = normalizeE164(phone);
    const rec = codesStore.get(to);
    if (rec && rec.cooldownUntil && now() < rec.cooldownUntil) {
      const wait = Math.ceil((rec.cooldownUntil - now())/1000);
      return res.status(429).json({ ok: false, error: `Изчакай ${wait}s преди нов SMS.` });
    }

    const code = genCode();
    const body = `SF • Soulsflame • ParkEyeRay: Код за регистрация: ${code}`;

    await client.messages.create({
      body,
      from: process.env.TWILIO_FROM,
      to
    });

    codesStore.set(to, {
      code,
      expiresAt: now() + codesStore.TTL_MS,
      cooldownUntil: now() + codesStore.COOLDOWN_MS
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('SEND ERROR:', e?.message || e);
    res.status(500).json({ ok: false, error: 'Грешка при изпращане на SMS.' });
  }
});

app.post('/api/sms/verify', (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Невалиден телефон.' });
    if (!/^\d{6}$/.test(code || '')) return res.status(400).json({ ok: false, error: 'Кодът трябва да е 6 цифри.' });

    const to = normalizeE164(phone);
    const rec = codesStore.get(to);
    if (!rec) return res.status(400).json({ ok: false, error: 'Няма изпратен код за този номер.' });
    if (now() > rec.expiresAt) {
      codesStore.delete(to);
      return res.status(400).json({ ok: false, error: 'Кодът е изтекъл. Изпрати нов.' });
    }
    if (code !== rec.code) return res.status(400).json({ ok: false, error: 'Невалиден код.' });

    codesStore.delete(to);
    res.json({ ok: true });
  } catch (e) {
    console.error('VERIFY ERROR:', e?.message || e);
    res.status(500).json({ ok: false, error: 'Грешка при проверка на кода.' });
  }
});

app.listen(PORT, () => {
  console.log(`SMS server listening on http://localhost:${PORT}`);
});
