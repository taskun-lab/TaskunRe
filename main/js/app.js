/* =============================================
   ムキムキタスくん３ - アプリケーション初期化
   ============================================= */

let userId = null;
let currentEntitlements = null;
let planData = null;

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const isCheckoutSuccess = urlParams.get('checkout') === 'success';
    if (isCheckoutSuccess) window.history.replaceState({}, '', window.location.pathname);

    console.log(`[ムキムキタスくん３] ENV=${ENV}`);
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            const loginKey = 'liff_login_attempt';
            const attempts = parseInt(sessionStorage.getItem(loginKey) || '0');
            if (attempts >= 2) {
                sessionStorage.removeItem(loginKey);
                const liffUrl = `https://liff.line.me/${LIFF_ID}`;
                document.body.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;font-family:sans-serif;">
                        <div style="font-size:48px;margin-bottom:16px;">💪</div>
                        <div style="font-size:18px;font-weight:700;color:#0d1b2a;margin-bottom:12px;">ムキムキタスくん</div>
                        <div style="font-size:14px;color:#778da9;margin-bottom:24px;line-height:1.6;">
                            LINEログインが完了できませんでした。<br>LINEアプリから開いてください。
                        </div>
                        <a href="${liffUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff9f43,#ff6b6b);color:white;border-radius:25px;text-decoration:none;font-weight:700;">LINEで開く</a>
                    </div>`;
                return;
            }
            sessionStorage.setItem(loginKey, String(attempts + 1));
            if (liff.isInClient()) {
                window.location.href = `https://liff.line.me/${LIFF_ID}`;
            } else {
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
            }
            return;
        }
        sessionStorage.removeItem('liff_login_attempt');
        const profile = await liff.getProfile();
        userId = profile.userId;

        if (ENV === 'DEV' && DEV_ALLOWED_USER_ID !== '<YOUR_LINE_USER_ID>' && userId !== DEV_ALLOWED_USER_ID) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#778da9;font-size:16px;">開発環境のため、アクセスが制限されています。</div>';
            return;
        }
    } catch (e) {
        console.error('LIFF初期化エラー:', e);
        userId = 'demo_user';
    }

    if (userId === 'demo_user') { bindUI(); return; }

    await Promise.all([loadEntitlements(), loadPlans(), loadAppConfig()]);

    if (isCheckoutSuccess) await handleCheckoutSuccess();

    bindUI();
    updateTabLockUI();
    initDeveloperMenu();
    await loadAllData();

    // 週次振り返りバナーチェック（Phase1）
    checkWeeklyReflectionBanner();
}

function bindUI() {
    // タブ切り替え
    document.querySelectorAll('.tab-nav-item').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // タスク追加ボタン
    const addBtn = document.getElementById('btnAdd');
    if (addBtn) addBtn.onclick = () => showAddTaskModal();

    // リスト更新ボタン
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.onclick = () => loadList();

    // 各モーダル初期化
    bindUpgradeModalUI();
    bindJournalDetailModalUI();
    bindAddTaskModalUI();
    bindMbtiModalUI();
    initGlobalSwipeHandler();
}

function switchTab(tabId) {
    if (isGatingEnabled() && userId !== 'demo_user') {
        if (tabId === 'status' && !currentEntitlements?.can_status) {
            showUpgradeModal('ステータス機能');
            return;
        }
        if (tabId === 'journal' && !currentEntitlements?.can_journal) {
            showUpgradeModal('ジャーナル機能');
            return;
        }
    }
    document.querySelectorAll('.tab-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));

    if (tabId === 'status') { loadHabits(); loadMscData(); }
    if (tabId === 'journal') loadJournals();
}

function updateTabLockUI() {
    const gating = isGatingEnabled();
    ['status', 'journal'].forEach(tabId => {
        const btn = document.querySelector(`.tab-nav-item[data-tab="${tabId}"]`);
        if (!btn) return;
        const canAccess = tabId === 'status' ? currentEntitlements?.can_status : currentEntitlements?.can_journal;
        const lockIcon = btn.querySelector('.lock-icon');
        if (gating && !canAccess) {
            if (!lockIcon) btn.insertAdjacentHTML('beforeend', '<span class="lock-icon">🔒</span>');
        } else {
            if (lockIcon) lockIcon.remove();
        }
    });
}

async function loadAllData() {
    await loadList();
    await loadMissionTask();
    switchTab('list');
}

// ===== 週次振り返りバナー（Phase1） =====
function checkWeeklyReflectionBanner() {
    const now = new Date();
    const day = now.getDay();   // 0=日, 1=月
    const hour = now.getHours();
    const isWindow = (day === 0 && hour >= 18) || (day === 1 && hour < 12);
    if (!isWindow) return;

    const skipKey = 'weekly_banner_skip_' + getWeekKey();
    if (sessionStorage.getItem(skipKey)) return;

    // 当週のジャーナルがあるか確認
    if (journalsData && journalsData.length > 0) {
        const weekStart = getWeekStart();
        const hasJournal = journalsData.some(j => new Date(j.date) >= weekStart);
        if (hasJournal) return;
    }

    showWeeklyReflectionBanner();
}

function getWeekKey() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
}

function showWeeklyReflectionBanner() {
    const banner = document.getElementById('weeklyReflectionBanner');
    if (!banner) return;
    banner.style.display = 'flex';

    document.getElementById('weeklyBannerWriteBtn').onclick = () => {
        banner.style.display = 'none';
        switchTab('journal');
        const content = document.getElementById('journalContent');
        if (content) content.focus();
    };
    document.getElementById('weeklyBannerLaterBtn').onclick = () => {
        banner.style.display = 'none';
        sessionStorage.setItem('weekly_banner_skip_' + getWeekKey(), '1');
    };
}

document.addEventListener('DOMContentLoaded', init);
