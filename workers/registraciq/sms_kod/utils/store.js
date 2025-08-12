// In-memory store: phone -> { code, expiresAt, cooldownUntil }
const store = new Map();

const COOLDOWN_MS = 60 * 1000; // 60 seconds
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export const codesStore = {
  COOLDOWN_MS,
  TTL_MS,
  set: (phone, data) => {
    store.set(phone, data);
    setTimeout(() => store.delete(phone), TTL_MS + 60*1000);
  },
  get: (phone) => store.get(phone),
  delete: (phone) => store.delete(phone)
};
