// Custom Cursor Logic
const cursor = document.getElementById('cursor');

document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

document.addEventListener('mouseover', (e) => {
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
    cursor.classList.add('hovered');
  } else {
    cursor.classList.remove('hovered');
  }
});

// Scan Logic
const scanBtn = document.getElementById('scanBtn');
const targetInput = document.getElementById('targetInput');
const loadingState = document.getElementById('loadingState');
const resultsGrid = document.getElementById('resultsGrid');

scanBtn.addEventListener('click', async () => {
  const targetPath = targetInput.value.trim();
  if (!targetPath) return alert('Por favor, insira um caminho válido.');

  // UI State Update
  scanBtn.disabled = true;
  scanBtn.classList.add('opacity-50');
  resultsGrid.innerHTML = '';
  loadingState.classList.remove('hidden');

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPath })
    });

    const data = await response.json();

    if (response.ok) {
      renderResults(data.results, targetPath);
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (error) {
    alert('Erro de comunicação com o servidor local.');
  } finally {
    loadingState.classList.add('hidden');
    scanBtn.disabled = false;
    scanBtn.classList.remove('opacity-50');
  }
});

function renderResults(alerts, targetPath) {
  if (alerts.length === 0) {
    resultsGrid.innerHTML = `
      <div class="col-span-full text-center py-12 glass-panel rounded-2xl">
        <h3 class="text-xl text-white mb-2">Nenhuma vulnerabilidade detectada!</h3>
        <p class="text-gray-400">O código está limpo de acordo com as heurísticas e validações da IA.</p>
      </div>`;
    return;
  }

  alerts.forEach((alert, index) => {
    const isTruePositive = alert.aiValidation.status === 'True Positive';
    const severityColor = alert.aiValidation.gravidade === 'Alta' ? 'text-red-400' : 
                          alert.aiValidation.gravidade === 'Media' ? 'text-yellow-400' : 'text-green-400';
    
    const card = document.createElement('div');
    card.className = `glass-panel p-6 rounded-2xl reveal`;
    // Add a slight delay for staggered animation
    setTimeout(() => card.classList.add('active'), index * 100);

    let html = `
      <div class="flex justify-between items-start mb-4">
        <div class="text-xs font-mono text-gray-500 uppercase tracking-widest truncate w-3/4" title="${alert.finding.path}">
          Linha ${alert.finding.start.line}
        </div>
        <span class="px-2 py-1 text-[10px] uppercase font-bold rounded bg-black/50 ${severityColor}">
          ${alert.aiValidation.status}
        </span>
      </div>
      
      <h3 class="font-heading text-lg font-medium text-white mb-2 truncate" title="${alert.finding.check_id}">
        ${alert.finding.check_id.split('.').pop()}
      </h3>
      
      <p class="text-sm text-gray-400 mb-4 h-16 overflow-y-auto">
        ${alert.aiValidation.explicacao}
      </p>

      <div class="space-y-4">
        <div>
          <span class="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Código Original</span>
          <pre><code class="text-red-300">${escapeHtml(alert.finding.extra.lines)}</code></pre>
        </div>
    `;

    if (isTruePositive && alert.aiValidation.correcao) {
      html += `
        <div>
          <span class="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Correção Sugerida (IA)</span>
          <pre><code class="text-green-300">${escapeHtml(alert.aiValidation.correcao)}</code></pre>
        </div>
        
        <button onclick="applyFix('${escapeHtml(alert.finding.path)}', ${alert.finding.start.line}, ${alert.finding.end.line}, \`${escapeHtml(alert.aiValidation.correcao).replace(/`/g, '\\`')}\`)" 
                class="w-full mt-4 py-2 px-4 glass-panel border border-white/10 rounded-xl text-white text-xs font-semibold uppercase tracking-widest hover:bg-[#007bff] hover:border-[#007bff] transition-all duration-300">
          Aplicar Correção
        </button>
      `;
    }

    html += `</div>`;
    card.innerHTML = html;
    resultsGrid.appendChild(card);
  });
}

async function applyFix(filePath, startLine, endLine, correction) {
  try {
    // Unescape the HTML so the backend gets the raw code
    const rawCorrection = unescapeHtml(correction);
    
    const response = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, startLine, endLine, correction: rawCorrection })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Correção aplicada com sucesso no arquivo!');
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (error) {
    alert('Erro ao comunicar com o servidor para aplicar o patch.');
  }
}

// Utility functions to prevent XSS in our own dashboard!
function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function unescapeHtml(safe) {
    return (safe || '').toString()
         .replace(/&amp;/g, "&")
         .replace(/&lt;/g, "<")
         .replace(/&gt;/g, ">")
         .replace(/&quot;/g, "\"")
         .replace(/&#039;/g, "'");
}
