'use strict';

const KARAI_API = 'https://karai.bg/api/fuel-prices';
const KARAI_PAGE = 'https://karai.bg/fuel-prices';
const TIMEOUT_MS = 8000;

const BRAND_ALIASES = new Map([
  ['shell', 'shell'], ['шел', 'shell'],
  ['omv', 'omv'],
  ['lukoil', 'lukoil'], ['лукойл', 'lukoil'],
  ['petrol', 'petrol'], ['петрол', 'petrol'],
  ['eko', 'eko'], ['еко', 'eko'],
  ['rompetrol', 'rompetrol'],
  ['cruise', 'kruiz'], ['kruiz', 'kruiz'], ['круиз', 'kruiz'],
  ['eko petrol', 'eko-petrol'], ['eco petrol', 'eko-petrol'], ['еко петрол', 'eko-petrol'],
  ['dieselor', 'dieselor'], ['дизелор', 'dieselor'],
  ['gazprom', 'gazprom'], ['газпром', 'gazprom']
]);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function cleanText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
}

function brandKey(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (BRAND_ALIASES.has(text)) return BRAND_ALIASES.get(text);
  for (const [alias, key] of BRAND_ALIASES) {
    if (text.includes(alias)) return key;
  }
  return null;
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').replace(',', '.');
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function keyValue(obj, names) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const entries = Object.entries(obj);
  for (const wanted of names) {
    const found = entries.find(([key]) => cleanText(key).replace(/\s+/g, '') === wanted);
    if (found) {
      const value = numberValue(found[1]);
      if (value != null) return value;
    }
  }
  return null;
}

function fuelSet(obj) {
  return {
    a95: keyValue(obj, ['a95', '95', 'petrol', 'petrol95', 'gasoline', 'gasoline95', 'benzin', 'benzin95']),
    diesel: keyValue(obj, ['diesel', 'dizel', 'motorina']),
    lpg: keyValue(obj, ['lpg', 'autogas', 'autogaz', 'gas', 'gaz']),
    cng: keyValue(obj, ['cng', 'methane', 'metan'])
  };
}

function hasFuel(prices) {
  return Object.values(prices).some(value => value != null);
}

function displayName(key) {
  return ({
    shell: 'Shell', omv: 'OMV', lukoil: 'Lukoil', petrol: 'Petrol', eko: 'Eko',
    rompetrol: 'Rompetrol', kruiz: 'Круиз', 'eko-petrol': 'Еко Петрол',
    dieselor: 'Dieselor', gazprom: 'Газпром'
  })[key] || key;
}

function extractBrands(root) {
  const found = new Map();
  const seen = new Set();

  function add(key, obj) {
    if (!key || !obj || typeof obj !== 'object') return;
    const prices = fuelSet(obj);
    if (!hasFuel(prices)) return;
    const previous = found.get(key) || { key, name: displayName(key), prices: {} };
    previous.prices = { ...previous.prices };
    for (const [fuel, price] of Object.entries(prices)) if (price != null) previous.prices[fuel] = price;
    found.set(key, previous);
  }

  function walk(node, depth = 0) {
    if (node == null || depth > 8) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(item => walk(item, depth + 1));
      return;
    }

    const explicitName = node.brand ?? node.name ?? node.chain ?? node.operator ?? node.network ?? node.company;
    add(brandKey(explicitName), node);

    for (const [key, value] of Object.entries(node)) {
      const implicitBrand = brandKey(key);
      if (implicitBrand && value && typeof value === 'object') add(implicitBrand, value);
      walk(value, depth + 1);
    }
  }

  walk(root);
  return [...found.values()];
}

function extractAverage(root) {
  const candidates = [];
  const seen = new Set();
  function walk(node, depth = 0) {
    if (node == null || depth > 6 || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) {
      const prices = fuelSet(node);
      const score = Object.values(prices).filter(v => v != null).length;
      const hint = cleanText(node.type ?? node.label ?? node.name ?? node.scope ?? '');
      if (score >= 2 && /(average|avg|national|bulgaria|средн|българ)/.test(hint)) candidates.push({ score: score + 3, prices });
      else if (score >= 3) candidates.push({ score, prices });
    }
    Object.values(node).forEach(value => walk(value, depth + 1));
  }
  walk(root);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.prices || {};
}

function extractUpdated(root) {
  const keys = ['updated', 'updatedat', 'updated_at', 'date', 'asof', 'as_of', 'retrievedat'];
  let answer = null;
  const seen = new Set();
  function walk(node, depth = 0) {
    if (answer || node == null || depth > 6 || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        const normalized = cleanText(key).replace(/\s+/g, '');
        if (keys.includes(normalized) && typeof value === 'string' && value.length >= 8) { answer = value; return; }
      }
    }
    Object.values(node).forEach(value => walk(value, depth + 1));
  }
  walk(root);
  return answer;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'accept': 'application/json', 'user-agent': 'SoulFlame-ParkEyeRay/2.1 (+https://sf-parkeyeray.vercel.app)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`karai_http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  try {
    const raw = await fetchJson(KARAI_API);
    const brands = extractBrands(raw);
    const average = extractAverage(raw);
    const updatedAt = extractUpdated(raw);
    res.setHeader('cache-control', 's-maxage=900, stale-while-revalidate=3600');
    return send(res, 200, {
      brands,
      average,
      meta: {
        source: 'KARAI',
        sourceUrl: KARAI_PAGE,
        apiUrl: KARAI_API,
        updatedAt,
        fetchedAt: new Date().toISOString(),
        precision: 'chain_or_national',
        stationPriceExact: false,
        attributionRequired: true,
        live: true
      }
    });
  } catch (error) {
    return send(res, 502, {
      error: 'fuel_price_source_unavailable',
      retryable: true,
      source: 'KARAI',
      detail: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)
    });
  }
}

module.exports = handler;
module.exports._test = { brandKey, numberValue, fuelSet, extractBrands, extractAverage, extractUpdated };
