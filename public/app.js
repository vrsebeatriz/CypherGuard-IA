const urlParams = new URLSearchParams(window.location.search);
let CG_TOKEN = urlParams.get('token') || '';
if (!CG_TOKEN) {
    const metaToken = document.querySelector('meta[name="cg-token"]');
    if (metaToken) {
        CG_TOKEN = metaToken.getAttribute('content') || '';
    }
}

const headers = {
    'Content-Type': 'application/json',
    'X-CypherGuard-Token': CG_TOKEN
};

/* ---------- terminal hero typing ---------- */
const termLines = [
  {html:'<span class="t-prompt">❯</span> <span class="t-path">cypherguard scan ./src/api --ai=local</span>'},
  {html:'<span class="t-fp">6 candidatos encontrados pelo Semgrep</span>'},
  {html:'<span class="t-fp strike-target">[MED] eval() em utils/parser.py:44 <span class="tag tag-fp">IA: descartado</span></span>'},
  {html:'<span class="t-fp strike-target">[BAI] hardcoded secret em config.py:12 <span class="tag tag-fp">IA: descartado</span></span>'},
  {html:'<span class="t-tp">[ALTA] SQL Injection em db/query.py:88 <span class="tag tag-tp">IA: confirmado</span></span>'},
  {html:'<span class="t-fp strike-target">[BAI] regex vulnerável em routes.py:120 <span class="tag tag-fp">IA: descartado</span></span>'},
  {html:'<span class="t-tp">[ALTA] Path Traversal em files/handler.py:31 <span class="tag tag-tp">IA: confirmado</span></span>'},
  {html:'<span class="t-fp">3 falsos positivos removidos · 2 reais confirmados</span>'},
  {html:'<span class="t-prompt">❯</span> <span class="cursor"></span>'}
];
function typeTerminal(){
  const body=document.getElementById('termBody');
  if(!body) return;
  body.innerHTML='';
  termLines.forEach((l,i)=>{
    const div=document.createElement('div');
    div.className='term-line';
    div.style.animationDelay=(i*0.42)+'s';
    div.innerHTML=l.html;
    body.appendChild(div);
  });
}
typeTerminal();
setInterval(typeTerminal, termLines.length*420+2600);

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
  document.getElementById('tab-'+name).classList.add('active');
}

/* ---------- API Logic ---------- */
let currentScanId = null;

async function runScan(){
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
        headers,
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

    const sevClass = severity === 'Alta' ? 'sev-alta' : (severity === 'Média' ? 'sev-media' : 'sev-baixa');
    
    card.className='vuln-card solid-panel scanning' + (isFp ? ' card-fp' : '');
    card.innerHTML=`
      <div class="vc-top" style="padding: 20px; display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 1px solid var(--border);">
        <div style="display:flex; gap:16px; align-items:flex-start;">
          <span class="sev ${sevClass}" style="margin-top:2px;">${severity.toUpperCase()}</span>
          <div>
            <div style="font-family: var(--mono); font-weight:600; font-size:14.5px; color:var(--text-1); margin-bottom:6px;">${checkId}</div>
            <div style="font-size:12.5px; color:var(--text-3);"><span class="iconify" data-icon="lucide:file-code" style="margin-right:4px;"></span>${filePath}</div>
          </div>
        </div>
        <div style="padding: 6px 12px; border-radius: 6px; font-size:11.5px; font-weight:600; border: 1px solid var(--border-hi); display:flex; align-items:center; gap:6px; background: var(--void); color: ${isFp ? 'var(--text-3)' : 'var(--success)'}">
          ${isFp ? '✕ Falso Positivo' : '✓ Risco Confirmado'}
        </div>
      </div>
      
      ${r.type === 'SCA' 
        ? `<div style="padding: 16px 20px; font-size: 13.5px; color: var(--text-2); background: rgba(255,255,255,0.015); border-bottom: 1px solid var(--border); line-height: 1.6;">${codeSnippet}</div>`
        : `<div class="vc-code">${formatCodeSnippet(codeSnippet)}</div>`
      }
      
      <div class="vc-bottom" style="padding: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div class="vc-note" style="max-width:75%;">
           <div style="font-size:13.5px; color:var(--text-1); margin-bottom:8px; line-height:1.5;">
             <b>${r.type === 'SCA' ? 'Detalhes da Análise:' : 'Parecer da IA:'}</b> ${reasonText}
           </div>
           ${explicacaoText ? `<div style="font-size:12.5px; color:var(--text-2); margin-bottom:14px; line-height: 1.5;">${explicacaoText}</div>` : ''}
           <div>
               <span style="display: inline-block; font-size: 10.5px; color: var(--text-3); font-family: var(--mono); background: var(--void); padding: 4px 10px; border-radius: 100px; border: 1px solid var(--border-hi);">
                  Motor de Validação: <strong>${r.type === 'SCA' ? 'NPM Audit (SCA)' : activeModel}</strong>
               </span>
           </div>
        </div>
        <div class="vc-actions">
          ${!isFp ? `<button class="btn-patch" style="padding: 8px 16px; font-size:12.5px; border-radius: 8px;" onclick="showDetails(${i})">Ver Detalhes Técnicos</button>` : ''}
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
        const response = await fetch('/api/history', { headers });
        const data = await response.json();
        
        const body=document.getElementById('histBody');
        if(Array.isArray(data) && data.length > 0) {
            document.getElementById('histCount').innerText = `${data.length} execuções registradas`;
            body.innerHTML = data.map(h => `
                <tr>
                    <td>${h.id.substring(0,8)}</td>
                    <td>${new Date(h.timestamp).toLocaleString()}</td>
                    <td class="badge-count" style="text-align:center; font-weight:600;">${h.totalAlerts}</td>
                    <td style="text-align:center;">
                        <button class="dl-btn" style="margin:0 auto; background:transparent; border:none; cursor:pointer; padding:6px; color:var(--primary); opacity:0.8;" title="Baixar relatório SARIF" onclick="downloadSarif('${h.id}')" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    </td>
                </tr>`).join('');
        } else {
            body.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum histórico encontrado.</td></tr>';
        }
    } catch(e) {
        console.error('Failed to load history', e);
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
        const res = await fetch('/api/config', { headers });
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
      const token = localStorage.getItem('cypher_token') || 'local';
      const res = await fetch('/api/health', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      
      const { ollama, openai, gemini, activeProvider } = data;
      
      // Update sidebar
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
      
      // Update settings tab icons if they exist
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

      // INJETANDO O INPUT VIA JAVASCRIPT PARA DRIBLAR O CACHE DO HTML/ADBLOCKERS
      let container = document.getElementById('dynamicApiContainer');
      if (!container) {
          container = document.createElement('div');
          container.id = 'dynamicApiContainer';
          // Inserir antes do botão de salvar
          const saveRow = document.querySelector('.save-row');
          saveRow.parentNode.insertBefore(container, saveRow);
      }
      
      if (provider === 'ollama') {
          container.innerHTML = ''; // Limpamos tudo, não precisamos de caixa nem hint extra
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
                  <button class="eye-btn" onclick="toggleKeyVisibility()" id="eyeBtn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%);">👁</button>
                </div>
                <span id="status-${provider}" style="display:flex; align-items:center; width:20px; height:20px;"></span>
              </div>
              <div class="hint" style="margin-top: 8px;">Armazenada apenas localmente, nunca enviada além do provedor selecionado.</div>
            </div>
          `;
          window.__currentProviderType = provider;
          updateHealthStatus(); // Atualiza instantaneamente os ícones recém-criados
      }
      
  } catch (err) {
      alert('ERRO no onProviderChange: ' + err.message);
  }
}

function onModelChange() {
  const model = document.getElementById('modelSelect').value;
  const infoBox = document.getElementById('benchmarkInfo');
  const info = modelInfos[model] || { title: 'Modelo Customizado', text: 'Sem dados de benchmark para este modelo específico.' };
  
  infoBox.innerHTML = `
    <h3 style="font-family: var(--mono); font-size: 13.5px; margin-bottom: 10px; margin-top: 24px; font-weight: 600;">⚙️ Specs: ${info.title}</h3>
    <p style="font-size: 13px; color: var(--text-2); line-height: 1.6;">${info.text}</p>
  `;
}

function toggleKeyVisibility(){
  const input = document.getElementById('magicalApiKey');
  if(!input) return;
  input.type = (input.type === 'password') ? 'text' : 'password';
}

async function saveSettings(){
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
          headers,
          body: JSON.stringify({ provider, model, openaiApiKey, googleApiKey })
      });
      const data = await res.json();
      if(data.success) {
          const msg=document.getElementById('saveMsg');
          msg.classList.add('show');
          showToast('✓ Configurações salvas com sucesso');
          setTimeout(()=>msg.classList.remove('show'),2400);
          loadSettings(); // update status indicator
      } else {
          showToast('✕ Erro ao salvar');
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
    // Initial fetch of settings to see if server is online
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
