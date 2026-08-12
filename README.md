# 🔐 Cybernetics Lab — SSRF Study Notes

> **Topic:** Server-Side Request Forgery (SSRF)  
> **Environment:** Node.js + Express  
> **Date:** Wednesday, August 12, 2026

---

## What is SSRF?

**Server-Side Request Forgery (SSRF)** is a web vulnerability where an attacker tricks a server into making HTTP requests on their behalf — to places the server shouldn't be reaching.

Think of it like this:

> You can't get into a building, but you know someone inside who will fetch anything you ask. You ask them to grab files from the restricted basement. They do it without question.

That "someone inside" is the vulnerable server.

---

## Why is it Dangerous?

In real-world environments (especially cloud), servers have access to:

- **Internal APIs** not exposed to the internet
- **Cloud metadata endpoints** (e.g. AWS `169.254.169.254`) that contain credentials
- **Databases and admin panels** bound only to `localhost`
- **Other internal microservices** behind a firewall

An attacker on the outside can reach all of these through a vulnerable SSRF endpoint.

---

## Lab Setup

### 1. Project Structure

```
cybernetics-lab/
├── server.js         # Main server (vulnerable → then patched)
├── secret-server.js  # Fake internal service (the "victim")
└── package.json
```

### 2. Install Dependencies

```bash
mkdir cybernetics-lab && cd cybernetics-lab
npm init -y
npm install express axios
```

---

## The Vulnerable Server

This is what a vulnerable SSRF endpoint looks like — it blindly fetches any URL the user provides:

```js
// server.js (VULNERABLE)
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.get('/fetch', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });

  try {
    const response = await axios.get(url);
    res.json({ data: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
```

**The problem:** No validation. Any URL goes. The server will fetch it.

---

## The Secret Internal Server

This simulates an internal service — bound only to `127.0.0.1`, meaning it's **not reachable from the outside world directly**. Only someone already inside the machine can access it.

```js
// secret-server.js
const express = require('express');
const app = express();

app.get('/admin', (req, res) => {
  res.json({
    message: 'TOP SECRET ADMIN PANEL',
    users: ['root', 'admin', 'dbuser'],
    db_password: 'sup3r_s3cr3t_123',
    internal_ip: '192.168.1.100'
  });
});

app.get('/env', (req, res) => {
  res.json(process.env);
});

app.listen(8888, '127.0.0.1', () => console.log('Secret server on 127.0.0.1:8888'));
```

---

## The Attack

With both servers running, we exploited the SSRF vulnerability to reach the secret server:

```bash
curl "http://localhost:3000/fetch?url=http://127.0.0.1:8888/admin"
```

### Result:
```json
{
  "data": {
    "message": "TOP SECRET ADMIN PANEL",
    "users": ["root", "admin", "dbuser"],
    "db_password": "sup3r_s3cr3t_123",
    "internal_ip": "192.168.1.100"
  }
}
```

We retrieved sensitive internal data through the public-facing server. The secret server never knew the request came from an attacker — it looked like a legitimate internal request.

---

## Port Scanning via SSRF

Different error messages reveal whether a port is open or closed — making SSRF useful for **internal network reconnaissance**:

| Command | Error | Meaning |
|---|---|---|
| `http://127.0.0.1:8080` | `ECONNREFUSED` | Port closed / nothing running |
| `http://127.0.0.1:22` | `Parse Error: Expected HTTP/` | Port **open** — SSH is there (wrong protocol) |
| `http://0.0.0.0:3000` | `ECONNREFUSED` | OS blocked it |

> **Key insight:** Even failed requests tell you something. An attacker can map your internal network just from error messages.

---

## The Fix — SSRF Protection

We patched the server with a URL validator that:

1. Parses and validates the URL structure
2. Resolves the hostname to an IP via DNS
3. Blocks all private/internal IP ranges before making the request

```js
// server.js (PATCHED)
const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const dns = require('dns').promises;

const app = express();
app.use(express.json());

const BLOCKED_RANGES = [
  /^127\./,           // Loopback
  /^10\./,            // Private class A
  /^192\.168\./,      // Private class C
  /^172\.(1[6-9]|2\d|3[01])\./, // Private class B
  /^169\.254\./,      // Link-local (AWS metadata lives here)
  /^::1$/,            // IPv6 loopback
  /^0\.0\.0\.0$/,     // Non-routable
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
```

### Test Results After Patching:

```bash
# BLOCKED ✅
curl "http://localhost:3000/fetch?url=http://127.0.0.1:8888/admin"
# {"error":"Blocked: 127.0.0.1 is a private/internal IP"}

# BLOCKED ✅
curl "http://localhost:3000/fetch?url=http://169.254.169.254/latest/meta-data/"
# {"error":"Blocked: 169.254.169.254 is a private/internal IP"}
```

---

## Key Concepts Summary

| Term | Meaning |
|---|---|
| **SSRF** | Tricking a server into making requests to unintended locations |
| **Internal IP** | IPs like `127.x`, `10.x`, `192.168.x` — not reachable from the internet |
| **Metadata endpoint** | Cloud services expose credentials at `169.254.169.254` |
| **Port scanning via SSRF** | Using error differences to detect open/closed ports |
| **DNS resolution check** | Resolving a hostname to IP before allowing a request |
| **Protocol whitelisting** | Only allowing `http/https`, blocking `file://`, `gopher://`, etc. |

---

## What's Next

- [ ] **DNS Rebinding** — bypass protection using a domain that switches IPs after validation
- [ ] **Redirect-based bypass** — public server that redirects to `127.0.0.1`
- [ ] **Protocol smuggling** — `file://`, `gopher://`, `dict://` payloads

---

*Part of the Cybernetics personal security research lab.*
