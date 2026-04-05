/* =============================================
   ムキムキタスくん - アプリケーション初期化
   ============================================= */

let userId = null;
let currentEntitlements = null;
let planData = null;

/**
 * アプリ初期化
 */
async function init() {
    // Edge Functions ウォームアップ（cold start対策）
    fetch(`${API_BASE}/app-config`, { method: 'HEAD', headers: { apikey: SUPABASE_ANON_KEY } }).catch(() => {});

    // checkout成功フラグ
    const urlParams = new URLSearchParams(window.location.search);
    const isCheckoutSuccess = urlParams.get('checkout') === 'success';

    if (isCheckoutSuccess) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // LIFF初期化
    console.log(`[ムキムキタスくん] ENV=${ENV}, LIFF_ID=${LIFF_ID}`);
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            const loginKey = 'liff_login_attempt';
            const attempts = parseInt(sessionStorage.getItem(loginKey) || '0');
            if (attempts >= 2) {
                // 3回目以降 → ループ防止、案内表示
                sessionStorage.removeItem(loginKey);
                console.warn('[LIFF] ログイン失敗（試行回数超過）');
                const liffUrl = `https://liff.line.me/${LIFF_ID}`;
                document.body.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;font-family:sans-serif;">
                        <div style="font-size:48px;margin-bottom:16px;">💪</div>
                        <div style="font-size:18px;font-weight:700;color:#0d1b2a;margin-bottom:12px;">ムキムキタスくん</div>
                        <div style="font-size:14px;color:#778da9;margin-bottom:24px;line-height:1.6;">
                            LINEログインが完了できませんでした。<br>
                            LINEアプリから以下のリンクを開いてください。
                        </div>
                        <a href="${liffUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff9f43,#ff6b6b);color:white;border-radius:25px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(255,107,107,0.3);">
                            LINEで開く
                        </a>
                        <div style="margin-top:24px;font-size:11px;color:#aaa;">ENV: ${ENV} / LIFF: ${LIFF_ID}</div>
                    </div>`;
                return;
            }
            sessionStorage.setItem(loginKey, String(attempts + 1));

            if (liff.isInClient()) {
                // LINEアプリ内ブラウザ → liff.line.me 経由
                console.log('[LIFF] LINEアプリ内 → liff.line.me へリダイレクト');
                window.location.href = `https://liff.line.me/${LIFF_ID}`;
            } else {
                // 外部ブラウザ（PC等）→ liff.login() でOAuth認証
                console.log('[LIFF] 外部ブラウザ → liff.login() でOAuth開始');
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
            }
            return;
        }

        // ログイン成功 → カウンターをクリア
        sessionStorage.removeItem('liff_login_attempt');
        try {
            const profile = await liff.getProfile();
            userId = profile.userId;
        } catch (profileError) {
            // profile scope がない場合は openid の sub で代替
            const token = liff.getDecodedIDToken();
            if (token?.sub) {
                userId = token.sub;
            } else {
                sessionStorage.removeItem('liff_login_attempt');
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
                return;
            }
        }

        // DEV環境：開発者以外はブロック
        if (ENV === 'DEV' && DEV_ALLOWED_USER_ID !== '<DEV_ALLOWED_USER_ID>' && userId !== DEV_ALLOWED_USER_ID) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#778da9;font-size:16px;">開発環境のため、アクセスが制限されています。</div>';
            return;
        }
        if (ENV === 'DEV') {
            console.log('[DEV] userId:', userId);
        }
    } catch (e) {
        console.error("LIFF初期化エラー:", e);
        userId = "demo_user";
    }

    // デモモードではデータ読み込みをスキップ
    if (userId === 'demo_user') {
        bindUI();
        return;
    }

    // entitlements、プラン一覧、app_configを取得
    await Promise.all([loadEntitlements(), loadPlans(), loadAppConfig()]);

    // checkout成功時のリトライ処理
    if (isCheckoutSuccess) {
        await handleCheckoutSuccess();
    }

    bindUI();
    updateTabLockUI();
    initDeveloperMenu();
    await loadAllData();
}

/**
 * UI初期化
 */
function bindUI() {
    // タブナビゲーション
    document.querySelectorAll('.tab-nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // リストタブ
    const navAddBtn = document.getElementById('navAddBtn');
    if (navAddBtn) navAddBtn.onclick = showAddTaskModal;

    // ステータスタブ
    document.getElementById('dailyTaskCard').addEventListener('click', e => {
        if (!e.target.closest('.habit-checkbox') && !e.target.closest('.daily-btn') && !e.target.closest('.habit-date-row')) {
            document.getElementById('dailyTaskCard').classList.toggle('expanded');
        }
    });
    document.getElementById('habitSaveBtn').onclick = saveHabits;
    document.getElementById('habitCancelBtn').onclick = () => {
        document.getElementById('dailyTaskCard').classList.remove('expanded');
    };
    // 日付ピッカー：日付変更時に該当日のデータを再読み込み
    const habitDatePicker = document.getElementById('habitRecordDate');
    if (habitDatePicker) {
        habitDatePicker.addEventListener('change', e => {
            e.stopPropagation();
            loadHabits(habitDatePicker.value);
        });
        // 今日の日付をデフォルト設定
        const t = new Date();
        habitDatePicker.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    renderHabitList();

    // ステータスタブの習慣設定ボタン（Phase2）
    const habitSettingsBtn = document.getElementById('habitSettingsBtn');
    if (habitSettingsBtn) habitSettingsBtn.onclick = () => showHabitSettingsModal();

    // ジャーナルタブ
    document.getElementById('journalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('journalSubmitBtn').onclick = saveJournal;

    // テーマ切替
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = savedTheme;
    updateThemeBtn(savedTheme);
    updateTabIcons(savedTheme);
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.onclick = () => {
            const current = document.documentElement.dataset.theme;
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('theme', next);
            updateThemeBtn(next);
            updateTabIcons(next);
        };
    }

    // 各種モーダルUI初期化
    bindModalUI();
    bindTaskDetailModalUI();
    bindMonthlyAnalysisUI();
    bindJournalDetailModalUI();
    bindPriorityModalUI();
    bindMscUI();
    bindMbtiModalUI();
    bindMissionModalUI();
    bindUpgradeModalUI();
    bindHabitSettingsModalUI();
    bindAddTaskModalUI();
    initPullToRefresh();
}

/**
 * プルリフレッシュ初期化
 */
function initPullToRefresh() {
    const container = document.querySelector('.tab-contents');
    const indicator = document.getElementById('pullRefreshIndicator');
    if (!container || !indicator) return;

    let startY = 0;
    let pulling = false;
    const THRESHOLD = 70;

    container.addEventListener('touchstart', e => {
        if (window._treeViewActive) { pulling = false; return; }
        if (container.scrollTop === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && container.scrollTop === 0) {
            const capped = Math.min(dy * 0.6, 56);
            const progress = Math.min(dy / THRESHOLD, 1);
            indicator.style.height = `${capped}px`;
            indicator.style.opacity = String(progress);
            const icon = indicator.querySelector('.pull-icon');
            if (icon) icon.style.transform = `rotate(${progress * 180}deg)`;
        }
    }, { passive: true });

    container.addEventListener('touchend', async e => {
        if (!pulling) return;
        const dy = e.changedTouches[0].clientY - startY;
        pulling = false;

        if (dy > THRESHOLD) {
            indicator.classList.add('refreshing');
            indicator.style.height = '48px';
            indicator.style.opacity = '1';
            await refreshActiveTab();
            indicator.classList.remove('refreshing');
        }

        indicator.style.height = '0';
        indicator.style.opacity = '0';
        const icon = indicator.querySelector('.pull-icon');
        if (icon) icon.style.transform = '';
    }, { passive: true });
}

async function refreshActiveTab() {
    const activeTab = document.querySelector('.tab-nav-item.active')?.dataset.tab;
    if (activeTab === 'list') await loadList();
    else if (activeTab === 'status') { await loadHabits(); await loadMscData(); }
    else if (activeTab === 'journal') await loadJournals();
}

function updateThemeBtn(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function updateTabIcons(theme) {
    document.querySelectorAll('.tab-icon-light').forEach(el => {
        el.style.display = theme === 'dark' ? 'none' : 'block';
    });
    document.querySelectorAll('.tab-icon-dark').forEach(el => {
        el.style.display = theme === 'dark' ? 'block' : 'none';
    });
}

/**
 * タブ切り替え
 */
function switchTab(tabId) {
    // gating_enabled が true の場合のみ権限チェック
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    if (gatingOn && tabId === 'status' && currentEntitlements && !currentEntitlements.can_status) {
        showUpgradeModal('ステータス機能');
        return;
    }
    if (gatingOn && tabId === 'journal' && currentEntitlements && !currentEntitlements.can_journal) {
        showUpgradeModal('ジャーナル機能');
        return;
    }

    document.querySelectorAll('.tab-nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // スワイプを閉じる
    closeAllSwipeRows();

    // タブ切り替え時に自動データ読み込み
    if (userId && userId !== 'demo_user') {
        if (tabId === 'status') { loadHabits(); loadMscData(); }
        if (tabId === 'journal') loadJournals();
    }
}

/**
 * タブのロック表示更新
 */
function updateTabLockUI() {
    const statusTab = document.querySelector('.tab-nav-item[data-tab="status"]');
    const journalTab = document.querySelector('.tab-nav-item[data-tab="journal"]');
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    // innerHTML を使うとアイコン画像が消えるため、span のみ更新する
    const statusSpan = statusTab.querySelector('span');
    const journalSpan = journalTab.querySelector('span');

    if (gatingOn && currentEntitlements && !currentEntitlements.can_status) {
        if (statusSpan) statusSpan.innerHTML = 'ステータス<span class="lock-icon">🔒</span>';
        statusTab.classList.add('locked');
    } else {
        if (statusSpan) statusSpan.textContent = 'ステータス';
        statusTab.classList.remove('locked');
    }

    if (gatingOn && currentEntitlements && !currentEntitlements.can_journal) {
        if (journalSpan) journalSpan.innerHTML = 'ジャーナル<span class="lock-icon">🔒</span>';
        journalTab.classList.add('locked');
    } else {
        if (journalSpan) journalSpan.textContent = 'ジャーナル';
        journalTab.classList.remove('locked');
    }
}

/**
 * 全データ読み込み
 */
async function loadAllData() {
    const promises = [loadList(), loadMissionTask()];

    if (currentEntitlements?.can_status) {
        promises.push(loadHabits(), loadMscData());
    }

    if (currentEntitlements?.can_journal) {
        promises.push(loadJournals());
    }

    await Promise.all(promises);

    // 週次振り返りバナーチェック（Phase1）
    checkWeeklyReflectionBanner();
}

// ===== 週次振り返りバナー（Phase1） =====
function checkWeeklyReflectionBanner() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWindow = (day === 0 && hour >= 18) || (day === 1 && hour < 12);
    if (!isWindow) return;
    const skipKey = 'weekly_banner_skip_' + getWeekKey();
    if (sessionStorage.getItem(skipKey)) return;
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
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function getWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0,0,0,0);
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

// アプリ起動
init();
