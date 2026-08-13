#!/usr/bin/env node
const { spawn } = require('child_process');
const { parseArgs } = require('util');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url:         { type: 'string',  short: 'u' },
    tool:        { type: 'string',  short: 't', default: 'curl' },
    headers:     { type: 'string',  short: 'H', multiple: true },
    output:      { type: 'string',  short: 'o' },
    silent:      { type: 'boolean', short: 's', default: false },
    follow:      { type: 'boolean', short: 'L', default: true  },
    method:      { type: 'string',  short: 'X', default: 'GET' },
    data:        { type: 'string',  short: 'd' },
    grep:        { type: 'string',  short: 'g' },

    'get-js':        { type: 'boolean', default: false },
    'get-css':       { type: 'boolean', default: false },
    'get-links':     { type: 'boolean', default: false },
    'get-imgs':      { type: 'boolean', default: false },
    'get-urls':      { type: 'boolean', default: false },
    'get-emails':    { type: 'boolean', default: false },
    'get-meta':      { type: 'boolean', default: false },
    'get-forms':     { type: 'boolean', default: false },
    'get-api':       { type: 'boolean', default: false },
    'get-endpoints': { type: 'boolean', default: false },

    // ── new flag ──────────────────────────────────────────────────────────
    'gen-curls':     { type: 'boolean', default: false },
    'out-dir':       { type: 'string',  default: './curls' },
    // bearer token to embed in generated scripts (optional)
    'token':         { type: 'string' },

    help:        { type: 'boolean', short: 'h', default: false },
  },
});

const PRESETS = {
  'get-js':     { pattern: 'src="[^"]+\\.js[^"]*"',                               label: 'JS files'     },
  'get-css':    { pattern: 'href="[^"]+\\.css[^"]*"',                              label: 'CSS files'    },
  'get-links':  { pattern: 'href="[^"]+"',                                         label: 'links'        },
  'get-imgs':   { pattern: 'src="[^"]+\\.(png|jpg|jpeg|gif|svg|webp)[^"]*"',       label: 'images'       },
  'get-urls':   { pattern: 'https?://[^"\'\\s>]+',                                 label: 'URLs'         },
  'get-emails': { pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}', label: 'emails'      },
  'get-meta':   { pattern: '<meta[^>]+>',                                          label: 'meta tags'    },
  'get-forms':  { pattern: 'action="[^"]+"',                                       label: 'form actions' },
  'get-api':    { pattern: '/api/[^"\'\\s>]+',                                     label: 'API paths'    },
};

const ENDPOINT_PATTERN = '["\'\`](/[a-zA-Z0-9/_.:%?=&@+-]+)["\'\`]';

const METHOD_PATTERNS = [
  /axios\.(get|post|put|patch|delete|head)\(["'`]([/][^"'`\s,)]+)/gi,
  /fetch\(["'`]([/][^"'`\s,)]+)["'`][^)]*?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`]/gi,
  /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`].{0,120}?["'`]([/][a-zA-Z0-9/_-]+)["'`]/gi,
  /["'`]([/][a-zA-Z0-9/_-]+)["'`].{0,120}?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`]/gi,
  /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`][^}]{0,80}url\s*:\s*["'`]([/][^"'`\s]+)["'`]/gi,
  /url\s*:\s*["'`]([/][^"'`\s]+)["'`][^}]{0,80}method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`]/gi,
  /\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]\s*\)[^;]{0,300}?\.then\([^)]*\.json\(\)/gi,
  /\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]\s*\)\s*,\s*\{headers/gi,
  /\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]\s*\)[^;]{0,200}?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD)["'`]/gi,
  /\(["'`]["'`]\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]\s*\)\)/gi,
  /location\.href\s*=\s*["'`]["'`]\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]/gi,
  /open\(\{url:\s*["'`]["'`]\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]/gi,
  /["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)\$\{/g,
  /(?:router|app|Route)\.(get|post|put|patch|delete|head)\(["'`]([\/][^"'`\s,)]+)/gi,
  /url\s*:\s*["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)["'`]/gi,
  /path\s*:\s*["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)["'`]/gi,
  /endpoint\s*:\s*["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)["'`]/gi,
  /query\s*:\s*["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)["'`]/gi,
  /await\s+\w+\(["'`]["'`]\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]/gi,
  /(?:=|,|\()\s*["'`]["'`]\.concat\([^,)]+,\s*["'`]([/][^"'`\s,)]+)["'`]/gi,
  /to=["'`](\/[a-zA-Z0-9\/_\-.:%?=&@]+)["'`]/gi,
];

function extractMethods(js) {
  const methodMap = new Map();
  for (const re of METHOD_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(js)) !== null) {
      const a = m[1], b = m[2];
      let method, path;
      if (!b && a && a.startsWith('/')) {
        method = 'GET'; path = a;
      } else if (/^(GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(a) && b && b.startsWith('/')) {
        method = a.toUpperCase(); path = b;
      } else if (/^(GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(b) && a && a.startsWith('/')) {
        method = b.toUpperCase(); path = a;
      } else if (a && !a.startsWith('/') && b && b.startsWith('/')) {
        method = a.toUpperCase(); path = b;
      } else {
        continue;
      }
      if (!methodMap.has(path)) methodMap.set(path, method);
    }
  }
  return methodMap;
}

/**
 * Single-pass context extractor — scans the bundle once and builds a map
 * of endpoint → { headers, bodyKeys, streaming } for all endpoints at once.
 */
function extractAllContexts(js, endpoints) {
  const ctxMap = new Map();
  endpoints.forEach(e => ctxMap.set(e, { headers: {}, bodyKeys: [], streaming: false }));

  // slide a window of 800 chars through the bundle
  const WINDOW = 800;
  const STEP   = 800;

  for (let i = 0; i < js.length; i += STEP) {
    const chunk = js.slice(i, i + WINDOW);

    // which endpoints appear in this chunk?
    for (const ep of endpoints) {
      if (!chunk.includes(ep)) continue;
      const info = ctxMap.get(ep);

      // streaming
      if (/getReader|EventSource|text\/event-stream/.test(chunk)) {
        info.streaming = true;
        info.headers['Accept'] = 'text/event-stream';
      }

      // Accept header
      const acceptM = chunk.match(/[Aa]ccept['"\s]*:['"\s]*([\w\/+*-]+)/);
      if (acceptM && !info.headers['Accept']) info.headers['Accept'] = acceptM[1];

      // Content-Type
      const ctM = chunk.match(/[Cc]ontent-[Tt]ype['"\s]*:['"\s]*([\w\/+*-]+)/);
      if (ctM && !info.headers['Content-Type']) info.headers['Content-Type'] = ctM[1];

      // X- custom headers
      const hdrRe = /['"](X-[A-Za-z-]+)['"\s]*:['"\s]*([^'"}{,\s]+)/g;
      let hm;
      while ((hm = hdrRe.exec(chunk)) !== null) {
        if (!info.headers[hm[1]]) info.headers[hm[1]] = hm[2];
      }

      // body keys from JSON.stringify({...})
      const bodyM = chunk.match(/JSON\.stringify\(\{([^}]{0,300})\}/);
      if (bodyM) {
        const keys = [...bodyM[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::|,|\})/g)]
          .map(k => k[1])
          .filter(k => !['true','false','null','undefined'].includes(k));
        if (keys.length) info.bodyKeys = [...new Set([...info.bodyKeys, ...keys])];
      }
    }
  }

  return ctxMap;
}

// ── curl script generator ─────────────────────────────────────────────────────

/**
 * Derive a safe filename from an endpoint path.
 *   /api/ai/chat   → chat
 *   /auth/me       → me
 *   /api/files/download?path=  → download
 *   /api/conversations/        → conversations
 */
function endpointName(endpointPath) {
  // strip query string, trailing slashes, leading slash, join with dash
  const clean = endpointPath.split('?')[0].replace(/\/+$/, '').replace(/^\//, '');
  return (clean.replace(/\//g, '-') || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** 6-char random hex prefix */
function randPrefix() {
  return crypto.randomBytes(3).toString('hex');   // e.g. "a3f9c2"
}

/**
 * Build the content of a curl shell script for one endpoint.
 */
function buildCurlScript(baseUrl, endpointPath, method, token, ctx = {}) {
  const fullUrl    = `${baseUrl.replace(/\/$/, '')}${endpointPath}`;
  const safeMethod = (method && method !== '???') ? method.toUpperCase() : 'GET';
  const hasBody    = ['POST', 'PUT', 'PATCH'].includes(safeMethod);
  const streaming  = ctx.streaming || false;
  const ctxHeaders = ctx.headers || {};
  const bodyKeys   = ctx.bodyKeys || [];

  const flags = streaming ? ['-s', '--no-buffer', `-X ${safeMethod}`] : [`-s -X ${safeMethod}`];
  const parts = [`curl ${flags.join(' ')}`];

  // Accept header — prefer what the bundle actually uses
  const accept = ctxHeaders['Accept'] || (streaming ? 'text/event-stream' : 'application/json');
  parts.push(`  -H 'Accept: ${accept}'`);

  // Auth
  if (token) {
    parts.push(`  -H 'Authorization: Bearer ${token}'`);
  } else {
    parts.push("  -H 'Authorization: Bearer <your_token>'");
  }

  // Content-Type
  if (hasBody) {
    const ct = ctxHeaders['Content-Type'] || 'application/json';
    parts.push(`  -H 'Content-Type: ${ct}'`);
  }

  // Any extra headers found in bundle (X- headers etc)
  for (const [k, v] of Object.entries(ctxHeaders)) {
    if (k === 'Accept' || k === 'Content-Type') continue;
    parts.push(`  -H '${k}: ${v}'`);
  }

  // Body — use real keys if found, else empty object
  if (hasBody) {
    const body = bodyKeys.length
      ? JSON.stringify(Object.fromEntries(bodyKeys.map(k => [k, ''])), null, 0)
      : '{}';
    parts.push(`  -d '${body}'`);
  }

  parts.push(`  '${fullUrl}'`);
  return parts.join(' \\\n') + '\n';
}

/**
 * Write one .sh file per endpoint into outDir.
 * Returns list of created file paths.
 */
function generateCurlScripts(baseUrl, endpoints, outDir, token) {
  fs.mkdirSync(outDir, { recursive: true });

  // track name collisions so we never overwrite
  const seen = new Map();   // name → count
  const created = [];

  const API_NOISE    = /\.(png|jpg|jpeg|gif|svg|webp|ico|js|css|html|txt|pdf|woff|woff2|ttf|eot)$/i;
  const BROWSER_FLOW = /^\/login\/|^\/auth\/delete-account|^\/data-deletion/;
  for (const [endpointPath, val] of endpoints) {
    const method = val.method || val;
    const ctx    = val.ctx || {};
    if (API_NOISE.test(endpointPath.split('?')[0]) || endpointPath === '/..') continue;
    if (method === '???' || BROWSER_FLOW.test(endpointPath)) {
      // browser-flow or unknown-method — write a comment-only script
      const fname = endpointName(endpointPath) + '.curl';
      const fpath = require('path').join(outDir, fname);
      const note  = BROWSER_FLOW.test(endpointPath)
        ? 'BROWSER FLOW — open this URL directly in a browser, not curl.'
        : 'METHOD UNKNOWN — endpoint detected but HTTP method could not be inferred.';
      const comment = [
        '# ' + note,
        '# Endpoint : ' + endpointPath,
        '# Method   : ' + (method === '???' ? 'unknown' : method),
        '#',
        '# Example (browser flow):',
        '#   open ' + baseUrl.replace(/\/$/, '') + endpointPath,
      ].join('\n') + '\n';
      require('fs').writeFileSync(fpath, comment);
      created.push({ fname, method: BROWSER_FLOW.test(endpointPath) ? 'BROWSER' : '???', endpointPath });
      continue;
    }
    const name    = endpointName(endpointPath);
    const prefix  = randPrefix();
    const fname   = `${name}.curl`;
    const fpath   = path.join(outDir, fname);

    const content = buildCurlScript(baseUrl, endpointPath, method, token, ctx);
    fs.writeFileSync(fpath, content);
    created.push({ fname, method: method, endpointPath });
  }

  return created;
}

// ── help ──────────────────────────────────────────────────────────────────────

if (values.help || (!values.url && positionals.length === 0)) {
  console.log(`
Usage: node fetch.js -u <url> [options]

Default (no flags):
  Fetches the page, finds all JS bundles, then extracts
  and deduplicates every endpoint path from each bundle.

Extraction shortcuts:
  --get-js          Script src attributes  (*.js)
  --get-css         Stylesheet href attrs  (*.css)
  --get-links       All href="..." values
  --get-imgs        Image src attributes
  --get-urls        All https?:// URLs in page
  --get-emails      Email addresses
  --get-meta        <meta> tags
  --get-forms       Form action attributes
  --get-api         /api/... route paths
  --get-endpoints   Explicit endpoint extraction (same as default)

Curl script generation:
  --gen-curls       After endpoint discovery, write one curl .sh per endpoint
  --out-dir <dir>   Output directory (default: ./curls)
  --token <tok>     Embed a Bearer token in every generated script

Request options:
  -u, --url         Target URL
  -t, --tool        curl | wget  (default: curl)
  -H, --headers     Header, repeatable: -H "Authorization: Bearer tok"
  -X, --method      HTTP method (default: GET)
  -d, --data        Request body
  -o, --output      Save raw response to file
  -s, --silent      Suppress labels/progress
  -g, --grep        Raw grep -oP pattern (fallback)

Examples:
  node fetch.js -u https://example.com
  node fetch.js -u https://example.com --gen-curls
  node fetch.js -u https://example.com --gen-curls --out-dir ./scripts --token eyJhbG...
  node fetch.js -u https://example.com --get-js --get-links
`);
  process.exit(0);
}

const url = values.url || positionals[0];
if (!url) { console.error('Error: --url is required'); process.exit(1); }

const activePatterns = Object.entries(PRESETS)
  .filter(([key]) => values[key])
  .map(([, v]) => v);

if (values.grep) activePatterns.push({ pattern: values.grep, label: 'custom' });

const autoMode = activePatterns.length === 0 && !values['get-endpoints'];

// ── http helpers ──────────────────────────────────────────────────────────────

function curl(target) {
  const args = ['-s'];
  if (values.follow) args.push('-L');
  (values.headers || []).forEach(h => args.push('-H', h));
  args.push(target);
  return args;
}

function buildToolArgs(target) {
  if (values.tool === 'wget') {
    const args = ['--quiet', '-O', '-'];
    (values.headers || []).forEach(h => args.push(`--header=${h}`));
    args.push(target);
    return args;
  }
  return curl(target);
}

function fetchUrl(target) {
  return new Promise((resolve, reject) => {
    const proc = spawn(values.tool, buildToolArgs(target), { stdio: ['inherit', 'pipe', 'inherit'] });
    const chunks = [];
    proc.stdout.on('data', c => chunks.push(c));
    proc.on('close', code => {
      if (code !== 0 && code !== null) return reject(new Error(`${values.tool} exited ${code}`));
      resolve(Buffer.concat(chunks).toString());
    });
  });
}

function grepAll(pattern, input) {
  return new Promise((resolve) => {
    const g = spawn('grep', ['-oP', pattern], { stdio: ['pipe', 'pipe', 'inherit'] });
    const out = [];
    g.stdout.on('data', c => out.push(c));
    g.stdin.write(input);
    g.stdin.end();
    g.on('close', () => resolve(Buffer.concat(out).toString()));
  });
}

function sortUniq(lines) {
  return [...new Set(lines.trim().split('\n').filter(Boolean))].sort();
}

function stripQuotes(s) {
  return s.replace(/^["'`]|["'`]$/g, '');
}

function streamGrep(pattern, fetcher) {
  const grepper = spawn('grep', ['-oP', pattern], { stdio: ['pipe', 'inherit', 'inherit'] });
  fetcher.stdout.pipe(grepper.stdin);
  fetcher.on('close', () => grepper.stdin.end());
  grepper.on('close', code => process.exit(code || 0));
}

// ── endpoint discovery ────────────────────────────────────────────────────────

async function discoverEndpoints() {
  if (!values.silent) console.error('\x1b[2m→ fetching page...\x1b[0m');
  const html = await fetchUrl(url);

  const jsMatches = await grepAll('src="[^"]+\\.js[^"]*"', html);
  const jsSrcs = sortUniq(jsMatches)
    .map(s => s.replace(/src="|"$/g, '').trim())
    .filter(Boolean);

  if (jsSrcs.length === 0) {
    console.error('No JS bundles found on page.');
    process.exit(1);
  }

  const base   = new URL(url);
  const jsUrls = jsSrcs.map(src => {
    try { return new URL(src, base).href; } catch { return null; }
  }).filter(Boolean);

  if (!values.silent) console.error(`\x1b[2m→ found ${jsUrls.length} JS bundle(s), extracting endpoints...\x1b[0m`);

  const allEndpoints = new Map();
  await Promise.all(jsUrls.map(async jsUrl => {
    if (!values.silent) console.error(`\x1b[2m  ${jsUrl}\x1b[0m`);
    try {
      const js        = await fetchUrl(jsUrl);
      const raw       = await grepAll(ENDPOINT_PATTERN, js);
      const methodMap = extractMethods(js);
      const endpoints = raw.trim().split('\n').filter(Boolean)
        .map(stripQuotes)
        .filter(e => e.length > 1);

      // build context map once per bundle, not per endpoint
      const ctxMap = extractAllContexts(js, endpoints);

      endpoints.forEach(e => {
        const method = methodMap.get(e) || '???';
        const ctx    = ctxMap.get(e) || {};
        allEndpoints.set(e, { method, ctx });
      });
    } catch (e) {
      console.error(`  skipped: ${e.message}`);
    }
  }));

  const NOISE  = new Set(['/dev/poll', '//', '///']);
  const sorted = [...allEndpoints.entries()]
    .filter(([e]) =>
      e.length > 2 &&
      !e.match(/^\/+$/) &&
      !e.startsWith('/storage/emulated') &&
      !NOISE.has(e)
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([e, val]) => [e, typeof val === 'object' ? val : { method: val, ctx: {} }]);

  if (sorted.length === 0) {
    console.error('No endpoints found.');
    return [];
  }

  // print table (same as before)
  sorted.forEach(([e, val]) => {
    const method = val.method || val;
    const methodTag = method === '???'
      ? '\x1b[2m???\x1b[0m'
      : `\x1b[1;33m${method.padEnd(6)}\x1b[0m`;
    console.log(`${methodTag}  ${e}`);
  });

  return sorted;
}

// ── main ──────────────────────────────────────────────────────────────────────

if (autoMode || values['get-endpoints'] || values['gen-curls']) {

  discoverEndpoints().then(endpoints => {

    if (!values['gen-curls'] || endpoints.length === 0) return;

    const baseUrl = url.replace(/\/$/, '');
    const outDir  = values['out-dir'];
    const token   = values['token'];

    if (!values.silent) console.error(`\n\x1b[2m→ generating curl scripts in ${outDir}/\x1b[0m`);

    const created = generateCurlScripts(baseUrl, endpoints, outDir, token);

    const maxName = Math.max(...created.map(c => c.fname.length));
    created.forEach(({ fname, method, endpointPath }) => {
      const tag = method === '???'
        ? '\x1b[2m???\x1b[0m   '
        : `\x1b[1;32m${method.padEnd(6)}\x1b[0m`;
      console.error(`  ${tag}  ${fname.padEnd(maxName)}  ${endpointPath}`);
    });

    console.error(`\n\x1b[1;32m✓ ${created.length} scripts written to ${outDir}/\x1b[0m`);

  }).catch(e => { console.error(e.message); process.exit(1); });

} else if (activePatterns.length === 1) {
  const { pattern, label } = activePatterns[0];
  if (!values.silent) console.error(`\x1b[2m→ extracting ${label}\x1b[0m`);
  const fetcher = spawn(values.tool, buildToolArgs(url), { stdio: ['inherit', 'pipe', 'inherit'] });
  streamGrep(pattern, fetcher);

} else {
  const fetcher = spawn(values.tool, buildToolArgs(url), { stdio: ['inherit', 'pipe', 'inherit'] });
  const chunks  = [];
  fetcher.stdout.on('data', c => chunks.push(c));
  fetcher.on('close', async () => {
    const html = Buffer.concat(chunks).toString();
    for (const { pattern, label } of activePatterns) {
      console.log(`\n\x1b[1;36m── ${label} ──\x1b[0m`);
      const grepper = spawn('grep', ['-oP', pattern], { stdio: ['pipe', 'inherit', 'inherit'] });
      grepper.stdin.write(html);
      grepper.stdin.end();
      await new Promise(res => grepper.on('close', res));
    }
  });
}
