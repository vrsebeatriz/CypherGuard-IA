let currentAlerts = [];

// DOM Elements
const cursor = document.getElementById('cursor');
const scanBtn = document.getElementById('scanBtn');
const targetInput = document.getElementById('targetInput');
const loadingState = document.getElementById('loadingState');
const resultsGrid = document.getElementById('resultsGrid');

// Custom Cursor Logic (Optimized for Brave/Performance)
let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateCursor() {
    cursorX += (mouseX - cursorX) * 0.2;
    cursorY += (mouseY - cursorY) * 0.2;
    cursor.style.transform = `translate3d(${cursorX - 10}px, ${cursorY - 10}px, 0)`;
    requestAnimationFrame(animateCursor);
}
animateCursor();

// Cursor Hover State
document.addEventListener('mouseover', (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
        cursor.classList.add('hovered');
    } else {
        cursor.classList.remove('hovered');
    }
});

// Scan Logic
scanBtn.addEventListener('click', async () => {
    const targetPath = targetInput.value.trim();
    if (!targetPath) return showToast('Please enter a valid path.', 'error');

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
            showToast(`Error: ${data.error}`, 'error');
            loadingState.classList.add('hidden');
            scanBtn.disabled = false;
            scanBtn.classList.remove('opacity-50');
        }
    } catch (error) {
        showToast('Communication failure with local server.', 'error');
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

    if (!alerts || alerts.length === 0) {
        resultsGrid.innerHTML = `
            <div class="col-span-full py-16 text-center reveal active">
                <span class="iconify text-white/10 mb-4 mx-auto" data-icon="lucide:shield-check" data-width="48"></span>
                <p class="text-[10px] font-heading font-bold text-white/20 uppercase tracking-[0.3em]">Codebase Secure - No Threats Detected</p>
            </div>
        `;
        return;
    }

    alerts.forEach((alert, index) => {
        const isTruePositive = alert.aiValidation.status === 'True Positive';
        const severityColor = isTruePositive ? 'text-red-400' : 'text-emerald-400';
        
        const card = document.createElement('div');
        card.className = `glass-panel p-8 rounded-3xl reveal`;
        setTimeout(() => card.classList.add('active'), index * 100);

        let html = `
            <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isTruePositive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}"></span>
                    <span class="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                        ${alert.finding.path.split('/').pop()} : ${alert.finding.start.line}
                    </span>
                </div>
                <span class="text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/5 ${severityColor}">
                    ${alert.aiValidation.status}
                </span>
            </div>
            
            <h3 class="font-heading text-lg font-semibold text-white mb-3 tracking-tight">
                ${alert.finding.check_id.split('.').pop().replace(/-/g, ' ')}
            </h3>
            
            <p class="text-xs text-white/50 mb-6 leading-relaxed font-light">
                ${alert.aiValidation.explicacao}
            </p>

            <div class="space-y-6">
                <div>
                    <span class="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-2 block font-bold">Vulnerable Snippet</span>
                    <pre><code>${escapeHtml(alert.finding.extra.lines)}</code></pre>
                </div>
        `;

        if (isTruePositive && alert.aiValidation.correcao) {
            html += `
                <div class="pt-4 border-t border-white/5">
                    <span class="text-[9px] uppercase tracking-[0.2em] text-[#007bff] mb-2 block font-bold">AI Suggested Patch</span>
                    <pre><code class="text-blue-100/80">${escapeHtml(alert.aiValidation.correcao)}</code></pre>
                </div>
                
                <button onclick="applyFix(${index})" 
                        class="w-full mt-6 py-3 px-4 bg-[#007bff] rounded-xl text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-[#007bff] transition-all duration-300 shadow-lg shadow-blue-900/20">
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

        if (response.ok) {
            showToast('Security patch applied successfully!', 'success');
        } else {
            const data = await response.json();
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast('Communication failure.', 'error');
    }
}

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    
    toast.className = `glass-panel px-6 py-4 rounded-2xl flex items-center gap-4 transform transition-all duration-500 translate-x-full opacity-0 pointer-events-auto border-l-4 ${isError ? 'border-l-red-500 bg-red-500/5' : 'border-l-emerald-500 bg-emerald-500/5'}`;
    
    toast.innerHTML = `
        <span class="iconify ${isError ? 'text-red-500' : 'text-emerald-500'}" data-icon="${isError ? 'lucide:alert-circle' : 'lucide:check-circle'}" data-width="20"></span>
        <span class="text-xs font-semibold text-white tracking-wide">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

