/* =============================================
   ムキムキタスくん - タスク管理
   ============================================= */

// DOM要素
const criticalEl = document.getElementById("critical");
const highEl = document.getElementById("high");
const activeEl = document.getElementById("active");
const completedEl = document.getElementById("completed");

/**
 * タスクリスト読み込み
 */
async function loadList() {
    try {
        const data = await apiCall(`/tasks/list?user_id=${encodeURIComponent(userId)}`);
        renderList(data);
    } catch (e) {
        console.error("タスク取得エラー:", e);
        renderList({ critical: [], high: [], active: [], completed: [] });
    }
}

/**
 * タスクリストをレンダリング
 */
function renderList(payload) {
    criticalEl.innerHTML = '';
    highEl.innerHTML = '';
    activeEl.innerHTML = '';
    completedEl.innerHTML = '';

    const critical = Array.isArray(payload.critical) ? payload.critical : [];
    const high = Array.isArray(payload.high) ? payload.high : [];
    const active = Array.isArray(payload.active) ? payload.active : [];
    const completed = Array.isArray(payload.completed) ? payload.completed : [];

    critical.forEach(t => { t.priority_level = 'critical'; criticalEl.appendChild(createTaskCard(t, false, 'critical')); });
    high.forEach(t => { t.priority_level = 'high'; highEl.appendChild(createTaskCard(t, false, 'high')); });
    active.forEach(t => { t.priority_level = t.priority_level || 'normal'; activeEl.appendChild(createTaskCard(t, false, t.priority_level)); });
    completed.forEach(t => completedEl.appendChild(createTaskCard(t, true, t.priority_level || 'normal')));
}

/**
 * タスクカードを作成（スワイプ機能付き）
 */
function createTaskCard(t, isCompleted, priority) {
    const wrap = document.createElement("div");
    wrap.className = `card priority-${priority}`;
    if (isCompleted) wrap.classList.add("completed");

    // アクションレール（左右のボタン）
    const rail = document.createElement("div");
    rail.className = "actions-rail";

    // 左側アクション（完了/未完了）
    const left = document.createElement("div");
    left.className = "actions-left";
    if (!isCompleted) {
        left.append(
            mkBtn("完了", () => action("complete", t.id), "btn-complete"),
            mkBtn("通知", () => openRemind(t), "btn-plus2h")
        );
    } else {
        left.append(mkBtn("未完", () => {
            if (checkTaskLimit()) action("uncomplete", t.id);
        }, "btn-complete"));
    }

    // 右側アクション
    const right = document.createElement("div");
    right.className = "actions-right";
    right.append(
        mkBtn("詳細", () => openDetail(t), "btn-detail"),
        mkBtn("優先", () => openPriorityModal(t), "btn-priority"),
        mkBtn("削除", () => action("delete", t.id), "btn-delete")
    );

    rail.append(left, right);

    // メインコンテンツ（スライド部分）
    const sl = document.createElement("div");
    sl.className = "sl";

    // コンテンツエリア（タイトル＋リマインド）
    const contentArea = document.createElement("div");
    contentArea.className = "card-content";

    const titleArea = document.createElement("div");
    titleArea.className = "card-title-area";

    // 優先順位バッジ
    if (priority === 'critical') {
        const badge = document.createElement("span");
        badge.className = "priority-badge";
        badge.textContent = "最重要";
        titleArea.appendChild(badge);
    } else if (priority === 'high') {
        const badge = document.createElement("span");
        badge.className = "priority-badge";
        badge.textContent = "重要";
        titleArea.appendChild(badge);
    }

    // タスクタイプアイコン（Phase2）
    if (t.task_type === 'appointment') {
        const icon = document.createElement("span");
        icon.textContent = "🕐";
        icon.style.cssText = "font-size:13px;flex-shrink:0;";
        titleArea.appendChild(icon);
    } else if (t.task_type === 'mission') {
        const icon = document.createElement("span");
        icon.textContent = "🎯";
        icon.style.cssText = "font-size:13px;flex-shrink:0;";
        titleArea.appendChild(icon);
    }

    const titleEl = document.createElement("span");
    titleEl.className = "title";
    titleEl.textContent = t.task_name || t.title || "(無題)";
    titleArea.appendChild(titleEl);
    contentArea.appendChild(titleArea);

    // リマインド表示（タイトル下に配置）
    if (t.remind_at) {
        const remindEl = document.createElement("div");
        remindEl.className = "remindAt";
        remindEl.textContent = formatRemindLabel(t.remind_at);
        contentArea.appendChild(remindEl);
    }

    // ドラッグハンドル
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = "☰";

    sl.append(contentArea, handle);
    wrap.append(rail, sl);

    // === 改良版スワイプ機能を適用 ===
    applySwipeToCard(wrap, t, isCompleted, (actionType, taskId) => {
        if (actionType === 'complete') {
            action("complete", taskId);
        } else if (actionType === 'uncomplete') {
            if (checkTaskLimit()) action("uncomplete", taskId);
        } else if (actionType === 'delete') {
            action("delete", taskId);
        }
    });

    // === ドラッグ（並び替え）===
    setupDragHandle(handle, wrap, sl, t);

    // === タップで詳細モーダルを開く ===
    sl.addEventListener('click', (e) => {
        if (e.target.closest('.handle') || e.target.closest('button')) return;
        if (wrap.classList.contains('open-left') || wrap.classList.contains('open-right')) return;
        openTaskDetailModal(t, isCompleted);
    });

    // タスクデータを保持
    wrap.__taskData = t;
    wrap.dataset.taskId = t.id;

    return wrap;
}

/**
 * ドラッグハンドルのセットアップ
 */
function setupDragHandle(handle, wrap, sl, t) {
    const startDrag = (startEvent) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const card = wrap;
        const list = card.parentElement;
        if (!list) return;

        isDraggingCard = true;
        closeAllSwipeRows(); // 開いているスワイプを閉じる

        card.classList.remove("open-left", "open-right");
        sl.style.transition = "none";
        sl.style.transform = "translateX(0)";

        const cardRect = card.getBoundingClientRect();
        const dragStartY = startEvent.clientY || (startEvent.touches && startEvent.touches[0].clientY);
        const cardStartTop = cardRect.top;
        const cardHeight = cardRect.height;
        const cardWidth = cardRect.width;

        // ドラッグ用クローン
        const dragClone = card.cloneNode(true);
        dragClone.style.cssText = `position:fixed;left:${cardRect.left}px;top:${cardRect.top}px;width:${cardWidth}px;height:${cardHeight}px;pointer-events:none;z-index:1000;opacity:0.95;box-shadow:0 8px 20px rgba(0,0,0,0.3);transition:none;`;
        dragClone.classList.add("dragging");
        document.body.appendChild(dragClone);

        card.style.opacity = "0.3";
        card.style.transition = "none";
        document.body.style.userSelect = "none";

        const getY = ev => ev.touches?.length ? ev.touches[0].clientY : ev.clientY;

        const updatePosition = (y) => {
            const deltaY = y - dragStartY;
            dragClone.style.top = (cardStartTop + deltaY) + "px";

            const cloneCenterY = cardStartTop + deltaY + cardHeight / 2;
            const siblings = Array.from(list.querySelectorAll(".card"));

            for (const sibling of siblings) {
                if (sibling === card) continue;
                const siblingRect = sibling.getBoundingClientRect();
                if (cloneCenterY < siblingRect.top + siblingRect.height / 2) {
                    if (card.nextSibling !== sibling) list.insertBefore(card, sibling);
                    return;
                }
            }
            if (list.lastElementChild !== card) list.appendChild(card);
        };

        const onMove = ev => {
            ev.preventDefault();
            updatePosition(getY(ev));
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onUp);

            dragClone.remove();
            card.style.opacity = "";
            card.style.transition = "";
            card.classList.remove("open-left", "open-right");

            const slEl = card.querySelector(".sl");
            if (slEl) {
                slEl.style.transition = "";
                slEl.style.transform = "translateX(0)";
            }

            document.body.style.userSelect = "";
            setTimeout(() => isDraggingCard = false, 50);
            saveSortOrder();
        };

        document.addEventListener("pointermove", onMove, { passive: false });
        document.addEventListener("pointerup", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
    };

    handle.addEventListener("pointerdown", e => { e.preventDefault(); startDrag(e); });
    handle.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); startDrag(e); }, { passive: false });
}

/**
 * 並び順保存
 */
async function saveSortOrder() {
    if (!userId) return;
    const orders = [];
    [criticalEl, highEl, activeEl, completedEl].forEach((listEl, idx) => {
        const section = ['critical', 'high', 'active', 'completed'][idx];
        listEl.querySelectorAll('.card').forEach((card, index) => {
            const t = card.__taskData;
            if (t) orders.push({ id: t.id, sort_order: index, section });
        });
    });
    if (orders.length) await action("sort_update", null, { orders });
}

/**
 * タスク追加（インライン入力）
 */
async function addTask() {
    const input = document.getElementById('newTitle');
    const title = input.value.trim();
    if (!title) return;

    if (!checkTaskLimit()) return;

    await action("create", null, { task_name: title });
    input.value = "";
}

/**
 * 現在の未完了タスク数を取得
 */
function getTodoCount() {
    const criticalCount = criticalEl.querySelectorAll('.card:not(.completed)').length;
    const highCount = highEl.querySelectorAll('.card:not(.completed)').length;
    const activeCount = activeEl.querySelectorAll('.card:not(.completed)').length;
    return criticalCount + highCount + activeCount;
}

/**
 * タスク枠制限チェック
 */
function checkTaskLimit() {
    // gating_enabled が false なら制限なし
    if (typeof isGatingEnabled === 'function' && !isGatingEnabled()) {
        return true;
    }

    const taskLimit = currentEntitlements?.task_limit ?? 3;
    const role = currentEntitlements?.role || 'user';

    // developer/adminは制限なし
    if (role === 'developer' || role === 'admin') {
        return true;
    }

    const currentCount = getTodoCount();
    if (currentCount >= taskLimit) {
        showUpgradeModal('TODO枠');
        return false;
    }
    return true;
}

/**
 * ボタン作成ヘルパー
 */
function mkBtn(label, onClick, cls) {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
    });
    return b;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
