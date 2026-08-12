// server.js
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Vulnerable SSRF endpoint (intentional — for testing)
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
