const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'Hola mundo' });
});

module.exports = app;
