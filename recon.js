// recon.js
const { chromium } = require('playwright');

const endpoints = [];

(async () => {
  const browser = await chromium.launch({ headless: false }); // open real browser
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('request', request => {
    const url = request.url();
    if (url.includes('cybernetics-pqvr.onrender.com')) {
      endpoints.push({ method: request.method(), url, headers: request.headers(), body: request.postData() });
    }
  });

  await page.goto('https://cybernetics-pqvr.onrender.com');
  
  // Wait for you to interact manually — 60 seconds
  console.log('[*] Browser open — use the app for 60 seconds...');
  await page.waitForTimeout(60000);

  console.log('\n[ENDPOINTS FOUND]');
  endpoints.forEach(e => {
    console.log(`\n${e.method} ${e.url}`);
    if (e.body) console.log("Body:", e.body);
  });

  await browser.close();
})();
