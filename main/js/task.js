/* =============================================
   ムキムキタスくん３ - タスク管理（Phase2: 2種別対応）
   ============================================= */

async function loadList() {
    try {
        const data = await apiCall(`/tasks/list?user_id=${encodeURIComponent(userId)}`);
        renderList(data);
    } catch (e) {
        console.error('loadList error:', e);
    }
}

function renderList(payload) {
    const groups = { critical: payload.critical || [], high: payload.high || [], active: payload.active || [], completed: payload.completed || [] };
    ['critical', 'high', 'active'].forEach(g => {
        const el = document.getElementById(g);
        if (!el) return;
        el.innerHTML = '';
        groups[g].forEach(t => el.appendChild(createTaskCard(t, false, g)));
    });
    const compEl = document.getElementById('completed');
    if (compEl) {
        compEl.innerHTML = '';
        groups.completed.forEach(t => compEl.appendChild(createTaskCard(t, true, 'completed')));
    }
}

function createTaskCard(t, isCompleted, priority) {
    const isAppointment = t.task_type === 'appointment';
    const wrap = document.createElement('div');
    wrap.className = `swipe-wrap${isCompleted ? ' completed-card' : ''}`;
    wrap.dataset.id = t.id;

    const sl = document.createElement('div');
    sl.className = `task-card${isAppointment ? ' task-appointment' : ' task-mission'}${isCompleted ? ' is-completed' : ''}`;

    // タイムスタンプ表示（予定タスク）
    let timeHtml = '';
    if (isAppointment && t.remind_at) {
        const d = new Date(t.remind_at);
        timeHtml = `<span class="task-time">${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}</span>`;
    }

    // アイコン
    const icon = isAppointment ? '🕐' : '🎯';

    // 理由表示（ミッションタスク）
    let reasonHtml = '';
    if (!isAppointment && t.reason) {
        reasonHtml = `<div class="task-reason">└ ${t.reason}</div>`;
    }

    // リマインドラベル
    const remindLabel = t.remind_at ? formatRemindLabel(t.remind_at) : '';

    sl.innerHTML = `
        <div class="task-main" style="display:flex;align-items:flex-start;gap:6px;flex:1;min-width:0;">
            <span style="font-size:14px;flex-shrink:0;">${icon}</span>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:4px;">
                    ${timeHtml}
                    <span class="task-name${isCompleted ? ' strikethrough' : ''}">${escapeHtml(t.task_name || '')}</span>
                </div>
                ${reasonHtml}
                ${remindLabel ? `<div class="remind-label">${remindLabel}</div>` : ''}
            </div>
        </div>
        <div class="drag-handle" title="並び替え">☰</div>
    `;

    // 左ボタン（完了・通知）
    const leftBtns = document.createElement('div');
    leftBtns.className = 'swipe-left-btns';
    if (!isCompleted) {
        leftBtns.innerHTML = `
            <button class="swipe-btn btn-complete" data-id="${t.id}">✓<br><span style="font-size:9px;">完了</span></button>
            <button class="swipe-btn btn-remind" data-id="${t.id}">🔔<br><span style="font-size:9px;">通知</span></button>
        `;
    } else {
        leftBtns.innerHTML = `<button class="swipe-btn btn-uncomplete" data-id="${t.id}">↩<br><span style="font-size:9px;">戻す</span></button>`;
    }

    // 右ボタン（詳細・優先度・削除）
    const rightBtns = document.createElement('div');
    rightBtns.className = 'swipe-right-btns';
    rightBtns.innerHTML = `
        <button class="swipe-btn btn-detail" data-id="${t.id}">📋<br><span style="font-size:9px;">詳細</span></button>
        <button class="swipe-btn btn-priority" data-id="${t.id}">⭐<br><span style="font-size:9px;">優先</span></button>
        <button class="swipe-btn btn-delete" data-id="${t.id}">🗑<br><span style="font-size:9px;">削除</span></button>
    `;

    wrap.appendChild(leftBtns);
    wrap.appendChild(sl);
    wrap.appendChild(rightBtns);

    // イベント
    sl.onclick = (e) => {
        if (isDraggingCard) return;
        if (e.target.closest('.drag-handle')) return;
        openTaskDetailModal(t, isCompleted);
    };
    leftBtns.querySelector('.btn-complete')?.addEventListener('click', () => {
        action('complete', t.id).then(renderList);
    });
    leftBtns.querySelector('.btn-uncomplete')?.addEventListener('click', () => {
        action('uncomplete', t.id).then(renderList);
    });
    leftBtns.querySelector('.btn-remind')?.addEventListener('click', () => openRemind(t));
    rightBtns.querySelector('.btn-detail').addEventListener('click', () => openDetail(t));
    rightBtns.querySelector('.btn-priority').addEventListener('click', () => openPriorityModal(t));
    rightBtns.querySelector('.btn-delete').addEventListener('click', () => {
        action('delete', t.id).then(renderList);
    });

    applySwipeToCard(wrap, t, isCompleted);
    setupDragHandle(wrap.querySelector('.drag-handle'), wrap, sl, t);

    return wrap;
}

function setupDragHandle(handle, wrap, sl, t) {
    if (!handle) return;
    handle.addEventListener('touchstart', (e) => {
        isDraggingCard = true;
        closeAllSwipeRows();
    }, { passive: true });
    handle.addEventListener('touchend', () => {
        setTimeout(() => { isDraggingCard = false; }, 100);
    });
}

function saveSortOrder() {
    const orders = [];
    document.querySelectorAll('.swipe-wrap[data-id]').forEach((el, i) => {
        orders.push({ id: parseInt(el.dataset.id), sort_order: i });
    });
    action('sort_update', null, { orders });
}

function addTask() { showAddTaskModal(); }

function getTodoCount() {
    return document.querySelectorAll('#critical .swipe-wrap, #high .swipe-wrap, #active .swipe-wrap').length;
}

function checkTaskLimit() {
    if (!currentEntitlements) return true;
    const limit = currentEntitlements.task_limit;
    if (limit == null) return true;
    return getTodoCount() < limit;
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
