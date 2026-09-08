const urlParams = new URLSearchParams(window.location.search);
let CG_TOKEN = urlParams.get('token') || '';
if (!CG_TOKEN) {
    const metaToken = document.querySelector('meta[name="cg-token"]');
    if (metaToken) {
        CG_TOKEN = metaToken.getAttribute('content') || '';
    }
}

let currentUser = null;

function getAuthHeaders() {
    const h = {
        'Content-Type': 'application/json',
        'X-CypherGuard-Token': CG_TOKEN
    };
    const token = localStorage.getItem('cg_auth_token');
    if (token) {
        h['Authorization'] = `Bearer ${token}`;
        h['X-CypherGuard-Auth-Token'] = token;
    }
    return h;
}

const headers = getAuthHeaders();


/* ---------- nav between landing / app ---------- */
function goToApp(){
  document.getElementById('page-landing').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');
  window.scrollTo(0,0);
  if(!window.__histFilled){fillHistory();window.__histFilled=true;}
  if(!window.__settingsInit){loadSettings();window.__settingsInit=true;}
}
function goToLanding(){
  document.getElementById('page-app').classList.add('hidden');
  document.getElementById('page-landing').classList.remove('hidden');
  window.scrollTo(0,0);
}

/* ---------- tabs ---------- */
function switchTab(name){
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.toggle('active', el.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(el=>el.classList.remove('active'));
  const panel = document.getElementById('tab-'+name);
  if (panel) panel.classList.add('active');
  if (name === 'history') fillHistory();
  if (name === 'access') { loadUsers(); loadAuditLogs(); }
}

/* ---------- API Logic ---------- */
let currentScanId = null;

async function runScan(){
  if (currentUser && currentUser.role === 'auditor') {
    showToast('✕ Modo Auditor: Execução de novos scans bloqueada.');
    return;
  }

  const btn=document.getElementById('runBtn');
  const pathInput = document.getElementById('pathInput').value.trim();
  if(!pathInput) {
    showToast('✕ Por favor, informe um caminho válido.');
    return;
  }

  btn.disabled=true; btn.innerText='Executando…';
  
  const activeModel = document.getElementById('statusText').innerText.split('·')[1]?.trim() || 'IA';
  document.querySelector('#step2 .sub').innerText = `Auditando via ${activeModel}...`;
  document.getElementById('step1').scrollIntoView({behavior:'smooth', block:'center'});
  
  document.getElementById('emptyState').style.display='none';
  document.getElementById('resultsWrap').classList.remove('active');
  document.getElementById('cardsContainer').innerHTML='';
  
  const loading=document.getElementById('loadingState');
  loading.classList.add('active');
  const s1=document.getElementById('step1'), s2=document.getElementById('step2');
  s1.classList.add('active'); s1.classList.remove('done');
  s2.classList.remove('active'); s2.classList.remove('done');

  try {
    const response = await fetch('/api/scan', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetPath: pathInput })
    });

    s1.classList.remove('active'); s1.classList.add('done');
    s2.classList.add('active');

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao executar scan');

    currentScanId = data.id;

    setTimeout(() => {
        s2.classList.remove('active'); s2.classList.add('done');
        loading.classList.remove('active');
        document.getElementById('resultsWrap').classList.add('active');
        renderCards(data.results, pathInput, activeModel);
        btn.disabled=false; btn.innerText='▶  Executar Auditoria';
        fillHistory(); // Refresh history
        loadAuditLogs(); // Refresh audit logs
    }, 800); // Visual delay for elegance

  } catch(e) {
    showToast('✕ Erro: ' + e.message);
    btn.disabled=false; btn.innerText='▶  Executar Auditoria';
    loading.classList.remove('active');
  }
}

function renderCards(results, pathInput, activeModel){
  const container = document.getElementById('cardsContainer');
  container.innerHTML = '';
  
  if(!results || results.length === 0) {
      document.getElementById('resultsTitle').innerText = `Nenhum alerta encontrado em ${pathInput}`;
      document.getElementById('resultsSummary').innerHTML = `<span class="chip chip-fp">Código Seguro</span>`;
      return;
  }

  document.getElementById('resultsTitle').innerText = `${results.length} alertas analisados · ${pathInput}`;
  
  window.currentScanResults = results; // Save for modal

  let high=0, med=0, low=0, fp=0;
  results.forEach(r => {
      if(r.type === 'SCA') {
        const scaSev = (r.scaDetails?.severity || 'LOW').toUpperCase();
        if(scaSev === 'CRITICAL' || scaSev === 'HIGH') high++;
        else if(scaSev === 'MODERATE' || scaSev === 'MEDIUM') med++;
        else low++;
      } else {
        if(r.aiValidation?.status === 'False Positive') fp++;
        else if(r.finding?.extra?.severity === 'ERROR') high++;
        else if(r.finding?.extra?.severity === 'WARNING') med++;
        else low++;
      }
  });

  document.getElementById('resultsSummary').innerHTML = `
      ${high > 0 ? `<span class="chip chip-high">${high} Alta</span>` : ''}
      ${med > 0 ? `<span class="chip chip-med">${med} Média</span>` : ''}
      ${low > 0 ? `<span class="chip chip-low">${low} Baixa</span>` : ''}
      ${fp > 0 ? `<span class="chip chip-fp">${fp} Falso Positivo</span>` : ''}
  `;

  // Motion choreography (max ~400ms delay total to follow 1/3 rule stagger limits)
  const baseDelay = 60; 

  results.forEach((r, i)=>{
    const card=document.createElement('div');
    
    let isFp = false;
    let severity = 'Baixa';
    let checkId = '';
    let filePath = '';
    let codeSnippet = '';
    let reasonText = '';
    let explicacaoText = '';

    if (r.type === 'SCA') {
       const scaSev = (r.scaDetails?.severity || 'LOW').toUpperCase();
       severity = (scaSev === 'HIGH' || scaSev === 'CRITICAL') ? 'Alta' : ((scaSev === 'MODERATE' || scaSev === 'MEDIUM') ? 'Média' : 'Baixa');
       checkId = r.scaDetails?.vulnerabilityId || 'SCA-VULN';
       filePath = `${r.scaDetails?.package} @ ${r.scaDetails?.version}`;
       codeSnippet = r.scaDetails?.summary || 'Nenhuma descrição resumida fornecida pela auditoria.';
       reasonText = r.scaDetails?.details || 'Vulnerabilidade identificada na árvore de dependências do NPM.';
       explicacaoText = 'Recomendação: Atualize o pacote vulnerável para a versão mais recente com patch de segurança.';
    } else {
       isFp = r.aiValidation?.status === 'False Positive';
       severity = r.finding?.extra?.severity === 'ERROR' ? 'Alta' : (r.finding?.extra?.severity === 'WARNING' ? 'Média' : 'Baixa');
       checkId = r.finding?.check_id || 'Unknown';
       filePath = `${r.finding?.path}:${r.finding?.start?.line}`;
       codeSnippet = r.finding?.extra?.lines || '';
       reasonText = r.aiValidation?.reason || 'Sem justificativa fornecida.';
       explicacaoText = r.aiValidation?.explicacao || 'Nenhuma explicação estendida da IA disponível.';
    }

    card.className='vuln-card bezel-shell sm' + (isFp ? ' card-fp' : '');
    card.innerHTML=`
      <div class="bezel-core">
        <div class="vuln-header">
          <div class="vuln-title">${checkId}</div>
          <span class="badge ${isFp ? 'safe' : 'high'}">${isFp ? '✓ Falso Positivo' : '✕ Risco Confirmado'}</span>
        </div>
        <div style="font-family:var(--mono); font-size:11px; color:var(--text-3); margin-bottom:12px;">${filePath}</div>
        
        ${r.type === 'SCA' 
          ? `<div class="code-block">${codeSnippet}</div>`
          : `<div class="code-block">${formatCodeSnippet(codeSnippet)}</div>`
        }
        
        <div style="margin-top:16px;">
           <div style="font-size: 13px; color: var(--text-2); margin-bottom: 6px; line-height: 1.5;">
             <b style="color: var(--text-1);">${r.type === 'SCA' ? 'Auditoria de Dependência:' : 'Parecer Semântico da IA:'}</b> ${reasonText}
           </div>
           ${explicacaoText ? `<div style="font-size: 12px; color: var(--text-3); margin-bottom: 12px; line-height: 1.45;">${explicacaoText}</div>` : ''}
           
           <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
             <span class="pill">
                Motor: <strong style="color: var(--text-1);">${r.type === 'SCA' ? 'NPM Audit (SCA)' : activeModel}</strong>
             </span>
             ${!isFp ? `<button class="btn-outline" onclick="showDetails(${i})" style="padding: 6px 12px;">Inspecionar Alerta</button>` : ''}
           </div>
        </div>
      </div>`;
    
    container.appendChild(card);
    
    const staggerDelay = Math.min(i * baseDelay, 400); // Capped stagger

    setTimeout(()=>{
      card.classList.add('show');
    }, staggerDelay);

    setTimeout(()=>{
      card.classList.remove('scanning');
    }, staggerDelay + 500);
  });
}

function formatCodeSnippet(lines) {
    if (!lines) return '';
    return lines.split('\n').map((line, idx) => {
        return `<span class="ln">${idx + 1}</span>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br>`;
    }).join('');
}

/* ---------- history ---------- */
async function fillHistory(){
    try {
        // Carrega KPIs agregados
        try {
            const statsRes = await fetch('/api/history/stats', { headers: getAuthHeaders() });
            if (statsRes.ok) {
                const stats = await statsRes.json();
                const sEl = document.getElementById('kpiTotalScans');
                const aEl = document.getElementById('kpiTotalAlerts');
                const mEl = document.getElementById('kpiUniqueModels');
                if (sEl) sEl.innerText = stats.totalScans || 0;
                if (aEl) aEl.innerText = stats.totalAlerts || 0;
                if (mEl) mEl.innerText = stats.uniqueModels || 0;
            }
        } catch(e) {
            console.warn('Falha ao carregar KPIs', e);
        }

        const response = await fetch('/api/history', { headers: getAuthHeaders() });
        const data = await response.json();
        
        const body=document.getElementById('histBody');
        if(Array.isArray(data) && data.length > 0) {
            const countEl = document.getElementById('histCount');
            if (countEl) countEl.innerText = `${data.length} auditorias registradas`;
            
            const isAdmin = currentUser && currentUser.role === 'admin';
            body.innerHTML = data.map(h => {
                const shortPath = h.targetPath ? h.targetPath.split('/').slice(-2).join('/') : '-';
                const n = h.totalAlerts || 0;
                const badgeClass = n === 0 ? 'zero' : n >= 5 ? 'high' : n >= 2 ? 'medium' : 'low';
                const model = (h.modelUsed || 'local').replace(':', ' ');
                const ts = new Date(h.timestamp);
                const tsDate = ts.toLocaleDateString('pt-BR');
                const tsTime = ts.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                return `
                <tr>
                    <td>
                      <span style="font-family:var(--mono); font-size:11px; color:var(--accent); letter-spacing:0.04em;">${h.id.substring(0,8)}</span>
                    </td>
                    <td>
                      <div style="font-size:12px; color:var(--text-1);">${tsDate}</div>
                      <div style="font-family:var(--mono); font-size:10px; color:var(--text-3);">${tsTime}</div>
                    </td>
                    <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${h.targetPath}">
                      <div style="font-family:var(--mono); font-size:11.5px; color:var(--text-1); overflow:hidden; text-overflow:ellipsis;">${shortPath}</div>
                      <div style="font-size:10px; color:var(--text-3); margin-top:2px;">${model}</div>
                    </td>
                    <td style="text-align:center;">
                      <span class="badge-count ${badgeClass}">${n}</span>
                    </td>
                    <td style="text-align:center;">
                        <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                            <button class="action-btn-sm" title="Reabrir e inspecionar este relatório" onclick="loadScanIntoView('${h.id}')">
                                <i class="ph-light ph-eye"></i> Ver
                            </button>
                            <button class="action-btn-sm" title="Baixar relatório SARIF 2.1.0" onclick="downloadSarif('${h.id}')">
                                <i class="ph-light ph-download-simple"></i> SARIF
                            </button>
                            ${isAdmin ? `
                            <button class="action-btn-sm action-btn-danger" title="Excluir permanentemente (Admin)" onclick="deleteHistoryScan('${h.id}')">
                                <i class="ph-light ph-trash"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        } else {
            body.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px; color:var(--text-3);">Nenhuma auditoria registrada até o momento.</td></tr>';
            const countEl = document.getElementById('histCount');
            if (countEl) countEl.innerText = '0 auditorias';
        }
    } catch(e) {
        console.error('Failed to load history', e);
    }
}

async function loadScanIntoView(id){
    try {
        showToast('Carregando relatório da auditoria...');
        const res = await fetch(`/api/history/${id}`, { headers: getAuthHeaders() });
        if (!res.ok) {
            showToast('✕ Não foi possível carregar os detalhes do scan.');
            return;
        }
        const data = await res.json();
        currentScanId = id;
        
        const pathInput = document.getElementById('pathInput');
        if (pathInput && data.entry && data.entry.targetPath) {
            pathInput.value = data.entry.targetPath;
        }

        document.getElementById('emptyState').style.display='none';
        document.getElementById('resultsWrap').classList.add('active');

        renderCards(data.results, data.entry?.targetPath || './src', data.entry?.modelUsed || 'Audit');

        const titleEl = document.getElementById('resultsTitle');
        if (titleEl) {
            titleEl.innerText = `${data.results.length} alertas carregados do histórico (${id.substring(0,8)})`;
        }

        switchTab('scan');
        window.scrollTo(0, 260);
        showToast(`✓ Auditoria ${id.substring(0,8)} carregada no painel!`);
    } catch(e) {
        console.error('Erro ao carregar histórico no painel', e);
        showToast('✕ Erro ao abrir auditoria.');
    }
}

async function deleteHistoryScan(id){
    if (!confirm(`Deseja realmente remover o scan ${id.substring(0,8)} do histórico?`)) return;
    try {
        const res = await fetch(`/api/history/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showToast('✓ Registro removido com sucesso.');
            fillHistory();
            loadAuditLogs();
        } else {
            const data = await res.json();
            showToast(`✕ ${data.error || 'Erro ao remover scan'}`);
        }
    } catch(e) {
        showToast('✕ Erro de conexão.');
    }
}

function downloadSarif(id){
  window.location.href = `/api/export/sarif?id=${id}&token=${CG_TOKEN}`;
  showToast('⇩ Download SARIF iniciado');
}

/* ---------- settings ---------- */
const providerHints={
  'ollama':'Inferência 100% local. Nenhum código é enviado para fora da máquina.',
  'openai':'Requer chave de API da OpenAI. O código analisado é enviado para a API da OpenAI.',
  'google':'Requer chave de API do Google AI Studio. O código analisado é enviado para a API do Gemini.'
};

const providerModels = {
  'ollama': ['qwen2.5:7b', 'llama3.1:8b', 'gemma2:9b'],
  'openai': ['gpt-4o', 'gpt-4o-mini'],
  'google': ['gemini-1.5-pro', 'gemini-1.5-flash']
};

const modelInfos = {
  'qwen2.5:7b': { title: 'Qwen 2.5 7B (Recomendado)', text: 'Campeão dos testes locais. Taxa de 100% de acerto nas vulnerabilidades testadas (0 FNs, 0 FPs) com altíssima velocidade. <strong>Requisito: 8GB+ RAM.</strong>' },
  'llama3.1:8b': { title: 'Llama 3.1 8B', text: 'Excelente aderência a regras, mas demonstra ser excessivamente cauteloso (gerou falso alerta de SQLi durante testes). <strong>Requisito: 8GB+ RAM.</strong>' },
  'gemma2:9b': { title: 'Gemma 2 9B', text: 'Bom raciocínio lógico pelo tamanho, ótimo para contextos mais longos localmente. <strong>Requisito: 12GB+ RAM.</strong>' },
  'phi3.5': { title: 'Phi 3.5', text: '<span style="color:var(--danger)">Não Recomendado.</span> Exibiu alucinações e problemas graves de formatação JSON no benchmark, quebrando o pipeline. <strong>Requisito: 4GB+ RAM.</strong>' },
  'deepseek-coder-v2': { title: 'DeepSeek Coder V2', text: 'Especialista em código e sintaxe pesada, porém extremamente exigente em memória de vídeo. <strong>Requisito crítico: 16GB+ RAM/VRAM.</strong>' },
  
  'gpt-4o': { title: 'GPT-4o (Nuvem)', text: 'Alta precisão, retórica impecável e zero custo computacional na máquina local. Ideal para auditorias onde privacidade não é uma barreira.' },
  'gpt-4o-mini': { title: 'GPT-4o Mini (Nuvem)', text: 'Versão rápida e econômica, com raciocínio levemente inferior ao modelo principal, mas ótimo para triagem em massa.' },
  
  'gemini-1.5-pro': { title: 'Gemini 1.5 Pro (Nuvem)', text: 'Possui gigantesca janela de contexto, permitindo que a IA entenda relacionamentos complexos entre dezenas de arquivos simultaneamente.' },
  'gemini-1.5-flash': { title: 'Gemini 1.5 Flash (Nuvem)', text: 'Modelo super veloz do Google, excelente para triagens unitárias e respostas instantâneas na nuvem.' }
};

async function loadSettings() {
    try {
        const res = await fetch('/api/config', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data) {
            window.__savedKeys = {
                openai: data.openaiApiKey || '',
                google: data.googleApiKey || ''
            };

            document.getElementById('providerSelect').value = data.provider || 'ollama';
            onProviderChange();
            
            const modelSelect = document.getElementById('modelSelect');
            if (data.model && providerModels[data.provider || 'ollama'].includes(data.model)) {
                modelSelect.value = data.model;
            } else if (data.model) {
                modelSelect.innerHTML += `<option value="${data.model}">${data.model} (Custom)</option>`;
                modelSelect.value = data.model;
            }
            
            onModelChange();
            
            const providerName = data.provider === 'google' ? 'Gemini' : (data.provider === 'openai' ? 'OpenAI' : 'Ollama');
            document.getElementById('statusDot').className = 'dot-live';
            document.getElementById('statusText').innerText = `${providerName} · ${data.model || 'ativo'}`;
        }
    } catch(e) {
        document.getElementById('statusDot').className = 'dot-offline';
        document.getElementById('statusText').innerText = 'Offline';
    }
}

async function updateHealthStatus() {
    try {
      const res = await fetch('/api/health', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      
      const { ollama, openai, gemini, activeProvider } = data;
      
      const activeObjKey = activeProvider === 'google' ? 'gemini' : activeProvider;
      const activeObj = data[activeObjKey];
      const providerName = activeProvider === 'google' ? 'Gemini' : (activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1));
      
      const statusText = document.getElementById('statusText');
      const statusDot = document.getElementById('statusDot');
      
      if (activeObj && activeObj.status === 'online') {
        statusText.innerText = `${providerName} · ${activeObj.model} (Online, ${activeObj.latencyMs}ms)`;
        statusDot.style.background = 'var(--success)';
      } else {
        statusText.innerText = `${providerName} · Offline / Config Inválida`;
        statusDot.style.background = 'var(--fp)';
      }
      
      const updateIcon = (id, obj) => {
        const el = document.getElementById(id);
        if(!el) return;
        if(obj.status === 'online') {
            el.innerHTML = `<span class="iconify" data-icon="lucide:check-circle" style="color:var(--success)"></span>`;
            el.title = `Online (${obj.latencyMs}ms)`;
        } else if (obj.status === 'unconfigured') {
            el.innerHTML = `<span class="iconify" data-icon="lucide:minus-circle" style="color:var(--text-3)"></span>`;
            el.title = `Não configurado`;
        } else {
            el.innerHTML = `<span class="iconify" data-icon="lucide:x-circle" style="color:var(--fp)"></span>`;
            el.title = `Offline / Erro de conexão`;
        }
      };
      
      updateIcon('status-openai', openai);
      updateIcon('status-gemini', gemini);
      
    } catch(err) {
      console.log('Erro no health check', err);
    }
}

function onProviderChange(){
  try {
      const provider = document.getElementById('providerSelect').value;
      
      let hint = providerHints[provider] || '';
      const hintEl = document.getElementById('providerHint');
      if(hintEl) hintEl.innerText = hint;
      
      const modelSelect = document.getElementById('modelSelect');
      modelSelect.innerHTML = providerModels[provider].map(m => `<option value="${m}">${m}</option>`).join('');
      
      onModelChange();

      let container = document.getElementById('dynamicApiContainer');
      if (!container) {
          container = document.createElement('div');
          container.id = 'dynamicApiContainer';
          const saveRow = document.querySelector('.save-row');
          if (saveRow && saveRow.parentNode) {
            saveRow.parentNode.insertBefore(container, saveRow);
          }
      }
      
      if (provider === 'ollama') {
          container.innerHTML = '';
          window.__currentProviderType = 'ollama';
      } else {
          const placeholder = provider === 'openai' ? 'sk-••••••••••••••••••••••••' : 'AIza••••••••••••••••••••••••';
          const savedKey = window.__savedKeys ? window.__savedKeys[provider] : '';
          
          container.innerHTML = `
            <div class="field" style="margin-top: 16px;">
              <label>API Key (${provider === 'openai' ? 'OpenAI' : 'Google Gemini'})</label>
              <div class="key-input-wrap" style="display:flex; gap:10px; align-items:center;">
                <div style="position:relative; flex:1;">
                  <input type="password" id="magicalApiKey" placeholder="${placeholder}" value="${savedKey}" style="width:100%;">
                  <button class="eye-btn" onclick="toggleKeyVisibility()" id="eyeBtn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); display:flex; align-items:center;" title="Alternar visibilidade">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                </div>
                <span id="status-${provider}" style="display:flex; align-items:center; width:20px; height:20px;"></span>
              </div>
              <div class="hint" style="margin-top: 8px;">Armazenada apenas localmente, nunca enviada além do provedor selecionado.</div>
            </div>
          `;
          window.__currentProviderType = provider;
          updateHealthStatus();
      }
      
  } catch (err) {
      console.error('ERRO no onProviderChange', err);
  }
}

function onModelChange() {
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect) return;
  const model = modelSelect.value;
  const infoBox = document.getElementById('benchmarkInfo');
  if (!infoBox) return;
  const info = modelInfos[model] || { title: 'Modelo Customizado', text: 'Sem dados de benchmark para este modelo específico.' };
  
  infoBox.innerHTML = `
    <h3 style="font-family: var(--mono); font-size: 13.5px; margin-bottom: 10px; margin-top: 24px; font-weight: 600;">Specs: ${info.title}</h3>
    <p style="font-size: 13px; color: var(--text-2); line-height: 1.6;">${info.text}</p>
  `;
}

function toggleKeyVisibility(){
  const input = document.getElementById('magicalApiKey');
  if(!input) return;
  input.type = (input.type === 'password') ? 'text' : 'password';
}

async function saveSettings(){
  if (currentUser && currentUser.role !== 'admin') {
    showToast('✕ Apenas Administradores podem salvar configurações.');
    return;
  }

  const provider = document.getElementById('providerSelect').value;
  const model = document.getElementById('modelSelect').value;
  
  const magicInput = document.getElementById('magicalApiKey');
  const currentKey = magicInput ? magicInput.value : '';
  
  const openaiApiKey = (provider === 'openai') ? currentKey : (window.__savedKeys?.openai || '');
  const googleApiKey = (provider === 'google') ? currentKey : (window.__savedKeys?.google || '');
  
  if (window.__savedKeys) {
      if (provider === 'openai') window.__savedKeys.openai = currentKey;
      if (provider === 'google') window.__savedKeys.google = currentKey;
  }

  try {
      const res = await fetch('/api/config', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ provider, model, openaiApiKey, googleApiKey })
      });
      const data = await res.json();
      if(data.success) {
          const msg=document.getElementById('saveMsg');
          msg.classList.add('show');
          showToast('✓ Configurações salvas com sucesso');
          setTimeout(()=>msg.classList.remove('show'),2400);
          loadSettings(); // update status indicator
          loadAuditLogs(); // Refresh audit logs
      } else {
          showToast(`✕ ${data.error || 'Erro ao salvar'}`);
      }
  } catch(e) {
      showToast('✕ Erro de conexão');
  }
}

/* ---------- toast ---------- */
let toastTimer;
function showToast(text){
  const t=document.getElementById('toast');
  t.innerText=text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}

// Keep the token in URL if user navigates manually
if(window.location.pathname === '/' && CG_TOKEN) {
    loadSettings();
}

// Inicializa a select box com os modelos do provider padrão (Ollama) ao carregar
onProviderChange();

function showDetails(index) {
  const result = window.currentScanResults[index];
  if (!result) return;
  
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  modalTitle.innerText = result.type === 'SCA' ? 'Detalhes de Dependência' : 'Detalhes da Análise SAST';
  
  modalBody.innerHTML = `<pre style="background: var(--void); padding: 12px; border-radius: 6px; white-space: pre-wrap; font-family: var(--mono);">${JSON.stringify(result, null, 2)}</pre>`;
  
  modal.showModal();
}

/* ============ AUTENTICAÇÃO E RBAC ============ */
async function checkAuth() {
  const token = localStorage.getItem('cg_auth_token');
  if (token) {
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        updateUIForUser(currentUser);
        return;
      }
    } catch (e) {
      console.warn('Falha ao validar token existente', e);
    }
  }

  // Se não houver sessão ativa, faz login automático como Admin para facilidade de teste
  await login('admin', 'admin123', true);
}

async function login(username, password, silent = false) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CypherGuard-Token': CG_TOKEN },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      if (!silent) {
        const errEl = document.getElementById('loginErrorMsg');
        if (errEl) errEl.innerText = data.error || 'Credenciais inválidas.';
      }
      return false;
    }

    localStorage.setItem('cg_auth_token', data.token);
    currentUser = data.user;
    updateUIForUser(currentUser);
    closeLoginModal();
    if (!silent) {
      showToast(`✓ Conectado como ${currentUser.name} (${currentUser.role.toUpperCase()})`);
    }

    // Atualiza histórico e controle de acesso se visíveis
    fillHistory();
    loadUsers();
    loadAuditLogs();
    return true;
  } catch (e) {
    console.error('Erro no login', e);
    if (!silent) {
      const errEl = document.getElementById('loginErrorMsg');
      if (errEl) errEl.innerText = 'Erro ao conectar com o servidor.';
    }
    return false;
  }
}

async function logout() {
  const token = localStorage.getItem('cg_auth_token');
  if (token) {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch (e) {}
  }
  localStorage.removeItem('cg_auth_token');
  currentUser = null;
  showToast('Sessão encerrada.');
  updateUIForUser({ username: 'Visitante', role: 'auditor', name: 'Não Autenticado' });
  openLoginModal();
}

function updateUIForUser(user) {
  if (!user) return;
  const nameEl = document.getElementById('sbUserName');
  const badgeEl = document.getElementById('sbUserBadge');
  if (nameEl) nameEl.innerText = user.username;
  if (badgeEl) {
    badgeEl.innerText = (user.role || 'GUEST').toUpperCase();
    badgeEl.className = `badge-role badge-${user.role || 'auditor'}`;
  }

  const isAuditor = user.role === 'auditor';
  const isAdmin = user.role === 'admin';

  // Banner e botão de scan
  const audWarn = document.getElementById('auditorWarning');
  const runBtn = document.getElementById('runBtn');
  if (audWarn) audWarn.classList.toggle('hidden', !isAuditor);
  if (runBtn) {
    if (isAuditor) {
      runBtn.disabled = true;
      runBtn.style.opacity = '0.5';
      runBtn.style.cursor = 'not-allowed';
      runBtn.title = 'Modo Auditor: Apenas leitura';
    } else {
      runBtn.disabled = false;
      runBtn.style.opacity = '1';
      runBtn.style.cursor = 'pointer';
      runBtn.title = '';
    }
  }

  // Trava de configurações
  const setWarn = document.getElementById('settingsRoleWarning');
  const saveBtn = document.getElementById('btnSaveSettings');
  if (setWarn) setWarn.classList.toggle('hidden', isAdmin);
  if (saveBtn) {
    saveBtn.disabled = !isAdmin;
    saveBtn.style.opacity = isAdmin ? '1' : '0.5';
    saveBtn.style.cursor = isAdmin ? 'pointer' : 'not-allowed';
  }

  // Formulário de criar usuário (apenas admin)
  const createForm = document.getElementById('createUserFormWrap');
  if (createForm) {
    createForm.style.display = isAdmin ? 'block' : 'none';
  }
}

function openLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) {
    m.classList.remove('hidden');
    const errEl = document.getElementById('loginErrorMsg');
    if (errEl) errEl.innerText = '';
  }
}

function closeLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.classList.add('hidden');
}

function fillLoginPreset(u, p) {
  const uEl = document.getElementById('loginUsername');
  const pEl = document.getElementById('loginPassword');
  if (uEl) uEl.value = u;
  if (pEl) pEl.value = p;
  const errEl = document.getElementById('loginErrorMsg');
  if (errEl) errEl.innerText = '';
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value;
  await login(u, p, false);
}

/* ============ USUÁRIOS E AUDITORIA ============ */
async function loadUsers() {
  try {
    const res = await fetch('/api/auth/users', { headers: getAuthHeaders() });
    const tbody = document.getElementById('userListBody');
    const countEl = document.getElementById('userCount');
    if (!res.ok) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; color:var(--text-3); text-align:center;">Apenas Administradores podem visualizar a lista de usuários.</td></tr>`;
      if (countEl) countEl.innerText = 'Restrito (Admin)';
      return;
    }
    const users = await res.json();
    if (countEl) countEl.innerText = `${users.length} usuários cadastrados`;
    if (tbody) {
      tbody.innerHTML = users.map(u => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding:8px 10px; font-weight:600; font-family:var(--mono);">${u.username}</td>
          <td style="padding:8px 10px; color:var(--text-2);">${u.name}</td>
          <td style="padding:8px 10px;"><span class="badge-role badge-${u.role}">${u.role.toUpperCase()}</span></td>
          <td style="padding:8px 10px; color:var(--text-3); font-family:var(--mono); font-size:11px;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Nunca'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Erro ao listar usuários', e);
  }
}

async function submitNewUser() {
  const u = document.getElementById('newUsername').value.trim();
  const n = document.getElementById('newName').value.trim();
  const p = document.getElementById('newPassword').value;
  const r = document.getElementById('newRole').value;

  if (!u || !n || !p) {
    showToast('✕ Preencha usuário, nome e senha.');
    return;
  }

  try {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ username: u, name: n, password: p, role: r })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`✕ ${data.error || 'Erro ao criar usuário'}`);
      return;
    }
    showToast(`✓ Usuário "${u}" criado com sucesso!`);
    document.getElementById('newUsername').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newPassword').value = '';
    loadUsers();
    loadAuditLogs();
  } catch (e) {
    showToast('✕ Falha ao criar usuário.');
  }
}

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/audit?limit=40', { headers: getAuthHeaders() });
    const tbody = document.getElementById('auditListBody');
    if (!tbody) return;
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; color:var(--text-3); text-align:center;">Apenas Administradores e Auditores podem consultar a trilha de auditoria.</td></tr>`;
      return;
    }
    const logs = await res.json();
    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; color:var(--text-3); text-align:center;">Nenhum registro de auditoria disponível.</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr class="log-entry">
        <td style="font-family:var(--mono); font-size:11px; color:var(--text-3);">${new Date(l.timestamp).toLocaleTimeString()}</td>
        <td><span class="badge-role badge-${l.role}">${l.username}</span></td>
        <td style="font-weight:600;">${l.action}</td>
        <td style="color:var(--text-2); font-size:11px;" title="${l.details || ''}">${l.details || '-'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Erro ao carregar logs', e);
  }
}

// Inicializa a checagem de sessão ao carregar a página
checkAuth();

/* ==========================================================================
   INTERACTIVE 3D CYBER LATTICE & HOLOGRAPHIC SHIELD CANVAS (LANDING PAGE)
   ========================================================================== */
function init3dHeroCanvas() {
  const canvas = document.getElementById('hero3dCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = Math.min(window.innerHeight, 900));

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = Math.min(window.innerHeight, 900);
  });

  let mouse = { x: width * 0.7, y: height * 0.45, targetX: width * 0.7, targetY: height * 0.45 };
  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
  });

  const baseShield = [
    { x: 0, y: -130, z: 0 },
    { x: 95, y: -110, z: 20 },
    { x: 105, y: 10, z: 25 },
    { x: 75, y: 85, z: 15 },
    { x: 0, y: 140, z: 0 },
    { x: -75, y: 85, z: 15 },
    { x: -105, y: 10, z: 25 },
    { x: -95, y: -110, z: 20 },
  ];

  const innerCore = [
    { x: 0, y: -60, z: 35 },
    { x: 50, y: -10, z: 40 },
    { x: 0, y: 65, z: 35 },
    { x: -50, y: -10, z: 40 },
  ];

  const particleCount = 42;
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      theta: (i / particleCount) * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.008,
      yOffset: (Math.random() - 0.5) * 160,
      radius: 170 + Math.random() * 80,
      size: 1.5 + Math.random() * 2,
      pulse: Math.random() * Math.PI,
    });
  }

  let angleY = 0;
  let angleX = 0;

  function render() {
    // Only render if page-landing is not hidden
    const landing = document.getElementById('page-landing');
    if (landing && landing.classList.contains('hidden')) {
      requestAnimationFrame(render);
      return;
    }

    ctx.clearRect(0, 0, width, height);
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    const originX = width > 900 ? width * 0.72 : width * 0.5;
    const originY = height > 600 ? height * 0.44 : height * 0.5;

    const targetAngleY = ((mouse.x - originX) / width) * 0.8;
    const targetAngleX = -((mouse.y - originY) / height) * 0.6;
    angleY += (targetAngleY - angleY) * 0.06;
    angleX += (targetAngleX - angleX) * 0.06;

    const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX), sinX = Math.sin(angleX);

    function project(p) {
      let x1 = p.x * cosY + p.z * sinY;
      let y1 = p.y;
      let z1 = -p.x * sinY + p.z * cosY;
      let x2 = x1;
      let y2 = y1 * cosX - z1 * sinX;
      let z2 = y1 * sinX + z1 * cosX;
      const fov = 420;
      const scale = fov / (fov + z2);
      return { x: originX + x2 * scale, y: originY + y2 * scale, scale: scale, z: z2 };
    }

    particles.forEach((pt) => {
      pt.theta += pt.speed;
      pt.pulse += 0.03;
      const px = Math.cos(pt.theta) * pt.radius;
      const pz = Math.sin(pt.theta) * pt.radius;
      const py = pt.yOffset + Math.sin(pt.pulse) * 15;
      const proj = project({ x: px, y: py, z: pz });
      const alpha = Math.max(0.1, (proj.scale - 0.7) * 0.8);

      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, pt.size * proj.scale, 0, Math.PI * 2);
      ctx.fill();

      if (Math.sin(pt.theta) > 0.4) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.15})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y);
        const coreProj = project({ x: 0, y: 0, z: 20 });
        ctx.lineTo(coreProj.x, coreProj.y);
        ctx.stroke();
      }
    });

    const projShield = baseShield.map(project);
    const projCore = innerCore.map(project);
    const centerProj = project({ x: 0, y: 0, z: 20 });

    const radialGlow = ctx.createRadialGradient(centerProj.x, centerProj.y, 10, centerProj.x, centerProj.y, 160);
    radialGlow.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
    radialGlow.addColorStop(0.6, 'rgba(18, 22, 31, 0.05)');
    radialGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(centerProj.x, centerProj.y, 160, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(projShield[0].x, projShield[0].y);
    for (let i = 1; i < projShield.length; i++) ctx.lineTo(projShield[i].x, projShield[i].y);
    ctx.closePath();

    const shieldGrad = ctx.createLinearGradient(projShield[0].x, projShield[0].y, projShield[4].x, projShield[4].y);
    shieldGrad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
    shieldGrad.addColorStop(0.5, 'rgba(18, 22, 31, 0.8)');
    shieldGrad.addColorStop(1, 'rgba(9, 12, 16, 0.9)');
    ctx.fillStyle = shieldGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < projShield.length; i++) {
      ctx.beginPath();
      ctx.moveTo(projShield[i].x, projShield[i].y);
      ctx.lineTo(centerProj.x, centerProj.y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(projCore[0].x, projCore[0].y);
    for (let i = 1; i < projCore.length; i++) ctx.lineTo(projCore[i].x, projCore[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    requestAnimationFrame(render);
  }

  render();
}

/* ============ SPOTLIGHT MOUSE-TRACKER ============ */
function initSpotlightHover() {
  const cards = document.querySelectorAll('.bento-card, .playground-shell');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--spotlight-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--spotlight-y', `${e.clientY - rect.top}px`);
    });
  });
}

function initCopyButtons() {
  const cliBox = document.getElementById('cliInstallBox');
  const copyBubble = document.getElementById('cliCopyBubble');
  if (cliBox && copyBubble) {
    cliBox.addEventListener('click', () => {
      navigator.clipboard.writeText('npx cypherguard-ai scan ./src');
      copyBubble.classList.add('active');
      setTimeout(() => copyBubble.classList.remove('active'), 2000);
    });
  }
}
function animatePlaygroundTabs() {
  const tabs = ['logs', 'ai', 'diff'];
  let currentIdx = 0;
  setInterval(() => {
    // Only animate if the user hasn't hovered over the window
    const window = document.querySelector('.hero-ui-window');
    if (window && window.matches(':hover')) return;
    
    currentIdx = (currentIdx + 1) % tabs.length;
    if (typeof switchPlaygroundTab === 'function') {
      switchPlaygroundTab(tabs[currentIdx]);
    }
  }, 4000);
}

// Inicializações da nova landing
// init3dHeroCanvas();
initSpotlightHover();
initCopyButtons();
animatePlaygroundTabs();

