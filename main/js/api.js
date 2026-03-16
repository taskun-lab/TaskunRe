/* =============================================
   ムキムキタスくん３ - API通信
   ============================================= */

/**
 * 汎用API呼び出し（Supabase Edge Functions）
 */
async function apiCall(path, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
        const text = await res.text();
        throw Object.assign(new Error(text), { status: res.status, body: text });
    }
    return res.json();
}

/**
 * タスクアクション
 */
async function action(kind, id, extra = {}) {
    return apiCall('/tasks', 'POST', { action: kind, user_id: userId, task_id: id, ...extra });
}

/**
 * ユーザー権限・プラン取得
 */
async function loadEntitlements() {
    try {
        const data = await apiCall(`/me?user_id=${encodeURIComponent(userId)}`);
        currentEntitlements = data;
    } catch (e) {
        console.error('loadEntitlements error:', e);
        currentEntitlements = { plan_code: 'free', task_limit: 3, can_status: false, can_journal: false, role: 'user' };
    }
}

/**
 * プラン一覧取得
 */
async function loadPlans() {
    try {
        const data = await apiCall('/plans');
        planData = data.plans || [];
    } catch (e) {
        console.error('loadPlans error:', e);
        planData = [
            { plan_code: 'plus3', display_name: 'PLUS3', price_jpy: 300, task_limit: 6, can_status: false, can_journal: false },
            { plan_code: 'plus6', display_name: 'PLUS6', price_jpy: 500, task_limit: 9, can_status: false, can_journal: false },
            { plan_code: 'max',   display_name: 'MAX',   price_jpy: 800, task_limit: 9, can_status: true,  can_journal: true }
        ];
    }
}

/**
 * Stripe決済チェックアウト
 */
async function purchasePlan(planCode) {
    if (userId === 'demo_user') {
        alert('デモモードでは購入できません。LINEからアプリを開いてください。');
        return;
    }
    try {
        const data = await apiCall('/billing', 'POST', { user_id: userId, plan_code: planCode });
        if (!data.checkout_url) throw new Error('checkout_url missing');
        const url = data.checkout_url;
        if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
            liff.openWindow({ url, external: true });
        } else {
            window.location.href = url;
        }
    } catch (e) {
        console.error('purchasePlan error:', e);
        alert('購入処理中にエラーが発生しました。');
    }
}

/**
 * checkout成功時リトライ
 */
async function handleCheckoutSuccess() {
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        await loadEntitlements();
        if (currentEntitlements?.plan_code !== 'free') break;
    }
    updateTabLockUI();
}

/**
 * プラン表示名取得
 */
function getPlanDisplayName(planCode) {
    return planData?.find(p => p.plan_code === planCode)?.display_name || planCode;
}
