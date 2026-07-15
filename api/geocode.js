const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

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

  // Чести форми при писане на български с латиница.
  text = text
    .replace(/\bвоивода\b/g, 'войвода')
    .replace(/\bраион\b/g, 'район')
    .replace(/\bмаика\b/g, 'майка')
    .replace(/\bнаи\b/g, 'най');

  return text.replace(/\s+/g, ' ').trim();
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

async function nominatimSearch(query, bias) {
  const url = new URL(ENDPOINT);
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
      accept: 'application/json',
      'user-agent': 'ParkEyeRay/1.1 (https://sf-parkeyeray.vercel.app)'
    }
  });

  if (!response.ok) throw new Error(`Geocoder ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2 || q.length > 140) {
    return res.status(400).json({ error: 'Invalid search query' });
  }

  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  const bias = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

  const transliterated = transliterateToBulgarian(q);
  const withoutHouseNumber = transliterated.replace(/(?:,|\s)\s*\d+[а-яa-z]?\s*$/i, '').trim();
  const variants = [...new Set([
    q,
    transliterated,
    withoutHouseNumber !== transliterated ? withoutHouseNumber : ''
  ].filter(Boolean))];

  try {
    const collected = [];

    for (const variant of variants) {
      const batch = await nominatimSearch(variant, bias);
      collected.push(...batch.map((item) => ({ ...item, queryVariant: variant })));
      if (collected.length >= 8) break;
    }

    const seen = new Set();
    const results = collected
      .map((item) => {
        const itemLat = Number(item.lat);
        const itemLon = Number(item.lon);
        if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return null;

        const key = `${itemLat.toFixed(6)},${itemLon.toFixed(6)}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
          name: item.display_name,
          lat: itemLat,
          lon: itemLon,
          type: item.type || '',
          importance: Number(item.importance || 0),
          distance: bias ? haversineMeters(bias, { lat:itemLat, lon:itemLon }) : null,
          matchedQuery: item.queryVariant
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (bias && Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
          const distanceDelta = a.distance - b.distance;
          if (Math.abs(distanceDelta) > 250) return distanceDelta;
        }
        return b.importance - a.importance;
      })
      .slice(0, 8);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({
      results,
      normalizedQuery: transliterated,
      variants
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Address search is temporarily unavailable',
      detail: error?.message || 'Unknown error'
    });
  }
}
