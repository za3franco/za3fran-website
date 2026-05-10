// api/currency.js — Vercel serverless function
// Reads visitor IP from Vercel request headers (bypasses Netskope entirely)
// Returns JSON: { currency: 'MAD'|'EUR'|'USD', country: 'XX', source: '...' }

const MAD_COUNTRIES = ['MA','DZ','TN','LY','EG','MR'];
const EUR_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB','CH','NO','IS','AL','BA','ME','MK','RS','TR'];

function resolveCurrency(countryCode) {
  if (!countryCode) return 'EUR';
  const c = countryCode.toUpperCase();
  if (MAD_COUNTRIES.includes(c)) return 'MAD';
  if (EUR_COUNTRIES.includes(c)) return 'EUR';
  return 'USD';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Vercel injects the real visitor IP here — corporate proxies never see this call
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : null;

    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return res.status(200).json({ currency: 'EUR', country: 'XX', source: 'default' });
    }

    // Server-side call to ip-api.com — not subject to client-side proxy blocking
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,status`);
    const data = await response.json();

    if (data.status === 'success' && data.countryCode) {
      const currency = resolveCurrency(data.countryCode);
      return res.status(200).json({ currency, country: data.countryCode, source: 'ip-api' });
    }

    return res.status(200).json({ currency: 'EUR', country: 'XX', source: 'fallback' });

  } catch (err) {
    return res.status(200).json({ currency: 'EUR', country: 'XX', source: 'error' });
  }
}
