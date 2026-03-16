/* =============================================
   ムキムキタスくん - プラン詳細ページ
   ============================================= */

// === 設定 ===
const ENV = (() => {
    const h = window.location.hostname;
    if (h.includes('ngrok-free.dev') || h === 'localhost' || h === '127.0.0.1') return 'DEV';
    return 'PROD';
})();

const LIFF_ID = ENV === 'DEV'
    ? "2008544549-mDb15VqZ"     // 開発用LIFF ID（要設定）
    : "2008544549-mDb15VqZ";   // 本番用LIFF ID（要設定）

const API_BASE = "https://lumicreate.xvps.jp/webhook";

// === 状態 ===
let userId = null;
let currentEntitlements = null;
let planData = null;
let selectedPlanCode = null;

// === プラン詳細定義 ===
const PLAN_DETAILS = {
    free: {
        features: [
            { text: 'TODO枠3個', available: true },
            { text: 'デイリー習慣トラッカー', available: true },
            { text: 'ステータス機能', available: false },
            { text: 'ジャーナル機能', available: false }
        ]
    },
    plus3: {
        features: [
            { text: 'TODO枠6個', available: true },
            { text: 'デイリー習慣トラッカー', available: true },
            { text: 'ステータス機能', available: false },
            { text: 'ジャーナル機能', available: false }
        ]
    },
    plus6: {
        features: [
            { text: 'TODO枠9個', available: true },
            { text: 'デイリー習慣トラッカー', available: true },
            { text: 'ステータス機能', available: false },
            { text: 'ジャーナル機能', available: false }
        ]
    },
    max: {
        features: [
            { text: 'TODO枠9個', available: true },
            { text: 'デイリー習慣トラッカー', available: true },
            { text: 'ステータス機能', available: true },
            { text: 'ジャーナル機能', available: true }
        ]
    }
};

// === 初期化 ===
async function init() {
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            if (liff.isInClient()) {
                window.location.href = `https://liff.line.me/${LIFF_ID}`;
            } else {
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
            }
            return;
        }

        const profile = await liff.getProfile();
        userId = profile.userId;
    } catch (e) {
        console.error("LIFF初期化エラー:", e);
        userId = "demo_user";
    }

    // データ取得
    await Promise.all([loadEntitlements(), loadPlans()]);

    // UI描画
    renderCurrentPlan();
    renderPlans();
    bindConfirmModal();

    // 表示切り替え
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

// === API ===
async function loadEntitlements() {
    try {
        const res = await fetch(`${API_BASE}/me?user_id=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error('API Error');
        currentEntitlements = await res.json();
    } catch (e) {
        console.error("エンタイトルメント取得エラー:", e);
        currentEntitlements = { plan_code: 'free', task_limit: 3, can_status: false, can_journal: false };
    }
}

async function loadPlans() {
    try {
        const res = await fetch(`${API_BASE}/plans`);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        planData = data.plans || [];
    } catch (e) {
        console.error("プラン一覧取得エラー:", e);
        planData = [
            { plan_code: 'free', display_name: 'FREE', price_jpy: 0, task_limit: 3, can_status: false, can_journal: false },
            { plan_code: 'plus3', display_name: 'PLUS3', price_jpy: 300, task_limit: 6, can_status: false, can_journal: false },
            { plan_code: 'plus6', display_name: 'PLUS6', price_jpy: 500, task_limit: 9, can_status: false, can_journal: false },
            { plan_code: 'max', display_name: 'MAX', price_jpy: 800, task_limit: 9, can_status: true, can_journal: true }
        ];
    }
}

// === UI描画 ===
function renderCurrentPlan() {
    const current = currentEntitlements;
    if (!current) return;

    const plan = planData?.find(p => p.plan_code === current.plan_code);
    const nameEl = document.getElementById('currentPlanName');
    const detailEl = document.getElementById('currentPlanDetail');

    nameEl.textContent = plan ? plan.display_name : 'FREE';

    const details = [];
    details.push(`TODO枠: ${current.task_limit}個`);
    if (current.can_status) details.push('ステータス: 利用可');
    if (current.can_journal) details.push('ジャーナル: 利用可');
    detailEl.textContent = details.join(' / ');

    // 現在のプランカードにスタイルを適用
    const card = document.getElementById('currentPlanCard');
    if (current.plan_code !== 'free') {
        card.style.borderColor = 'var(--success-green)';
    }
}

function renderPlans() {
    const container = document.getElementById('plansList');
    if (!container || !planData) return;

    const currentCode = currentEntitlements?.plan_code || 'free';
    const planOrder = ['free', 'plus3', 'plus6', 'max'];

    // freeプランが planData に含まれていない場合は追加
    let allPlans = [...planData];
    if (!allPlans.find(p => p.plan_code === 'free')) {
        allPlans.unshift({
            plan_code: 'free', display_name: 'FREE', price_jpy: 0,
            task_limit: 3, can_status: false, can_journal: false
        });
    }

    // 順序通りに並べる
    allPlans.sort((a, b) => planOrder.indexOf(a.plan_code) - planOrder.indexOf(b.plan_code));

    container.innerHTML = allPlans.map(p => {
        const isMax = p.plan_code === 'max';
        const isCurrent = p.plan_code === currentCode;
        const currentIdx = planOrder.indexOf(currentCode);
        const thisIdx = planOrder.indexOf(p.plan_code);
        const isDowngrade = thisIdx < currentIdx;
        const details = PLAN_DETAILS[p.plan_code];

        let btnHtml;
        if (isCurrent) {
            btnHtml = `<button class="plan-card-btn btn-current" disabled>現在のプラン</button>`;
        } else if (p.plan_code === 'free') {
            btnHtml = `<button class="plan-card-btn btn-downgrade" disabled>無料プラン（デフォルト）</button>`;
        } else if (isDowngrade) {
            btnHtml = `<button class="plan-card-btn btn-downgrade" disabled>現在のプランより下位</button>`;
        } else {
            btnHtml = `<button class="plan-card-btn btn-primary" data-plan="${p.plan_code}">このプランに申し込む</button>`;
        }

        const priceDisplay = p.price_jpy === 0
            ? '<span class="price-amount">無料</span>'
            : `<span class="price-amount">&yen;${p.price_jpy.toLocaleString()}</span>/月`;

        const featuresHtml = details ? details.features.map(f =>
            `<li class="${f.available ? 'feature-yes' : 'feature-no'}">${f.text}</li>`
        ).join('') : '';

        return `
            <div class="plan-card${isMax ? ' is-max' : ''}${isCurrent ? ' is-current' : ''}">
                <div class="plan-card-header">
                    <div>
                        <span class="plan-card-name">${p.display_name}</span>
                        ${isMax ? '<span class="plan-recommend">おすすめ</span>' : ''}
                    </div>
                    <div class="plan-card-price">${priceDisplay}</div>
                </div>
                <ul class="plan-card-features">${featuresHtml}</ul>
                ${btnHtml}
            </div>
        `;
    }).join('');

    // 購入ボタンのイベント
    container.querySelectorAll('.btn-primary[data-plan]').forEach(btn => {
        btn.onclick = () => showConfirmModal(btn.dataset.plan);
    });
}

// === 購入確認モーダル ===
function bindConfirmModal() {
    document.getElementById('confirmBackdrop').onclick = hideConfirmModal;
    document.getElementById('confirmCancelBtn').onclick = hideConfirmModal;
    document.getElementById('confirmOkBtn').onclick = () => executePurchase();
}

function showConfirmModal(planCode) {
    selectedPlanCode = planCode;
    const plan = planData.find(p => p.plan_code === planCode);
    if (!plan) return;

    document.getElementById('confirmMessage').textContent =
        `${plan.display_name}プラン（¥${plan.price_jpy}/月）に申し込みます。\n決済画面（Stripe）に移動します。`;
    document.getElementById('confirmModal').style.display = 'flex';
}

function hideConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    selectedPlanCode = null;
}

async function executePurchase() {
    if (!selectedPlanCode) return;
    hideConfirmModal();

    if (userId === 'demo_user') {
        alert('デモモードでは購入できません。LINEからアプリを開いてください。');
        return;
    }

    // 処理中オーバーレイ
    const overlay = document.createElement('div');
    overlay.className = 'processing-overlay';
    overlay.innerHTML = '<div class="spinner"></div><div class="processing-text">決済画面に移動中...</div>';
    document.body.appendChild(overlay);

    try {
        const res = await fetch(`${API_BASE}/billing/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, plan_code: selectedPlanCode })
        });

        if (!res.ok) {
            throw new Error(`API Error: ${res.status}`);
        }

        const data = await res.json();
        if (!data.checkout_url) {
            throw new Error('checkout_urlが返ってきません');
        }

        const url = data.checkout_url;
        if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
            try {
                liff.openWindow({ url: url, external: true });
            } catch (liffErr) {
                window.location.href = url;
            }
        } else {
            window.location.href = url;
        }
    } catch (e) {
        console.error('Checkout error:', e);
        alert('購入処理中にエラーが発生しました。時間を置いて再度お試しください。');
    } finally {
        overlay.remove();
    }
}

// === 起動 ===
document.addEventListener('DOMContentLoaded', init);
