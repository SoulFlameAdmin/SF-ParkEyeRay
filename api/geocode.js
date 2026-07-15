const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
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
  return text
    .replaceAll('воивода', 'войвода')
    .replaceAll('раион', 'район')
    .replaceAll('маика', 'майка')
    .replaceAll('наи', 'най')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStreetName(value) {
  return transliterateToBulgarian(value)
    .replace(/\d+[а-яa-z]?/gi, ' ')
    .replace(/[.,;:'"()\-–—/\\]/g, ' ')
    .replace(/(улица|ул|булевард|бул|площад|пл|жк|квартал|кв|българия)/gi, ' ')
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
  const row = Array.from({ length:right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return row[right.length];
}

function similarity(a, b) {
  const left = normalizeStreetName(a);
  const right = normalizeStreetName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.94;

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
    headers:{ accept:'application/json', 'user-agent':'ParkEyeRay/1.3 (https://sf-parkeyeray.vercel.app)' }
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function nominatimAddressSearch(street, houseNumber, city, bias) {
  if (!street || !city) return [];
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('street', [houseNumber, street].filter(Boolean).join(' '));
  url.searchParams.set('city', city);
  url.searchParams.set('country', 'България');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'bg');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'bg');
  if (bias) {
    const spread = 0.65;
    url.searchParams.set('viewbox', `${bias.lon - spread},${bias.lat + spread},${bias.lon + spread},${bias.lat - spread}`);
    url.searchParams.set('bounded', '0');
  }

  const response = await fetch(url, {
    headers:{ accept:'application/json', 'user-agent':'ParkEyeRay/1.4 (https://parkeyeray.com)' }
  });
  if (!response.ok) throw new Error(`Nominatim address ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function likelyStreetSpellings(value) {
  const input = String(value || '').trim();
  return [...new Set([
    input,
    input.replace(/янка\s+войвода/giu, 'янко войвода'),
    input.replace(/йанко\s+войвода/giu, 'янко войвода')
  ].filter(Boolean))];
}

async function reverseContext(bias) {
  if (!bias) return null;
  const url = new URL(NOMINATIM_REVERSE_ENDPOINT);
  url.searchParams.set('lat', String(bias.lat));
  url.searchParams.set('lon', String(bias.lon));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'bg');
  url.searchParams.set('zoom', '14');
  const response = await fetch(url, {
    headers:{ accept:'application/json', 'user-agent':'ParkEyeRay/1.4 (https://parkeyeray.com)' }
  });
  if (!response.ok) throw new Error(`Nominatim reverse ${response.status}`);
  const data = await response.json();
  const address = data?.address || {};
  const city = address.city || address.town || address.village || address.municipality || address.county || '';
  return city ? { city, displayName:data.display_name || city } : null;
}

async function photonSearch(query, bias) {
  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  url.searchParams.set('lang', 'bg');
  if (bias) {
    url.searchParams.set('lat', String(bias.lat));
    url.searchParams.set('lon', String(bias.lon));
  }

  const response = await fetch(url, {
    headers:{ accept:'application/json', 'user-agent':'ParkEyeRay/1.3 (https://sf-parkeyeray.vercel.app)' }
  });
  if (!response.ok) throw new Error(`Photon ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.features) ? payload.features : [];
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
          'user-agent':'ParkEyeRay/1.3 (https://sf-parkeyeray.vercel.app)'
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

  const elements = await callOverpass(`[out:json][timeout:20];\n(${clauses}\n);\nout center tags;`);
  return elements
    .map((element) => {
      const street = element.tags?.name;
      const lat = Number(element.center?.lat);
      const lon = Number(element.center?.lon);
      if (!street || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const matchScore = similarity(normalized, street);
      return {
        name:`ул. ${street} — приблизителна точка`,
        lat,
        lon,
        type:'street',
        importance:matchScore,
        distance:haversineMeters(bias, { lat, lon }),
        matchedQuery:normalized,
        source:'nearby-street',
        matchScore
      };
    })
    .filter((item) => item && item.matchScore >= 0.72)
    .sort((a, b) => b.matchScore - a.matchScore || a.distance - b.distance)
    .slice(0, 6);
}

function mapNominatim(item, bias, queryVariant) {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name:item.display_name,
    lat,
    lon,
    type:item.type || '',
    importance:Number(item.importance || 0),
    distance:bias ? haversineMeters(bias, { lat, lon }) : null,
    matchedQuery:queryVariant,
    source:'nominatim'
  };
}

function mapPhoton(feature, bias, queryVariant) {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties || {};
  const lon = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const countryCode = String(properties.countrycode || '').toUpperCase();
  const country = String(properties.country || '').toLowerCase();
  if (countryCode && countryCode !== 'BG' && !country.includes('българ') && !country.includes('bulgaria')) return null;

  const first = properties.name || properties.street || properties.locality || 'Адрес';
  const house = properties.housenumber ? ` ${properties.housenumber}` : '';
  const place = properties.city || properties.town || properties.village || properties.county || '';
  const displayName = [first + house, place, 'България'].filter(Boolean).join(', ');

  return {
    name:displayName,
    lat,
    lon,
    type:properties.type || properties.osm_value || '',
    importance:0.55,
    distance:bias ? haversineMeters(bias, { lat, lon }) : null,
    matchedQuery:queryVariant,
    source:'photon'
  };
}

function dedupeAndSort(items, bias) {
  const seen = new Set();
  return items
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (bias && Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
        const delta = a.distance - b.distance;
        if (Math.abs(delta) > 250) return delta;
      }
      return b.importance - a.importance;
    })
    .slice(0, 8);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Method not allowed' });
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2 || q.length > 140) return res.status(400).json({ error:'Invalid search query' });

  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  const bias = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  const transliterated = transliterateToBulgarian(q);
  const houseNumberMatch = transliterated.match(/(?:,|\s)\s*(\d+[а-яa-z]?)\s*$/i);
  const houseNumber = houseNumberMatch?.[1] || '';
  const withoutHouseNumber = transliterated.replace(/(?:,|\s)\s*\d+[а-яa-z]?\s*$/i, '').trim();
  const streetSpellings = likelyStreetSpellings(withoutHouseNumber);
  let context = null;
  try { context = await reverseContext(bias); } catch (error) { console.warn('Reverse context failed', error?.message || error); }
  const city = context?.city || '';
  const fullSpellings = streetSpellings.map((street) => [street, houseNumber].filter(Boolean).join(' '));
  const variants = [...new Set([
    ...fullSpellings.map((value) => city && `${value}, ${city}`),
    ...fullSpellings,
    q,
    transliterated,
    ...streetSpellings.map((value) => city && `${value}, ${city}`),
    ...streetSpellings
  ].filter(Boolean))];

  try {
    let results = [];

    // Structured address search is much better at house numbers than a single
    // free-text query. Try likely street spellings before broad fallbacks.
    if (city) {
      for (const street of streetSpellings) {
        try {
          const batch = await nominatimAddressSearch(street, houseNumber, city, bias);
          results.push(...batch.map((item) => mapNominatim(item, bias, `${street} ${houseNumber}, ${city}`.trim())));
        } catch (error) {
          console.warn('Nominatim address failed', error?.message || error);
        }
        if (results.filter(Boolean).length) break;
      }
    }

    for (const variant of results.length ? [] : variants) {
      try {
        const batch = await nominatimSearch(variant, bias);
        results.push(...batch.map((item) => mapNominatim(item, bias, variant)));
      } catch (error) {
        console.warn('Nominatim failed', error?.message || error);
      }
      if (results.filter(Boolean).length >= 8) break;
    }

    results = dedupeAndSort(results, bias);

    if (!results.length) {
      const photonResults = [];
      for (const variant of variants) {
        try {
          const batch = await photonSearch(variant, bias);
          photonResults.push(...batch.map((item) => mapPhoton(item, bias, variant)));
        } catch (error) {
          console.warn('Photon failed', error?.message || error);
        }
        if (photonResults.filter(Boolean).length >= 8) break;
      }
      results = dedupeAndSort(photonResults, bias);
    }

    if (!results.length) {
      for (const spelling of streetSpellings) {
        results = await nearbyStreetFallback(spelling || transliterated, bias);
        if (results.length) break;
      }
    }

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=900');
    return res.status(200).json({ results, normalizedQuery:transliterated, variants, context });
  } catch (error) {
    return res.status(502).json({
      error:'Address search is temporarily unavailable',
      detail:error?.message || 'Unknown error'
    });
  }
}
