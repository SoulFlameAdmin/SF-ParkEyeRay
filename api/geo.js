export default function handler(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const city = decodeURIComponent(String(req.headers['x-vercel-ip-city'] || ''));
  const latitude = Number(req.headers['x-vercel-ip-latitude']);
  const longitude = Number(req.headers['x-vercel-ip-longitude']);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    country,
    city,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    source: 'vercel-ip'
  });
}
