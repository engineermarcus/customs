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
