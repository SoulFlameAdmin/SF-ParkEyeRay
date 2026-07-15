const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function transliterateToBulgarian(input) {
  let text = String(input || '').toLowerCase();

  const multi = [
    ['sht', 'щ'], ['zh', 'ж'], ['ch', 'ч'], ['sh', 'ш'],
    ['ts', 'ц'], ['yu', 'ю'], ['iu', 'ю'], ['ya', 'я'], ['ia', 'я'], ['yo', 'йо']
  ];
  for (const [latin, cyrillic] of multi) text = text.replaceAll(latin, cyrillic);

  const map = {
    a:'а', b:'б', c:'ц', d:'д', e:'е', f:'ф', g:'г', h:'х', i:'и',
    j:'дж', k:'к', l:'л', m:'м', n:'н', o:'о', p:'п', q:'я', r:'р',
    s:'с', t:'т', u:'у', v:'в', w:'в', x:'кс', y:'й', z:'з'
  };

  text = text.replace(/[a-z]/g, (char) => map[char] || char);
  text = text
    .replaceAll('воивода', 'войвода')
    .replaceAll('раион', 'район')
    .replaceAll('маика', 'майка')
    .replaceAll('наи', 'най');

  return text.replace(/\s+/g, ' ').trim();
}

function normalizeStreetName(value) {
  return transliterateToBulgarian(value)
    .replace(/\d+[а-яa-z]?/gi, ' ')
    .replace(/[.,;:'"()\-–—/\\]/g, ' ')
    .replace(/\b(улица|ул|булевард|бул|площад|пл|жк|квартал|кв|българия)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haversineMeters(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function levenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const previous = Array.from({ length:right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function similarity(a, b) {
  const left = normalizeStreetName(a);
  const right = normalizeStreetName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenScore = shared / Math.max(leftTokens.size, rightTokens.size, 1);
  const editScore = 1 - levenshtein(left, right) / Math.max(left.length, right.length, 1);
  return Math.max(tokenScore, editScore * 0.9);
}

async function nominatimSearch(query, bias) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'bg');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'bg');
  url.searchParams.set('dedupe', '1');

  if (bias) {
    const spread = 0.65;
    url.searchParams.set('viewbox', `${bias.lon - spread},${bias.lat + spread},${bias.lon + spread},${bias.lat - spread}`);
    url.searchParams.set('bounded', '0');
  }

  const response = await fetch(url, {
    headers: {
      accept:'application/json',
      'user-agent':'ParkEyeRay/1.2 (https://sf-parkeyeray.vercel.app)'
    }
  });
  if (!response.ok) throw new Error(`Geocoder ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function callOverpass(query) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch(endpoint, {
        method:'POST',
        headers:{
          'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent':'ParkEyeRay/1.2 (https://sf-parkeyeray.vercel.app)'
        },
        body:new URLSearchParams({ data:query }),
        signal:controller.signal
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload?.elements) ? payload.elements : [];
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Overpass unavailable');
}

async function nearbyStreetFallback(target, bias) {
  if (!bias) return [];

  const normalized = normalizeStreetName(target);
  const words = normalized.split(' ').filter((word) => word.length >= 3);
  if (!words.length) return [];

  const stems = [...new Set(words
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((word) => word.slice(0, Math.max(3, word.length - 1))))];

  const clauses = stems.map((stem) => {
    const safe = stem.replace(/["\\]/g, '\\$&');
    return `way(around:25000,${bias.lat},${bias.lon})["highway"]["name"~"${safe}",i];`;
  }).join('\n');

  const query = `[out:json][timeout:20];\n(${clauses}\n);\nout center tags;`;
  const elements = await callOverpass(query);

  return elements
    .map((element) => {
      const name = element.tags?.name;
      const lat = Number(element.center?.lat);
      const lon = Number(element.center?.lon);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const matchScore = similarity(normalized, name);
      const distance = haversineMeters(bias, { lat, lon });
      return {
        name:`ул. ${name} — приблизителна точка`,
        lat,
        lon,
        type:'street',
        importance:matchScore,
        distance,
        matchedQuery:normalized,
        source:'nearby-street',
        matchScore
      };
    })
    .filter((item) => item && item.matchScore >= 0.38)
    .sort((a, b) => {
      if (Math.abs(b.matchScore - a.matchScore) > 0.08) return b.matchScore - a.matchScore;
      return a.distance - b.distance;
    })
    .slice(0, 6);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Method not allowed' });
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2 || q.length > 140) {
    return res.status(400).json({ error:'Invalid search query' });
  }

  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  const bias = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

  const transliterated = transliterateToBulgarian(q);
  const withoutHouseNumber = transliterated.replace(/(?:,|\s)\s*\d+[а-яa-z]?\s*$/i, '').trim();
  const variants = [...new Set([q, transliterated, withoutHouseNumber].filter(Boolean))];

  try {
    const collected = [];
    for (const variant of variants) {
      const batch = await nominatimSearch(variant, bias);
      collected.push(...batch.map((item) => ({ ...item, queryVariant:variant })));
      if (collected.length >= 8) break;
    }

    const seen = new Set();
    let results = collected
      .map((item) => {
        const itemLat = Number(item.lat);
        const itemLon = Number(item.lon);
        if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return null;
        const key = `${itemLat.toFixed(6)},${itemLon.toFixed(6)}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          name:item.display_name,
          lat:itemLat,
          lon:itemLon,
          type:item.type || '',
          importance:Number(item.importance || 0),
          distance:bias ? haversineMeters(bias, { lat:itemLat, lon:itemLon }) : null,
          matchedQuery:item.queryVariant,
          source:'nominatim'
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (bias && Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
          const delta = a.distance - b.distance;
          if (Math.abs(delta) > 250) return delta;
        }
        return b.importance - a.importance;
      })
      .slice(0, 8);

    if (!results.length) {
      results = await nearbyStreetFallback(withoutHouseNumber || transliterated, bias);
    }

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=900');
    return res.status(200).json({ results, normalizedQuery:transliterated, variants });
  } catch (error) {
    return res.status(502).json({
      error:'Address search is temporarily unavailable',
      detail:error?.message || 'Unknown error'
    });
  }
}
