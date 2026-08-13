// redirect-server.js
const express = require('express');
const app = express();

app.get('/redirect', (req, res) => {
  console.log('[REDIRECT] sending to internal network');
  res.redirect('http://127.0.0.1:8888/admin');
});

app.listen(9999, () => console.log('Redirect server on port 9999'));
