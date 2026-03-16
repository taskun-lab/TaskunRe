/* =============================================
   ムキムキタスくん３ - 開発者メニュー
   ============================================= */

let appConfig = null;

function initDeveloperMenu() {
    const devMenuBtn = document.getElementById('devMenuBtn');
    const devModal = document.getElementById('devModal');
    if (!devMenuBtn || !devModal) return;
    if (currentEntitlements?.role === 'developer' || currentEntitlements?.role === 'admin') {
        devMenuBtn.style.display = 'block';
    }
    devMenuBtn.onclick = () => openDevModal();
    document.getElementById('devBackdrop').onclick = () => closeDevModal();
    document.getElementById('devCloseBtn').onclick = () => closeDevModal();
    document.querySelectorAll('.dev-link-btn').forEach(btn => {
        btn.onclick = () => openExternalLink(btn.dataset.url);
    });
    document.getElementById('flagGatingEnabled').onchange = (e) => updateAppConfig({ gating_enabled: e.target.checked });
    document.getElementById('flagBillingEnabled').onchange = (e) => updateAppConfig({ billing_enabled: e.target.checked });
}

async function openDevModal() {
    document.getElementById('devModal').style.display = 'flex';
    await loadAppConfig();
}

function closeDevModal() {
    document.getElementById('devModal').style.display = 'none';
}

function openExternalLink(url) {
    if (typeof liff !== 'undefined' && liff.isInClient?.()) {
        liff.openWindow({ url, external: true });
    } else {
        window.open(url, '_blank');
    }
}

async function loadAppConfig() {
    const statusEl = document.getElementById('devFlagStatus');
    try {
        const data = await apiCall('/app-config');
        appConfig = data;
        document.getElementById('flagGatingEnabled').checked = appConfig.gating_enabled || false;
        document.getElementById('flagBillingEnabled').checked = appConfig.billing_enabled || false;
        if (statusEl) {
            const updatedAt = appConfig.updated_at ? new Date(appConfig.updated_at).toLocaleString('ja-JP') : '-';
            statusEl.textContent = `最終更新: ${updatedAt}`;
            statusEl.style.color = 'var(--text-muted)';
        }
    } catch (e) {
        console.error('loadAppConfig error:', e);
        appConfig = { gating_enabled: false, billing_enabled: false };
        if (statusEl) { statusEl.textContent = '取得に失敗しました'; statusEl.style.color = 'var(--power-red)'; }
    }
}

async function updateAppConfig(changes) {
    const statusEl = document.getElementById('devFlagStatus');
    try {
        if (statusEl) { statusEl.textContent = '保存中...'; statusEl.style.color = 'var(--text-muted)'; }
        const result = await apiCall('/app-config', 'PATCH', { user_id: userId, ...changes });
        appConfig = { ...appConfig, ...result.config };
        if (statusEl) { statusEl.textContent = '✓ 保存しました'; statusEl.style.color = 'var(--success-green)'; }
        setTimeout(() => {
            if (statusEl) { statusEl.textContent = `最終更新: ${new Date().toLocaleString('ja-JP')}`; statusEl.style.color = 'var(--text-muted)'; }
        }, 3000);
    } catch (e) {
        console.error('updateAppConfig error:', e);
        if (statusEl) { statusEl.textContent = '⚠ 保存に失敗しました'; statusEl.style.color = 'var(--power-red)'; }
        await loadAppConfig();
    }
}

function isGatingEnabled() { return appConfig?.gating_enabled || false; }
function isBillingEnabled() { return appConfig?.billing_enabled || false; }
