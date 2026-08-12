// server.js (patched)
const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const dns = require('dns').promises;

const app = express();
app.use(express.json());

const BLOCKED_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
];

const isPrivateIP = (ip) => BLOCKED_RANGES.some(r => r.test(ip));

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

async function validateURL(rawURL) {
  let parsed;
  try {
    parsed = new URL(rawURL);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error('Protocol not allowed');
  }

  // Resolve hostname to IP and check
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error(`Blocked: ${address} is a private/internal IP`);
    }
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

app.listen(3000, () => console.log('Server on http://localhost:3000'));
