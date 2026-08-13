// server-patched.js
const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const dns = require('dns').promises;

const app = express();
app.use(express.json());

const BLOCKED_RANGES = [
  /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^0\.0\.0\.0$/,
];

const isPrivateIP = (ip) => BLOCKED_RANGES.some(r => r.test(ip));

async function validateURL(rawURL) {
  const parsed = new URL(rawURL);
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) throw new Error(`Blocked: ${address} is a private/internal IP`);
  }
  return parsed;
}

app.get('/fetch', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });
  try {
    await validateURL(url);
    const response = await axios.get(url);
    res.json({ data: response.data });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.listen(4000, () => console.log('Patched server on port 4000'));
