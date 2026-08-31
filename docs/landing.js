const termLines = [
  { text: "$ cypherguard scan ./src", class: "cmd", delay: 800 },
  { text: "[+] Inicializando motor de análise estática (Semgrep)...", class: "info", delay: 600 },
  { text: "[+] 142 arquivos verificados. 3 candidatos detectados.", class: "warn", delay: 1000 },
  { text: "[+] Acionando validação semântica LLM (Ollama: qwen2.5:7b)...", class: "info", delay: 1200 },
  { text: "    → src/auth.js: Analisando fluxo SQL... ", class: "dim", delay: 800, inline: true },
  { text: "FALSO POSITIVO (Descartado)", class: "success", delay: 200, newLine: false },
  { text: "    → src/api.js: Analisando sanitização XSS... ", class: "dim", delay: 900, inline: true },
  { text: "FALSO POSITIVO (Descartado)", class: "success", delay: 200, newLine: false },
  { text: "    → src/db.js: Analisando Insecure Eval... ", class: "dim", delay: 1100, inline: true },
  { text: "VULNERABILIDADE CONFIRMADA!", class: "error", delay: 400, newLine: false },
  { text: "[!] Auditoria concluída. 1 vulnerabilidade real identificada.", class: "error-bold", delay: 800 },
  { text: "[+] Exportando resultados...", class: "info", delay: 500 },
  { text: "✓ cypherguard-report.sarif gerado com sucesso.", class: "success-bold", delay: 1000 }
];

async function runTerminalAnimation() {
  const termBody = document.getElementById('termBody');
  if (!termBody) return;
  
  while (true) {
    termBody.innerHTML = '';
    
    let currentLineEl = null;
    
    for (const line of termLines) {
      await new Promise(r => setTimeout(r, line.delay));
      
      if (line.newLine === false && currentLineEl) {
          const span = document.createElement('span');
          span.className = line.class;
          span.innerText = line.text;
          currentLineEl.appendChild(span);
      } else {
          currentLineEl = document.createElement('div');
          currentLineEl.className = 'term-line ' + (line.class || '');
          currentLineEl.innerText = line.text;
          termBody.appendChild(currentLineEl);
      }
      
      termBody.scrollTop = termBody.scrollHeight;
    }
    
    // Aguarda um pouco antes de reiniciar
    await new Promise(r => setTimeout(r, 6000));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  runTerminalAnimation();
});
