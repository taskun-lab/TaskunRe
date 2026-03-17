/* =============================================
   ムキムキタスくん - API通信
   ============================================= */

/**
 * 汎用API呼び出し（Supabase Edge Functions用）
 */
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

/**
 * タスクアクション（完了、削除、更新など）
 */
async function action(kind, id, extra = {}) {
    try {
        await apiCall('/tasks/action', 'POST', { user_id: userId, action: kind, task_id: id, ...extra });
    } catch (e) {
        console.error("[ACTION] error:", e);
        alert("操作に失敗しました");
    } finally {
        if (kind !== "remind_custom") loadList();
    }
}

/**
 * エンタイトルメント（権限）取得
 */
async function loadEntitlements() {
    try {
        const data = await apiCall(`/me?user_id=${encodeURIComponent(userId)}`);
        currentEntitlements = data;
    } catch (e) {
        console.error("Entitlements取得エラー:", e);
        currentEntitlements = {
            plan_code: 'free',
            task_limit: 3,
            can_status: false,
            can_journal: false,
            role: 'user'
        };
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
        console.error("プラン一覧取得エラー:", e);
        planData = [
            { plan_code: 'plus3', display_name: 'PLUS3', price_jpy: 300, task_limit: 6, can_status: false, can_journal: false },
            { plan_code: 'plus6', display_name: 'PLUS6', price_jpy: 500, task_limit: 9, can_status: false, can_journal: false },
            { plan_code: 'max', display_name: 'MAX', price_jpy: 800, task_limit: 9, can_status: true, can_journal: true }
        ];
    }
}

/**
 * プラン購入（Stripeチェックアウト）
 */
async function purchasePlan(planCode) {
    if (userId === 'demo_user') {
        alert('デモモードでは購入できません。LINEからアプリを開いてください。');
        return;
    }
    if (!['plus3', 'plus6', 'max'].includes(planCode)) {
        alert('無効なプランが選択されました。');
        return;
    }

    const buttons = document.querySelectorAll('.plan-btn');
    const clickedBtn = document.querySelector(`.plan-btn[data-plan="${planCode}"]`);
    const originalText = clickedBtn ? clickedBtn.innerHTML : '';

    buttons.forEach(btn => btn.disabled = true);
    if (clickedBtn) {
        clickedBtn.innerHTML = '<div style="font-weight:700;">処理中...</div>';
        clickedBtn.style.opacity = '0.7';
    }

    try {
        const data = await apiCall('/billing/checkout', 'POST', { user_id: userId, plan_code: planCode });

        if (!data.checkout_url) {
            console.error('No checkout_url returned:', data);
            alert('checkout_urlが返ってきません。');
            return;
        }

        const url = data.checkout_url;
        if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
            try {
                liff.openWindow({ url: url, external: true });
                hideUpgradeModal();
            } catch (liffErr) {
                const newWindow = window.open(url, '_blank');
                if (!newWindow) {
                    window.location.href = url;
                } else {
                    hideUpgradeModal();
                }
            }
        } else {
            const newWindow = window.open(url, '_blank');
            if (!newWindow) {
                window.location.href = url;
            } else {
                hideUpgradeModal();
            }
        }

    } catch (e) {
        console.error('Checkout error:', e);
        alert('購入処理中にエラーが発生しました。');
    } finally {
        buttons.forEach(btn => btn.disabled = false);
        if (clickedBtn) {
            clickedBtn.innerHTML = originalText;
            clickedBtn.style.opacity = '1';
        }
    }
}

/**
 * チェックアウト成功時のリトライ処理
 */
async function handleCheckoutSuccess() {
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL = 1000;
    const initialPlanCode = currentEntitlements?.plan_code || 'free';

    for (let i = 0; i < MAX_RETRIES; i++) {
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        await loadEntitlements();

        const newPlanCode = currentEntitlements?.plan_code || 'free';
        if (newPlanCode !== initialPlanCode && newPlanCode !== 'free') {
            alert(`プランが「${getPlanDisplayName(newPlanCode)}」にアップグレードされました！`);
            updateTabLockUI();
            if (typeof updateCurrentPlanInfo === 'function') updateCurrentPlanInfo();
            return;
        }
    }

    alert('プランの反映に少し時間がかかっています。\nしばらく待ってからアプリを開き直してください。');
}

/**
 * プラン表示名取得
 */
function getPlanDisplayName(planCode) {
    const plan = planData?.find(p => p.plan_code === planCode);
    return plan?.display_name || planCode;
}
