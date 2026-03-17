/* =============================================
   ムキムキタスくん - モーダル管理
   ============================================= */

let currentDetailTask = null;
let currentPriorityTask = null;
let modalMode = "detail";

// === ミッション ===
let currentMission = null;
let missionCompletedToday = false;
let currentMissionData = null;

/**
 * ミッションタスク読み込み
 */
async function loadMissionTask() {
    const demoData = {
        mission: {
            id: 'demo',
            title: '今週の限界突破ミッション',
            description: '毎日10分間の瞑想で心を鍛え、内なる炎を燃やせ',
            expires_at: getNextSunday()
        },
        completed_today: false,
        today_completions: 42
    };

    try {
        const data = await apiCall(`/missions?user_id=${encodeURIComponent(userId)}`);
        currentMission = data.mission || null;
        missionCompletedToday = data.completed_today || false;
        renderMissionTask(data);
    } catch (e) {
        currentMission = demoData.mission;
        missionCompletedToday = demoData.completed_today;
        renderMissionTask(demoData);
    }
}

function getNextSunday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(23, 59, 59);
    return nextSunday.toISOString();
}

/**
 * ミッションタスクレンダリング
 */
function renderMissionTask(data) {
    const container = document.getElementById('missionTaskContainer');
    if (!data.mission) {
        container.innerHTML = '';
        currentMissionData = null;
        return;
    }

    const mission = data.mission;
    const completedToday = data.completed_today;
    const todayCount = data.today_completions || 0;
    const daysLeft = mission.expires_at ? Math.ceil((new Date(mission.expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : null;

    currentMissionData = { mission, completedToday, todayCount, daysLeft };

    const normalizeNewlines = (s) => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    container.innerHTML = `
        <div class="mission-task-wrapper">
            <div class="mission-achievement-bubble">🔥 ${todayCount}人が達成</div>
            <div class="mission-task-card ${completedToday ? 'completed' : ''}" id="missionCard">
                <div class="mission-completed-stamp">COMPLETED</div>
                <div class="mission-task-header">
                    <div class="mission-task-badge"><span>🎯</span><span>MISSION</span></div>
                </div>
                <div class="mission-task-title"></div>
                <div class="mission-task-desc"></div>
                <div class="mission-task-actions">
                    ${mission.expires_at ? `<div class="mission-expire">残り${daysLeft > 0 ? daysLeft : 0}日</div>` : ''}
                </div>
                <div class="mission-swipe-hint">タップで詳細</div>
            </div>
        </div>`;

    const titleEl = container.querySelector('.mission-task-title');
    const descEl = container.querySelector('.mission-task-desc');
    if (titleEl) titleEl.textContent = normalizeNewlines(mission.title || 'ミッション');
    if (descEl) descEl.textContent = normalizeNewlines(mission.description || '');

    const card = document.getElementById('missionCard');
    if (card) {
        card.addEventListener('click', () => openMissionDetailModal());
        card.style.cursor = 'pointer';
    }
}

/**
 * ミッション詳細モーダル
 */
function openMissionDetailModal() {
    if (!currentMissionData) return;
    const { mission, completedToday, todayCount, daysLeft } = currentMissionData;
    const modal = document.getElementById('missionDetailModal');
    const panel = document.getElementById('missionModalPanel');

    document.getElementById('missionModalTitle').textContent = mission.title || 'ミッション';
    document.getElementById('missionModalDesc').textContent = mission.description || '説明なし';
    document.getElementById('missionModalCount').textContent = todayCount;

    const expireItem = document.getElementById('missionStatExpire');
    if (mission.expires_at && daysLeft !== null) {
        expireItem.style.display = 'block';
        document.getElementById('missionModalDays').textContent = daysLeft > 0 ? daysLeft : 0;
    } else {
        expireItem.style.display = 'none';
    }

    const completeBtn = document.getElementById('missionModalCompleteBtn');
    if (completedToday) {
        panel.classList.add('completed');
        completeBtn.classList.add('completed');
        completeBtn.innerHTML = '<span>↩</span><span>未達成に戻す</span>';
    } else {
        panel.classList.remove('completed');
        completeBtn.classList.remove('completed');
        completeBtn.innerHTML = '<span>✓</span><span>達成する</span>';
    }

    modal.classList.add('visible');
}

function closeMissionDetailModal() {
    document.getElementById('missionDetailModal').classList.remove('visible');
}

function bindMissionModalUI() {
    document.getElementById('missionModalBackdrop').onclick = closeMissionDetailModal;
    document.getElementById('missionModalClose').onclick = closeMissionDetailModal;

    document.getElementById('missionModalCompleteBtn').onclick = async () => {
        if (!currentMissionData) return;
        const { mission, completedToday } = currentMissionData;
        if (completedToday) {
            await uncompleteMission(mission.id);
        } else {
            await completeMission(mission.id);
        }
        closeMissionDetailModal();
    };

    document.getElementById('missionModalTimerBtn').onclick = () => {
        window.open('https://liff.line.me/2008372898-OgpQWq4L', '_blank');
    };
}

async function completeMission(missionId) {
    try {
        const res = await apiCall('/missions/complete', 'POST', { user_id: userId, mission_id: missionId });
        missionCompletedToday = true;
        await loadMissionTask();
    } catch (e) {
        missionCompletedToday = true;
        if (currentMissionData) currentMissionData.completedToday = true;
        const card = document.getElementById('missionCard');
        if (card) card.classList.add('completed');
    }
}

async function uncompleteMission(missionId) {
    try {
        const res = await apiCall('/missions/uncomplete', 'POST', { user_id: userId, mission_id: missionId });
        missionCompletedToday = false;
        await loadMissionTask();
    } catch (e) {
        missionCompletedToday = false;
        if (currentMissionData) currentMissionData.completedToday = false;
        const card = document.getElementById('missionCard');
        if (card) card.classList.remove('completed');
    }
}

// === タスク詳細モーダル ===
let currentTaskDetailData = null;

function openTaskDetailModal(t, isCompleted) {
    currentTaskDetailData = t;
    const modal = document.getElementById('taskDetailModal');
    const viewContent = document.getElementById('taskViewContent');
    const editContent = document.getElementById('taskEditContent');

    viewContent.classList.remove('hidden');
    editContent.classList.remove('active');

    const taskName = t.task_name || t.title || '(無題)';
    document.getElementById('taskModalTitle').textContent = taskName;

    // 優先度バッジ
    const priority = t.priority_level || 'normal';
    const priorityEl = document.getElementById('taskModalPriority');
    if (priority === 'critical') {
        priorityEl.textContent = '🔥 最重要';
        priorityEl.className = 'task-modal-priority priority-critical-label';
        priorityEl.style.display = '';
    } else if (priority === 'high') {
        priorityEl.textContent = '⚡ 重要';
        priorityEl.className = 'task-modal-priority priority-high-label';
        priorityEl.style.display = '';
    } else {
        priorityEl.style.display = 'none';
    }

    // 情報セクション
    const infoEl = document.getElementById('taskModalInfo');
    let infoHtml = '';
    if (t.remind_at) {
        infoHtml += `<div class="task-info-item"><span class="task-info-label">🔔 リマインド</span><span class="task-info-value">${formatRemindLabel(t.remind_at)}</span></div>`;
    }
    if (isCompleted) {
        infoHtml += `<div class="task-info-item"><span class="task-info-label">✅ ステータス</span><span class="task-info-value">完了済み</span></div>`;
    }
    infoEl.innerHTML = infoHtml;

    modal.classList.add('visible');
}

function bindTaskDetailModalUI() {
    const modal = document.getElementById('taskDetailModal');
    const close = () => { modal.classList.remove('visible'); currentTaskDetailData = null; };

    document.getElementById('taskDetailBackdrop').onclick = close;
    document.getElementById('closeTaskDetail').onclick = close;
    document.getElementById('taskDetailCloseBtn').onclick = close;
    document.getElementById('closeTaskEdit').onclick = close;

    // 編集モード
    document.getElementById('taskDetailEditBtn').onclick = () => {
        if (!currentTaskDetailData) return;
        document.getElementById('taskViewContent').classList.add('hidden');
        document.getElementById('taskEditContent').classList.add('active');
        document.getElementById('editTaskName').value = currentTaskDetailData.task_name || currentTaskDetailData.title || '';
        setTimeout(() => document.getElementById('editTaskName').focus(), 50);
    };

    // 編集キャンセル
    document.getElementById('taskCancelEditBtn').onclick = () => {
        document.getElementById('taskViewContent').classList.remove('hidden');
        document.getElementById('taskEditContent').classList.remove('active');
    };

    // 編集保存
    document.getElementById('taskSaveEditBtn').onclick = async () => {
        if (!currentTaskDetailData) return;
        const newTitle = document.getElementById('editTaskName').value.trim();
        const oldTitle = currentTaskDetailData.task_name || currentTaskDetailData.title || '';
        if (newTitle && newTitle !== oldTitle) {
            await action("rename", currentTaskDetailData.id, { task_name: newTitle });
        }
        close();
    };
}

// === 詳細モーダル ===
function bindModalUI() {
    const modal = document.getElementById('detailModal');
    const close = () => modal.classList.remove("visible");

    document.getElementById('detailBackdrop').onclick = close;
    document.getElementById('detailCloseBtn').onclick = close;
    document.getElementById('detailCancelBtn').onclick = close;

    ['Priority', 'Vision', 'Excite', 'Growth'].forEach(name => {
        const input = document.getElementById(`input${name}`);
        const val = document.getElementById(`val${name}`);
        input.addEventListener('input', () => val.textContent = input.value);
    });

    document.getElementById('inputRemindAt').addEventListener('change', e => {
        document.getElementById('valRemindAt').textContent = e.target.value
            ? formatRemindLabel(new Date(e.target.value).toISOString())
            : '';
    });

    document.getElementById('detailSaveBtn').onclick = async () => {
        if (!currentDetailTask) return;
        if (modalMode === "detail") {
            await action("update_detail", currentDetailTask.id, {
                priority: Number(document.getElementById('inputPriority').value),
                vision_score: Number(document.getElementById('inputVision').value),
                excite_score: Number(document.getElementById('inputExcite').value),
                growth_score: Number(document.getElementById('inputGrowth').value),
            });
        } else {
            const inputVal = document.getElementById('inputRemindAt').value;
            await action("remind_custom", currentDetailTask.id, {
                remind_at: inputVal ? new Date(inputVal).toISOString() : null,
                kind: inputVal ? "custom_datetime" : "clear"
            });
        }
        close();
    };
}

function openDetail(t) {
    modalMode = "detail";
    currentDetailTask = t;
    document.getElementById('modalTitle').textContent = "💪 タスク詳細";
    document.getElementById('detailTaskTitle').textContent = t.task_name || t.title || "(無題)";
    document.getElementById('scoreGroup').style.display = "block";
    document.getElementById('remindGroup').style.display = "none";

    ['Priority', 'Vision', 'Excite', 'Growth'].forEach(name => {
        const val = t[name.toLowerCase() + (name === 'Priority' ? '' : '_score')] ?? 0;
        document.getElementById(`input${name}`).value = val;
        document.getElementById(`val${name}`).textContent = val;
    });
    document.getElementById('detailModal').classList.add("visible");
}

function openRemind(t) {
    modalMode = "remind";
    currentDetailTask = t;
    document.getElementById('modalTitle').textContent = "🔔 通知設定";
    document.getElementById('detailTaskTitle').textContent = t.task_name || t.title || "(無題)";
    document.getElementById('scoreGroup').style.display = "none";
    document.getElementById('remindGroup').style.display = "block";

    const input = document.getElementById('inputRemindAt');
    const val = document.getElementById('valRemindAt');
    if (t.remind_at) {
        input.value = toLocalDatetimeValue(t.remind_at);
        val.textContent = formatRemindLabel(t.remind_at);
    } else {
        input.value = '';
        val.textContent = '';
    }
    document.getElementById('detailModal').classList.add("visible");
}

// === 優先順位モーダル ===
function bindPriorityModalUI() {
    const modal = document.getElementById('priorityModal');
    const close = () => { modal.classList.remove('visible'); currentPriorityTask = null; };

    document.getElementById('priorityBackdrop').onclick = close;
    document.getElementById('priorityCloseBtn').onclick = close;

    document.querySelectorAll('.priority-option').forEach(opt => {
        opt.addEventListener('click', async () => {
            if (!currentPriorityTask) return;
            const priority = opt.dataset.priority;
            await action("set_priority", currentPriorityTask.id, { priority_level: priority });
            close();
        });
    });
}

function openPriorityModal(t) {
    currentPriorityTask = t;
    document.getElementById('priorityTaskTitle').textContent = t.task_name || t.title || "(無題)";
    document.getElementById('priorityModal').classList.add('visible');
}

// === アップグレードモーダル ===
function bindUpgradeModalUI() {
    document.getElementById('upgradeCloseBtn').onclick = hideUpgradeModal;
    document.getElementById('upgradeBackdrop').onclick = hideUpgradeModal;
    renderPlanOptions();
    updateCurrentPlanInfo();

    // 「プランを詳しく見る」ボタン
    const viewPlansBtn = document.getElementById('viewPlansBtn');
    if (viewPlansBtn) {
        viewPlansBtn.onclick = () => {
            if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
                liff.openWindow({ url: PLAN_PAGE_URL, external: true });
            } else {
                window.open(PLAN_PAGE_URL, '_blank');
            }
        };
    }
}

function renderPlanOptions() {
    const container = document.querySelector('.plan-options');
    if (!container || !planData) return;

    const purchasablePlans = planData.filter(p => p.plan_code !== 'free');
    container.innerHTML = purchasablePlans.map(p => {
        const isMax = p.plan_code === 'max';
        const features = [];
        features.push(`TODO枠${p.task_limit}個`);
        if (p.can_status) features.push('ステータス');
        if (p.can_journal) features.push('ジャーナル');

        return `
            <div class="plan-info-card" style="padding:16px;border:2px solid ${isMax ? 'var(--accent)' : 'var(--border)'};border-radius:12px;background:${isMax ? 'linear-gradient(135deg, #fff9e6, #fff)' : 'white'};text-align:left;">
                <div style="font-weight:700;color:${isMax ? 'var(--accent)' : 'var(--primary)'};">${p.display_name} - ¥${p.price_jpy}/月${isMax ? ' ⭐おすすめ' : ''}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${features.join(' + ')}</div>
            </div>
        `;
    }).join('');
}

function updateCurrentPlanInfo() {
    const infoEl = document.getElementById('currentPlanInfo');
    if (!currentEntitlements || !infoEl) return;

    const currentPlan = planData?.find(p => p.plan_code === currentEntitlements.plan_code);
    const planName = currentPlan?.display_name || '無料プラン';
    infoEl.innerHTML = `現在のプラン: <strong>${planName}</strong> (TODO枠: ${currentEntitlements.task_limit}個)`;
}

function showUpgradeModal(featureName) {
    document.getElementById('upgradeMessage').textContent =
        `${featureName}は上位プランで利用できます。詳しくはプランページをご覧ください。`;
    document.getElementById('upgradeModal').style.display = 'flex';
}

function hideUpgradeModal() {
    document.getElementById('upgradeModal').style.display = 'none';
}

// === ユーティリティ ===
function formatRemindLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `🔔${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function toLocalDatetimeValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

// === タスク追加モーダル（Phase2） ===
function showAddTaskModal() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    modal.style.display = 'flex';
}

function hideAddTaskModal() {
    const modal = document.getElementById('addTaskModal');
    if (modal) modal.style.display = 'none';
}

function bindAddTaskModalUI() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    const backdrop = document.getElementById('addTaskBackdrop');
    const closeBtn = document.getElementById('addTaskCloseBtn');
    if (backdrop) backdrop.onclick = hideAddTaskModal;
    if (closeBtn) closeBtn.onclick = hideAddTaskModal;

    // セグメントコントロール
    document.querySelectorAll('.segment-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.type;
            const reasonGroup = document.getElementById('reasonGroup');
            const timeGroup = document.getElementById('timeGroup');
            if (reasonGroup) reasonGroup.style.display = type === 'mission' ? 'block' : 'none';
            if (timeGroup) timeGroup.style.display = type === 'appointment' ? 'block' : 'none';
        };
    });

    const submitBtn = document.getElementById('addTaskSubmitBtn');
    if (submitBtn) submitBtn.onclick = async () => {
        const titleEl = document.getElementById('addTaskTitle');
        const title = titleEl ? titleEl.value.trim() : '';
        if (!title) return;
        if (!checkTaskLimit()) return;
        const type = document.querySelector('.segment-btn.active')?.dataset.type || 'mission';
        const reasonEl = document.getElementById('addTaskReason');
        const reason = reasonEl ? reasonEl.value.trim() || null : null;
        await action('create', null, { task_name: title, task_type: type, reason });
        if (titleEl) titleEl.value = '';
        if (reasonEl) reasonEl.value = '';
        hideAddTaskModal();
    };
}

// === 習慣設定モーダル（Phase2） ===
let selectedHabitIds = new Set();

async function showHabitSettingsModal() {
    const modal = document.getElementById('habitSettingsModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const presets = await loadHabitPresets();
    renderHabitPresetsGrid(presets);
}

function renderHabitPresetsGrid(presets) {
    const grid = document.getElementById('presetGrid');
    if (!grid) return;
    const byCategory = {};
    for (const p of presets) {
        if (!byCategory[p.category]) byCategory[p.category] = [];
        byCategory[p.category].push(p);
    }
    grid.innerHTML = HABIT_CATEGORIES.map(cat => {
        const items = byCategory[cat] || [];
        return `<div class="preset-category">
            <div class="preset-category-title">${cat}</div>
            <div class="preset-items">
                ${items.map(p => `
                    <div class="preset-item ${selectedHabitIds.has(p.habit_id) ? 'selected' : ''}" data-id="${p.habit_id}" data-name="${p.habit_name}" data-cat="${p.category}" data-icon="${p.icon}">
                        <span>${p.icon}</span><span>${p.habit_name}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.preset-item').forEach(item => {
        item.onclick = () => {
            const id = item.dataset.id;
            if (selectedHabitIds.has(id)) {
                selectedHabitIds.delete(id);
                item.classList.remove('selected');
            } else if (selectedHabitIds.size < 6) {
                selectedHabitIds.add(id);
                item.classList.add('selected');
            } else {
                alert('最大6つまで選択できます');
            }
        };
    });
}

function bindHabitSettingsModalUI() {
    const modal = document.getElementById('habitSettingsModal');
    if (!modal) return;
    const backdrop = document.getElementById('habitSettingsBackdrop');
    const closeBtn = document.getElementById('habitSettingsCloseBtn');
    if (backdrop) backdrop.onclick = () => modal.style.display = 'none';
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    const saveBtn = document.getElementById('habitSettingsSaveBtn');
    if (saveBtn) saveBtn.onclick = async () => {
        const grid = document.getElementById('presetGrid');
        if (!grid) return;
        const selected = Array.from(grid.querySelectorAll('.preset-item.selected')).map(el => ({
            habit_id: el.dataset.id,
            habit_name: el.dataset.name,
            category: el.dataset.cat,
            icon: el.dataset.icon
        }));
        await saveHabitSettings(selected);
        modal.style.display = 'none';
    };
}
