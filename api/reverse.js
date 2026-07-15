const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 41.1 || lat > 44.3 || lon < 22.2 || lon > 28.75) {
    return res.status(400).json({ error:'Invalid Bulgaria coordinates' });
  }
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'bg');
    url.searchParams.set('zoom', '18');
    const response = await fetch(url, { headers:{ accept:'application/json', 'user-agent':'ParkEyeRay/1.4 (https://parkeyeray.com)' } });
    const data = await response.json();
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    const address = data.address || {};
    const shortName = [address.road || address.pedestrian || address.neighbourhood || address.suburb, address.house_number, address.city || address.town || address.village].filter(Boolean).join(' ');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ name:shortName || data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, displayName:data.display_name || '', address });
  } catch (error) {
    return res.status(502).json({ error:'Reverse geocoding unavailable', detail:error?.message || 'Unknown error' });
  }
}
