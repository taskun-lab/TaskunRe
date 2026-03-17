/* =============================================
   ムキムキタスくん - 開発者メニュー
   ============================================= */

let appConfig = null;

/**
 * 開発者メニューの初期化
 */
function initDeveloperMenu() {
    const devMenuBtn = document.getElementById('devMenuBtn');
    const devModal = document.getElementById('devModal');
    const devBackdrop = document.getElementById('devBackdrop');
    const devCloseBtn = document.getElementById('devCloseBtn');

    if (!devMenuBtn || !devModal) return;

    // developer ロールの場合のみボタンを表示
    if (currentEntitlements?.role === 'developer' || currentEntitlements?.role === 'admin') {
        devMenuBtn.style.display = 'block';
    }

    // モーダル開閉
    devMenuBtn.onclick = () => openDevModal();
    devBackdrop.onclick = () => closeDevModal();
    devCloseBtn.onclick = () => closeDevModal();

    // 外部リンクボタン
    document.querySelectorAll('.dev-link-btn').forEach(btn => {
        btn.onclick = () => openExternalLink(btn.dataset.url);
    });

    // Feature Flag トグル
    document.getElementById('flagGatingEnabled').onchange = (e) => {
        updateAppConfig({ gating_enabled: e.target.checked });
    };
    document.getElementById('flagBillingEnabled').onchange = (e) => {
        updateAppConfig({ billing_enabled: e.target.checked });
    };
}

/**
 * 開発者モーダルを開く
 */
async function openDevModal() {
    const devModal = document.getElementById('devModal');
    devModal.style.display = 'flex';

    // app_config を取得して表示
    await loadAppConfig();
}

/**
 * 開発者モーダルを閉じる
 */
function closeDevModal() {
    document.getElementById('devModal').style.display = 'none';
}

/**
 * 外部リンクを開く（LIFF対応）
 */
function openExternalLink(url) {
    if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
        // LIFF環境 → 外部ブラウザで開く
        liff.openWindow({
            url: url,
            external: true
        });
    } else {
        // 通常ブラウザ → 新しいタブで開く
        window.open(url, '_blank');
    }
}

/**
 * app_config を取得
 */
async function loadAppConfig() {
    const statusEl = document.getElementById('devFlagStatus');
    try {
        appConfig = await apiCall('/app-config');

        // UIに反映
        document.getElementById('flagGatingEnabled').checked = appConfig.gating_enabled || false;
        document.getElementById('flagBillingEnabled').checked = appConfig.billing_enabled || false;

        if (statusEl) {
            const updatedAt = appConfig.updated_at ? new Date(appConfig.updated_at).toLocaleString('ja-JP') : '-';
            statusEl.textContent = `最終更新: ${updatedAt}`;
            statusEl.style.color = 'var(--text-muted)';
        }
    } catch (e) {
        console.error('app_config取得エラー:', e);
        appConfig = { gating_enabled: false, billing_enabled: false };
        if (statusEl) {
            statusEl.textContent = '設定の取得に失敗しました';
            statusEl.style.color = 'var(--power-red)';
        }
    }
}

/**
 * app_config を更新
 */
async function updateAppConfig(changes) {
    const statusEl = document.getElementById('devFlagStatus');
    try {
        statusEl.textContent = '保存中...';
        statusEl.style.color = 'var(--text-muted)';

        const result = await apiCall('/app-config', 'PATCH', {
            user_id: userId,
            ...changes
        });

        appConfig = { ...appConfig, ...result.config };

        statusEl.textContent = '✓ 保存しました';
        statusEl.style.color = 'var(--success-green)';

        // 3秒後に通常表示に戻す
        setTimeout(() => {
            const updatedAt = new Date().toLocaleString('ja-JP');
            statusEl.textContent = `最終更新: ${updatedAt}`;
            statusEl.style.color = 'var(--text-muted)';
        }, 3000);

    } catch (e) {
        console.error('app_config更新エラー:', e);
        statusEl.textContent = '⚠ 保存に失敗しました: ' + e.message;
        statusEl.style.color = 'var(--power-red)';

        // 元に戻す
        await loadAppConfig();
    }
}

/**
 * gating_enabled の状態を取得（制限ロジックで使用）
 */
function isGatingEnabled() {
    return appConfig?.gating_enabled || false;
}

/**
 * billing_enabled の状態を取得（課金導線で使用）
 */
function isBillingEnabled() {
    return appConfig?.billing_enabled || false;
}
