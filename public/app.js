// Custom Cursor Logic
const cursor = document.getElementById('cursor');
let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateCursor() {
    // Lerp (Linear Interpolation) for buttery smooth movement
    cursorX += (mouseX - cursorX) * 0.2;
    cursorY += (mouseY - cursorY) * 0.2;
    
    cursor.style.transform = `translate3d(${cursorX - 10}px, ${cursorY - 10}px, 0)`;
    requestAnimationFrame(animateCursor);
}

animateCursor();

// Update cursor state on hover
document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('.cursor-hover')) {
        cursor.classList.add('hovered');
    } else {
        cursor.classList.remove('hovered');
    }
});

// Reveal Animations Logic
const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Scan Logic
let currentAlerts = [];
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
    loadingState.classList.add('active');

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetPath })
        });

        const data = await response.json();

        if (response.ok) {
            currentAlerts = data.results;
            renderResults(data.results, targetPath);
        } else {
            alert(`Erro: ${data.error}`);
            loadingState.classList.add('hidden');
            scanBtn.disabled = false;
            scanBtn.classList.remove('opacity-50');
        }
    } catch (error) {
        alert('Erro de comunicação com o servidor local.');
        loadingState.classList.add('hidden');
        scanBtn.disabled = false;
        scanBtn.classList.remove('opacity-50');
    }
});

function renderResults(alerts, targetPath) {
    resultsGrid.innerHTML = '';
    loadingState.classList.add('hidden');
    scanBtn.disabled = false;
    scanBtn.classList.remove('opacity-50');
    resultsGrid.classList.add('active');

    if (!alerts || alerts.length === 0) {
        resultsGrid.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center reveal active">
                <div class="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                    <span class="iconify text-emerald-500" data-icon="lucide:shield-check" data-width="40"></span>
                </div>
                <h3 class="font-heading text-2xl font-semibold text-white mb-2">Codebase is Secure</h3>
                <p class="text-sm text-gray-500 font-mono uppercase tracking-widest">No critical vulnerabilities detected by AI</p>
            </div>
        `;
        return;
    }

    alerts.forEach((alert, index) => {
        const isTruePositive = alert.aiValidation.status === 'True Positive';
        const severityColor = isTruePositive ? 'text-red-400' : 'text-emerald-400';
        
        const card = document.createElement('div');
        card.className = `glass-panel p-8 rounded-3xl reveal cursor-hover group`;
        setTimeout(() => card.classList.add('active'), index * 100);

        let html = `
            <div class="flex justify-between items-start mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full ${isTruePositive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}"></div>
                    <span class="text-[10px] font-mono text-gray-500 uppercase tracking-widest truncate max-w-[200px]" title="${alert.finding.path}">
                        ${alert.finding.path.split('/').pop()} : ${alert.finding.start.line}
                    </span>
                </div>
                <span class="px-2 py-1 text-[8px] uppercase font-bold rounded bg-black/40 border border-white/5 ${severityColor}">
                    ${alert.aiValidation.status}
                </span>
            </div>
            
            <h3 class="font-heading text-xl font-semibold text-white mb-3 tracking-tight">
                ${alert.finding.check_id.split('.').pop().replace(/-/g, ' ')}
            </h3>
            
            <p class="text-sm text-gray-400 mb-6 leading-relaxed">
                ${alert.aiValidation.explicacao}
            </p>

            <div class="space-y-6">
                <div class="relative">
                    <span class="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-2 block">Vulnerable Pattern</span>
                    <pre><code class="text-red-300/80">${escapeHtml(alert.finding.extra.lines)}</code></pre>
                </div>
        `;

        if (isTruePositive && alert.aiValidation.correcao) {
            html += `
                <div class="relative pt-4 border-t border-white/5">
                    <span class="text-[10px] uppercase tracking-[0.2em] text-[#007bff] mb-2 block">AI Suggested Patch</span>
                    <pre><code class="text-emerald-300/80">${escapeHtml(alert.aiValidation.correcao)}</code></pre>
                </div>
                
                <button onclick="applyFix(${index})" 
                        class="w-full mt-6 py-3 px-4 bg-[#007bff] rounded-xl text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-[#007bff] transition-all duration-300 shadow-lg shadow-blue-900/20 group-hover:scale-[1.02]">
                    Apply Security Patch
                </button>
            `;
        }

        html += `</div>`;
        card.innerHTML = html;
        resultsGrid.appendChild(card);
    });
}

async function applyFix(index) {
    const alert = currentAlerts[index];
    if (!alert) return;

    const { path: filePath, start: { line: startLine }, end: { line: endLine } } = alert.finding;
    const correction = alert.aiValidation.correcao;

    try {
        const response = await fetch('/api/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, startLine, endLine, correction })
        });

        const data = await response.json();

        if (response.ok) {
            alertSuccess('Patch applied successfully!');
        } else {
            alert(`Erro: ${data.error}`);
        }
    } catch (error) {
        alert('Communication failure with local server.');
    }
}

// Visual Alert Utility
function alertSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 glass-panel px-8 py-4 rounded-full border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] z-[100] animate-bounce';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
