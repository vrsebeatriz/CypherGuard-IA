const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const mysql = require('mysql');
const app = express();
app.use(express.json());

// 1. Command Injection
app.get('/ping', (req, res) => {
  const host = req.query.host;
  exec("ping -c 1 " + host, (err, stdout) => {
    res.send(stdout);
  });
});

// 2. Path Traversal
app.get('/read', (req, res) => {
  const file = req.query.file;
  fs.readFile('/var/www/html/' + file, (err, data) => {
    res.send(data);
  });
});

// 3. XSS (Cross-Site Scripting)
app.get('/greet', (req, res) => {
  const name = req.query.name;
  res.send("<h1>Hello " + name + "</h1>"); 
});

// 4. SQL Injection
const db = mysql.createConnection({host: "localhost", user: "root", password: ""});
app.get('/user', (req, res) => {
  const id = req.query.id;
  const sql = "SELECT * FROM users WHERE id = " + id;
  db.query(sql, (err, result) => {
    res.send(result);
  });
});

// 5. Weak Hashing
function login(password) {
  const hash = crypto.createHash('md5').update(password).digest('hex');
  return hash;
}

// 6. Sensitive Data Exposure
app.get('/config', (req, res) => {
  res.json(process.env);
});

// 7. Insecure Deserialization
const serialize = require('node-serialize');
app.post('/unserialize', (req, res) => {
  const obj = serialize.unserialize(req.body.data);
  res.send("Done");
});

app.listen(3000);
