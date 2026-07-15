const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2 || q.length > 120) {
    return res.status(400).json({ error: 'Invalid search query' });
  }

  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('countrycodes', 'bg');
    url.searchParams.set('limit', '6');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'ParkEyeRay/1.0 (https://sf-parkeyeray.vercel.app)'
      }
    });

    if (!response.ok) throw new Error(`Geocoder ${response.status}`);
    const data = await response.json();

    const results = Array.isArray(data) ? data.map((item) => ({
      name: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      type: item.type || '',
      importance: Number(item.importance || 0)
    })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)) : [];

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(502).json({ error: 'Address search is temporarily unavailable', detail: error?.message || 'Unknown error' });
  }
}
