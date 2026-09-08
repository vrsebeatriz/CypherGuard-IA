/**
 * CypherGuard AI — Award-Winning Developer Showcase Script
 * Includes: 3D Interactive Cyber Lattice/Shield Canvas, Live Security Playground,
 * Spotlight Mouse-Tracker & Copy Feedback.
 */

document.addEventListener('DOMContentLoaded', () => {
  init3dHeroCanvas();
  initSpotlightHover();
  initPlaygroundSimulator();
  initCopyButtons();
});

/* ==========================================================================
   1. INTERACTIVE 3D CYBER LATTICE & HOLOGRAPHIC SHIELD CANVAS
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

  // Mouse tracking with smooth damping
  let mouse = { x: width * 0.7, y: height * 0.45, targetX: width * 0.7, targetY: height * 0.45 };

  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
  });

  // 3D Geometry for Holographic Cyber Shield
  // Shield vertex points in 3D coordinate space (x, y, z)
  const baseShield = [
    { x: 0, y: -130, z: 0 },    // Top center
    { x: 95, y: -110, z: 20 },   // Top right
    { x: 105, y: 10, z: 25 },    // Mid right
    { x: 75, y: 85, z: 15 },    // Lower right
    { x: 0, y: 140, z: 0 },     // Bottom point
    { x: -75, y: 85, z: 15 },   // Lower left
    { x: -105, y: 10, z: 25 },   // Mid left
    { x: -95, y: -110, z: 20 },  // Top left
  ];

  // Inner core lattice
  const innerCore = [
    { x: 0, y: -60, z: 35 },
    { x: 50, y: -10, z: 40 },
    { x: 0, y: 65, z: 35 },
    { x: -50, y: -10, z: 40 },
  ];

  // Orbiting Particle Swarm
  const particleCount = 42;
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 170 + Math.random() * 80;
    particles.push({
      theta: angle,
      speed: 0.008 + Math.random() * 0.008,
      yOffset: (Math.random() - 0.5) * 160,
      radius: radius,
      size: 1.5 + Math.random() * 2,
      pulse: Math.random() * Math.PI,
    });
  }

  let angleY = 0;
  let angleX = 0;

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Smooth mouse interpolation
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    // Base origin point for 3D shield
    const originX = width > 900 ? width * 0.72 : width * 0.5;
    const originY = height > 600 ? height * 0.44 : height * 0.5;

    // Calculate rotation from mouse offset
    const targetAngleY = ((mouse.x - originX) / width) * 0.8;
    const targetAngleX = -((mouse.y - originY) / height) * 0.6;
    angleY += (targetAngleY - angleY) * 0.06;
    angleX += (targetAngleX - angleX) * 0.06;

    // 3D Projection math
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);

    function project(p) {
      // Y-axis rotation
      let x1 = p.x * cosY + p.z * sinY;
      let y1 = p.y;
      let z1 = -p.x * sinY + p.z * cosY;

      // X-axis rotation
      let x2 = x1;
      let y2 = y1 * cosX - z1 * sinX;
      let z2 = y1 * sinX + z1 * cosX;

      // Perspective scale factor
      const fov = 420;
      const scale = fov / (fov + z2);
      return {
        x: originX + x2 * scale,
        y: originY + y2 * scale,
        scale: scale,
        z: z2,
      };
    }

    // 1. Draw glowing ambient particle ring around shield
    particles.forEach((pt) => {
      pt.theta += pt.speed;
      pt.pulse += 0.03;
      const px = Math.cos(pt.theta) * pt.radius;
      const pz = Math.sin(pt.theta) * pt.radius;
      const py = pt.yOffset + Math.sin(pt.pulse) * 15;

      const proj = project({ x: px, y: py, z: pz });
      const alpha = Math.max(0.1, (proj.scale - 0.7) * 0.8);

      ctx.fillStyle = `rgba(0, 245, 160, ${alpha})`;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, pt.size * proj.scale, 0, Math.PI * 2);
      ctx.fill();

      // Laser connector lines to core
      if (Math.sin(pt.theta) > 0.4) {
        ctx.strokeStyle = `rgba(0, 245, 160, ${alpha * 0.15})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y);
        const coreProj = project({ x: 0, y: 0, z: 20 });
        ctx.lineTo(coreProj.x, coreProj.y);
        ctx.stroke();
      }
    });

    // 2. Project outer shield contour
    const projShield = baseShield.map(project);
    const projCore = innerCore.map(project);

    // Glow aura behind shield
    const centerProj = project({ x: 0, y: 0, z: 20 });
    const radialGlow = ctx.createRadialGradient(
      centerProj.x,
      centerProj.y,
      10,
      centerProj.x,
      centerProj.y,
      160
    );
    radialGlow.addColorStop(0, 'rgba(0, 245, 160, 0.22)');
    radialGlow.addColorStop(0.5, 'rgba(0, 210, 255, 0.08)');
    radialGlow.addColorStop(1, 'transparent');

    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(centerProj.x, centerProj.y, 160, 0, Math.PI * 2);
    ctx.fill();

    // Fill Outer Shield with Translucent Neural Gradient
    ctx.beginPath();
    ctx.moveTo(projShield[0].x, projShield[0].y);
    for (let i = 1; i < projShield.length; i++) {
      ctx.lineTo(projShield[i].x, projShield[i].y);
    }
    ctx.closePath();

    const shieldGrad = ctx.createLinearGradient(
      projShield[0].x,
      projShield[0].y,
      projShield[4].x,
      projShield[4].y
    );
    shieldGrad.addColorStop(0, 'rgba(0, 245, 160, 0.16)');
    shieldGrad.addColorStop(0.5, 'rgba(14, 22, 34, 0.75)');
    shieldGrad.addColorStop(1, 'rgba(0, 210, 255, 0.08)');
    ctx.fillStyle = shieldGrad;
    ctx.fill();

    // Outer Shield Stroke
    ctx.strokeStyle = 'rgba(0, 245, 160, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Shield Lattice Facet Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i < projShield.length; i++) {
      ctx.beginPath();
      ctx.moveTo(projShield[i].x, projShield[i].y);
      ctx.lineTo(centerProj.x, centerProj.y);
      ctx.stroke();
    }

    // Inner Core Diamond
    ctx.beginPath();
    ctx.moveTo(projCore[0].x, projCore[0].y);
    for (let i = 1; i < projCore.length; i++) {
      ctx.lineTo(projCore[i].x, projCore[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 245, 160, 0.28)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    requestAnimationFrame(render);
  }

  render();
}

/* ==========================================================================
   2. SPOTLIGHT MOUSE-TRACKER HOVER EFFECT (Linear / Vercel Aesthetic)
   ========================================================================== */
function initSpotlightHover() {
  const cards = document.querySelectorAll('.bento-card, .playground-shell');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--spotlight-x', `${x}px`);
      card.style.setProperty('--spotlight-y', `${y}px`);
    });
  });
}

/* ==========================================================================
   3. INTERACTIVE SECURITY PLAYGROUND SIMULATOR
   ========================================================================== */
const SCENARIOS = {
  sqli: {
    name: 'SQL Injection em Autenticação',
    file: 'src/api/auth/login.py',
    cwe: 'CWE-89 (SQL Injection)',
    rule: 'python.sqlalchemy.security.injection.tainted-sql-string',
    astFinding: 'String formatting f"SELECT * FROM users WHERE..." com parâmetro tainted `username`.',
    aiVerdict: 'TRUE POSITIVE (Confirmado por IA)',
    aiReasoning: 'A variável `username` é recebida diretamente da requisição HTTP (corpo JSON) sem sanitização ou uso de binds de parâmetros. O invasor pode injetar `\' OR \'1\'=\'1` e contornar a autenticação.',
    confidence: '99.4%',
    executionLogs: [
      { prefix: '❯', text: 'cypherguard scan ./src/api/auth --ai=ollama/llama3', class: 'log-prefix' },
      { prefix: '◈', text: '[Semgrep AST] Identificado candidato a SQLi em login.py:42', class: 'log-warn' },
      { prefix: '⌁', text: '[AST Parser] Extraindo fluxo de dados para variável `username`...', class: 'log-dim' },
      { prefix: '⚡', text: '[LLM Judge] Inspecionando sanitizadores (escapes, orm param binds)...', class: 'log-main' },
      { prefix: '⚡', text: '[LLM Judge] Nenhum sanitizador encontrado. Entrada concatena diretamente na query.', class: 'log-danger' },
      { prefix: '✓', text: '[Veredito] Risco Crítico Confirmado: CWE-89 (Confiança: 99.4%)', class: 'log-danger' },
      { prefix: '🛠', text: '[Patcher] Gerando patch seguro com queries parametrizadas SQLAlchemy...', class: 'log-safe' },
      { prefix: '📄', text: '[SARIF 2.1.0] Exportado relatório estruturado em .cypherguard/audit.sarif', class: 'log-dim' },
    ],
    diffHtml: `
<div class="diff-row ctx"><span class="diff-sign"> </span>  def authenticate_user(db: Session, credentials: LoginRequest):</div>
<div class="diff-row del"><span class="diff-sign">-</span>      query = f"SELECT * FROM users WHERE username = '{credentials.username}'"</div>
<div class="diff-row del"><span class="diff-sign">-</span>      user = db.execute(text(query)).fetchone()</div>
<div class="diff-row add"><span class="diff-sign">+</span>      # Correção Segura: Uso de queries parametrizadas (Prepared Statements)</div>
<div class="diff-row add"><span class="diff-sign">+</span>      stmt = select(User).where(User.username == credentials.username)</div>
<div class="diff-row add"><span class="diff-sign">+</span>      user = db.execute(stmt).scalar_one_or_none()</div>
<div class="diff-row ctx"><span class="diff-sign"> </span>      if not user or not verify_password(credentials.password, user.hashed_password):</div>
<div class="diff-row ctx"><span class="diff-sign"> </span>          raise HTTPException(status_code=401, detail="Credenciais inválidas")</div>
    `,
    sarifJson: `{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": { "driver": { "name": "CypherGuard AI", "semanticVersion": "1.2.0" } },
      "results": [
        {
          "ruleId": "CWE-89-SQL-Injection",
          "level": "error",
          "message": { "text": "Injeção SQL confirmada via validação semântica da IA." },
          "locations": [{ "physicalLocation": { "artifactLocation": { "uri": "src/api/auth/login.py" }, "region": { "startLine": 42 } } }]
        }
      ]
    }
  ]
}`
  },

  path: {
    name: 'Path Traversal (LFI)',
    file: 'src/controllers/report.ts',
    cwe: 'CWE-22 (Improper Limitation of a Pathname)',
    rule: 'javascript.express.security.audit.path-traversal',
    astFinding: 'Chamada a `path.join(__dirname, req.query.file)` com parâmetro não validado.',
    aiVerdict: 'TRUE POSITIVE (Confirmado por IA)',
    aiReasoning: 'A aplicação concatena `req.query.file` sem resolução canônica com `path.resolve()` nem verificação de prefixo permitido. Entradas contendo `../../etc/passwd` escapam do diretório restrito.',
    confidence: '98.8%',
    executionLogs: [
      { prefix: '❯', text: 'cypherguard scan ./src/controllers/report.ts --ai=local', class: 'log-prefix' },
      { prefix: '◈', text: '[Semgrep AST] Alerta de Path Traversal em report.ts:88', class: 'log-warn' },
      { prefix: '⌁', text: '[AST Parser] Verificando se existe verificação de sandbox ou regex...', class: 'log-dim' },
      { prefix: '⚡', text: '[LLM Judge] O parâmetro `req.query.file` flui sem barreiras até `fs.readFile`.', class: 'log-danger' },
      { prefix: '✓', text: '[Veredito] Risco Alto Confirmado: CWE-22 (Confiança: 98.8%)', class: 'log-danger' },
      { prefix: '🛠', text: '[Patcher] Injetando verificação canônica com PathTraversalGuard...', class: 'log-safe' },
      { prefix: '📄', text: '[SARIF 2.1.0] 1 vulnerabilidade crítica catalogada', class: 'log-dim' },
    ],
    diffHtml: `
<div class="diff-row ctx"><span class="diff-sign"> </span>  export async function downloadReport(req: Request, res: Response) {</div>
<div class="diff-row del"><span class="diff-sign">-</span>    const target = path.join(__dirname, '../public/reports', req.query.file as string);</div>
<div class="diff-row add"><span class="diff-sign">+</span>    const safeBase = path.resolve(__dirname, '../public/reports');</div>
<div class="diff-row add"><span class="diff-sign">+</span>    const target = path.resolve(safeBase, path.basename(req.query.file as string));</div>
<div class="diff-row add"><span class="diff-sign">+</span>    if (!target.startsWith(safeBase)) throw new Error('Path traversal attempt');</div>
<div class="diff-row ctx"><span class="diff-sign"> </span>    return res.sendFile(target);</div>
<div class="diff-row ctx"><span class="diff-sign"> </span>  }</div>
    `,
    sarifJson: `{
  "ruleId": "CWE-22-Path-Traversal",
  "level": "error",
  "message": { "text": "Path traversal verificado: permite leitura arbitrária de arquivos." },
  "locations": [{ "physicalLocation": { "artifactLocation": { "uri": "src/controllers/report.ts" }, "region": { "startLine": 88 } } }]
}`
  },

  secret: {
    name: 'Falso Positivo Descartado: Segredo de Teste',
    file: 'tests/mocks/jwt_fixture.ts',
    cwe: 'CWE-798 (Use of Hardcoded Credentials)',
    rule: 'generic.secrets.security.hardcoded-jwt-secret',
    astFinding: 'String literal longa correspondente a segredo JWT.',
    aiVerdict: 'FALSE POSITIVE (Ruído Eliminado)',
    aiReasoning: 'A variável encontra-se dentro de um diretório de testes (`tests/mocks`) e é utilizada exclusivamente em fixtures de testes unitários offline. Não há risco de segurança em ambiente de produção.',
    confidence: '99.9%',
    executionLogs: [
      { prefix: '❯', text: 'cypherguard scan ./tests --ai=ollama/qwen2.5', class: 'log-prefix' },
      { prefix: '◈', text: '[Semgrep AST] Alerta de Hardcoded Secret em jwt_fixture.ts:14', class: 'log-warn' },
      { prefix: '⌁', text: '[AST Parser] Avaliando contexto do módulo e imports circundantes...', class: 'log-dim' },
      { prefix: '⚡', text: '[LLM Judge] O arquivo é fixture de teste com sufixo Mock / Spec.', class: 'log-safe' },
      { prefix: '✓', text: '[Veredito] Falso Positivo descartado automaticamente. Alerta suprimido!', class: 'log-safe' },
      { prefix: '🛡', text: '[Triagem] Menos 1 alerta manual para o time de segurança revisar.', class: 'log-safe' },
    ],
    diffHtml: `
<div class="diff-row ctx"><span class="diff-sign"> </span>  // Arquivo de teste offline detectado como seguro</div>
<div class="diff-row ctx"><span class="diff-sign"> </span>  export const MOCK_JWT_SECRET = 'ci_offline_mock_test_token_never_in_prod';</div>
<div class="diff-row add"><span class="diff-sign">+</span>  // [CypherGuard] Marcado como Falso Positivo: Suprimido do relatório SARIF final</div>
    `,
    sarifJson: `{
  "ruleId": "CWE-798-Hardcoded-Secret",
  "suppressions": [{ "kind": "inSource", "justification": "Test mock fixture - descartado pela validação semântica" }]
}`
  }
};

let currentScenario = 'sqli';
let currentTab = 'logs';

function initPlaygroundSimulator() {
  // Scenario Buttons
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  scenarioBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const scen = btn.getAttribute('data-scenario');
      if (!scen || !SCENARIOS[scen]) return;
      scenarioBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentScenario = scen;
      renderPlayground();
    });
  });

  // Tab Buttons
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = tab;
      switchPlaygroundTab(tab);
    });
  });

  renderPlayground();
}

function renderPlayground() {
  const data = SCENARIOS[currentScenario];
  if (!data) return;

  // Render Logs
  const logContainer = document.getElementById('view-logs');
  if (logContainer) {
    logContainer.innerHTML = data.executionLogs
      .map(
        (l) => `
      <div class="log-row">
        <span class="log-prefix">${l.prefix}</span>
        <span class="${l.class || 'log-text'}">${l.text}</span>
      </div>`
      )
      .join('');
  }

  // Render AI Reasoning
  const aiContainer = document.getElementById('view-ai');
  if (aiContainer) {
    aiContainer.innerHTML = `
      <div class="ai-reasoning-grid">
        <div class="ai-card-block">
          <div class="ai-card-title"><span>◈</span> Diagnóstico da IA</div>
          <div style="margin-bottom:12px;"><strong style="color:var(--text-pure); font-size:14px;">${data.name}</strong></div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Arquivo: <span class="log-highlight">${data.file}</span></div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Classificação: <span style="color:var(--emerald);">${data.cwe}</span></div>
          <div style="font-size:12.5px; color:var(--text-main); line-height:1.6;">${data.aiReasoning}</div>
        </div>
        <div class="ai-card-block">
          <div class="ai-card-title"><span>⚡</span> Triagem e Métricas</div>
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Veredito Semântico:</div>
          <div style="font-size:16px; font-weight:800; color:${data.aiVerdict.includes('FALSE') ? 'var(--emerald)' : 'var(--rose)'}; margin:4px 0 14px;">${data.aiVerdict}</div>
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Confiança Calibrada:</div>
          <div style="font-size:24px; font-weight:700; color:var(--text-pure); margin-top:2px;">${data.confidence}</div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:12px;">Regra AST: <code>${data.rule}</code></div>
        </div>
      </div>
    `;
  }

  // Render Diff
  const diffContainer = document.getElementById('view-diff');
  if (diffContainer) {
    diffContainer.innerHTML = `
      <div style="margin-bottom:12px; font-size:12px; color:var(--text-muted);">
        Patch sugerido para: <span class="log-highlight">${data.file}</span>
      </div>
      <div class="diff-container">${data.diffHtml}</div>
    `;
  }

  // Render SARIF
  const sarifContainer = document.getElementById('view-sarif');
  if (sarifContainer) {
    sarifContainer.innerHTML = `<pre style="color:var(--text-muted); font-size:12px; line-height:1.6;">${escapeHtml(data.sarifJson)}</pre>`;
  }
}

function switchPlaygroundTab(tabId) {
  document.querySelectorAll('.play-view').forEach((view) => {
    view.classList.remove('active');
  });
  const target = document.getElementById(`view-${tabId}`);
  if (target) {
    target.classList.add('active');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ==========================================================================
   4. COPY BUTTONS FEEDBACK
   ========================================================================== */
function initCopyButtons() {
  const cliBox = document.getElementById('cliInstallBox');
  const copyBubble = document.getElementById('cliCopyBubble');

  if (cliBox && copyBubble) {
    cliBox.addEventListener('click', () => {
      navigator.clipboard.writeText('npx cypherguard-ai scan ./src');
      copyBubble.classList.add('active');
      setTimeout(() => {
        copyBubble.classList.remove('active');
      }, 2000);
    });
  }

  const btnCopyWorkflow = document.getElementById('btnCopyWorkflow');
  if (btnCopyWorkflow) {
    btnCopyWorkflow.addEventListener('click', () => {
      const codeEl = document.getElementById('workflowCode');
      if (!codeEl) return;
      navigator.clipboard.writeText(codeEl.innerText.trim());
      const originalText = btnCopyWorkflow.innerHTML;
      btnCopyWorkflow.innerHTML = 'Copiado!';
      setTimeout(() => {
        btnCopyWorkflow.innerHTML = originalText;
      }, 2000);
    });
  }
}
