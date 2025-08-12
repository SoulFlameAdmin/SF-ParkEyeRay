# ParkEyeRay — `sms_kod`

Backend (Node.js) that sends **real SMS verification codes** via **Twilio**.
Message text: `SF • Soulsflame • ParkEyeRay: Код за регистрация: ######`

## Quick start
```bash
cd sms_kod
npm install
copy .env.example .env   # Windows
# fill the .env with your Twilio SID, token and FROM number
npm start
# -> http://localhost:4000/health  should return { ok: true }
```

## API
- `POST /api/sms/send`  body: `{ "phone": "+35988XXXXXXX" }`
- `POST /api/sms/verify` body: `{ "phone": "+35988XXXXXXX", "code": "123456" }`

Validation rules (as requested):
- If phone starts with `+` → total length must be **12** characters (`+` + 11 digits).
- If no `+` → exactly **10** digits. Backend will normalize to `+<DEFAULT_COUNTRY_CODE>`.

The code is valid for **10 minutes**. Cooldown between send attempts: **60 seconds**.

## cURL quick test
```bash
curl -X POST http://localhost:4000/api/sms/send ^
  -H "Content-Type: application/json" ^
  -d "{\"phone\": \"+35988XXXXXXX\"}"
```

```bash
curl -X POST http://localhost:4000/api/sms/verify ^
  -H "Content-Type: application/json" ^
  -d "{\"phone\": \"+35988XXXXXXX\", \"code\": \"123456\"\"}"
```
