const express = require('express');
const app = express();
const db = require('./db');

app.get('/user', (req, res) => {
  const userId = req.query.id;
  // SQL Injection vulnerability
  const query = "SELECT * FROM users WHERE id = " + userId;
  db.query(query, (err, results) => {
    if (err) res.status(500).send(err);
    res.json(results);
  });
});

app.get('/safe_user', (req, res) => {
  const userId = req.query.id;
  // Safe using parameters, but semgrep might flag string concats or just depending on rules
  // Let's create another one with eval
console.log(userId);
});

const SECRET_KEY = "12345abcdef!@#$%"; // Hardcoded secret with some entropy
