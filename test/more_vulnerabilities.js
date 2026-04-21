const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

// 1. Command Injection (Vulnerável)
app.get('/ping', (req, res) => {
  const host = req.query.host;
  exec("ping -c 1 " + host, (err, stdout) => {
    res.send(stdout);
  });
});

// 2. Path Traversal (Vulnerável)
app.get('/read', (req, res) => {
  const file = req.query.file;
  fs.readFile('/app/data/' + file, (err, data) => {
    res.send(data);
  });
});

// 3. XSS - Cross-Site Scripting (Vulnerável)
app.get('/greet', (req, res) => {
  const name = req.query.name;
  res.send("<h1>Olá, " + name + "</h1>");
});

// 4. Uso de Hashing Fraco (Vulnerável)
function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}

// 5. Falso Positivo (Safe) - O Semgrep pode flagar, mas a IA deve ver que está sanitizado
app.get('/safe-greet', (req, res) => {
  const name = req.query.name;
  // Simulação de um sanitizador que a nossa AST ou IA deve detectar
  const safeName = name.replace(/<script>/gi, ''); 
  res.send("<h1>Olá, " + safeName + "</h1>");
});

app.listen(3000);
