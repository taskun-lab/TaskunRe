/* =============================================
   ムキムキタスくん３ - モーダル管理（Phase2: タスク追加・習慣設定モーダル）
   ============================================= */

let currentDetailTask = null;
let currentPriorityTask = null;
let currentTaskDetailData = null;
let modalMode = 'detail';
let currentMission = null;
let missionCompletedToday = false;
let currentMissionData = null;

// ===== ミッション =====
async function loadMissionTask() {
    try {
        const data = await apiCall(`/missions?user_id=${encodeURIComponent(userId)}`);
        currentMission = data.mission;
        missionCompletedToday = data.completed_today;
        currentMissionData = data;
        renderMissionTask(data);
    } catch (e) {
        console.error('loadMissionTask error:', e);
    }
}

function renderMissionTask(data) {
    const el = document.getElementById('missionTaskContainer');
    if (!el) return;
    if (!data?.mission) { el.innerHTML = ''; return; }
    const { mission, completed_today, today_completions } = data;
    const expires = mission.expires_at ? new Date(mission.expires_at) : null;
    const daysLeft = expires ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : null;
    el.innerHTML = `
        <div class="mission-card${completed_today ? ' mission-done' : ''}">
            <div class="mission-header">
                <span class="mission-label">🎯 今週のミッション</span>
                ${daysLeft !== null ? `<span class="mission-days">残り${daysLeft}日</span>` : ''}
            </div>
            <div class="mission-title">${escapeHtml(mission.title)}</div>
            ${mission.description ? `<div class="mission-desc">${escapeHtml(mission.description)}</div>` : ''}
            <div class="mission-footer">
                <span class="mission-count">👥 ${today_completions}人が今日達成</span>
                <button class="mission-action-btn${completed_today ? ' mission-btn-done' : ''}"
                    id="missionCompleteBtn">
                    ${completed_today ? '✅ 達成済み' : '達成する 💪'}
                </button>
            </div>
        </div>
    `;
    document.getElementById('missionCompleteBtn').onclick = () => {
        if (missionCompletedToday) uncompleteMission(mission.id);
        else completeMission(mission.id);
    };
}

async function completeMission(missionId) {
    try {
        await apiCall('/missions/complete', 'POST', { user_id: userId, mission_id: missionId });
        await loadMissionTask();
    } catch (e) { console.error(e); }
}

async function uncompleteMission(missionId) {
    try {
        await apiCall('/missions/uncomplete', 'POST', { user_id: userId, mission_id: missionId });
        await loadMissionTask();
    } catch (e) { console.error(e); }
}

// ===== タスク詳細モーダル =====
function openTaskDetailModal(t, isCompleted) {
    currentTaskDetailData = t;
    document.getElementById('taskDetailName').textContent = t.task_name || '';
    document.getElementById('taskDetailType').textContent = t.task_type === 'appointment' ? '🕐 予定タスク' : '🎯 ミッションタスク';
    document.getElementById('taskDetailReason').textContent = t.reason || '';
    document.getElementById('taskDetailReason').style.display = t.reason ? 'block' : 'none';
    document.getElementById('taskDetailModal').style.display = 'flex';
}

function openDetail(t) {
    currentDetailTask = t;
    modalMode = 'detail';
    document.getElementById('detailTaskName').textContent = t.task_name || '';
    document.getElementById('inputVision').value = t.vision_score || 0;
    document.getElementById('inputExcite').value = t.excite_score || 0;
    document.getElementById('inputGrowth').value = t.growth_score || 0;
    document.getElementById('detailModal').style.display = 'flex';
}

function openRemind(t) {
    currentDetailTask = t;
    modalMode = 'remind';
    document.getElementById('detailTaskName').textContent = t.task_name || '';
    document.getElementById('inputRemind').value = t.remind_at ? toLocalDatetimeValue(t.remind_at) : '';
    document.getElementById('detailModal').style.display = 'flex';
}

function openPriorityModal(t) {
    currentPriorityTask = t;
    document.getElementById('priorityTaskTitle').textContent = t.task_name || '';
    document.getElementById('priorityModal').classList.add('visible');
}

// ===== アップグレードモーダル =====
function bindUpgradeModalUI() {
    document.getElementById('upgradeCloseBtn').onclick = hideUpgradeModal;
    document.getElementById('upgradeBackdrop').onclick = hideUpgradeModal;
    renderPlanOptions();
    updateCurrentPlanInfo();
    const viewBtn = document.getElementById('viewPlansBtn');
    if (viewBtn) {
        viewBtn.onclick = () => {
            if (typeof liff !== 'undefined' && liff.isInClient?.()) {
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
    container.innerHTML = planData.filter(p => p.plan_code !== 'free').map(p => {
        const isMax = p.plan_code === 'max';
        const features = [`TODO枠${p.task_limit}個`];
        if (p.can_status) features.push('ステータス');
        if (p.can_journal) features.push('ジャーナル');
        return `
            <div class="plan-info-card" style="padding:16px;border:2px solid ${isMax ? 'var(--accent)' : 'var(--border)'};border-radius:12px;background:${isMax ? 'linear-gradient(135deg,#fff9e6,#fff)' : 'white'};">
                <div style="font-weight:700;color:${isMax ? 'var(--accent)' : 'var(--primary)'};">${p.display_name} - ¥${p.price_jpy}/月${isMax ? ' ⭐' : ''}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${features.join(' + ')}</div>
            </div>
        `;
    }).join('');
}

function updateCurrentPlanInfo() {
    const el = document.getElementById('currentPlanInfo');
    if (!currentEntitlements || !el) return;
    const plan = planData?.find(p => p.plan_code === currentEntitlements.plan_code);
    el.innerHTML = `現在のプラン: <strong>${plan?.display_name || '無料プラン'}</strong>（TODO枠: ${currentEntitlements.task_limit}個）`;
}

function showUpgradeModal(featureName) {
    document.getElementById('upgradeMessage').textContent = `${featureName}は上位プランで利用できます。`;
    document.getElementById('upgradeModal').style.display = 'flex';
    renderPlanOptions();
    updateCurrentPlanInfo();
}

function hideUpgradeModal() {
    document.getElementById('upgradeModal').style.display = 'none';
}

// ===== タスク追加モーダル（Phase2） =====
let addTaskType = 'mission';

function showAddTaskModal() {
    addTaskType = 'mission';
    document.getElementById('addTaskModal').style.display = 'flex';
    document.getElementById('addTaskNameInput').value = '';
    document.getElementById('addTaskReasonInput').value = '';
    document.getElementById('addTaskDatetimeInput').value = '';
    updateAddTaskForm();
}

function hideAddTaskModal() {
    document.getElementById('addTaskModal').style.display = 'none';
}

function updateAddTaskForm() {
    document.querySelectorAll('.segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === addTaskType);
    });
    document.getElementById('missionFields').style.display = addTaskType === 'mission' ? 'block' : 'none';
    document.getElementById('appointmentFields').style.display = addTaskType === 'appointment' ? 'block' : 'none';
}

function bindAddTaskModalUI() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    document.getElementById('addTaskCloseBtn').onclick = hideAddTaskModal;
    document.getElementById('addTaskBackdrop').onclick = hideAddTaskModal;
    document.querySelectorAll('.segment-btn').forEach(btn => {
        btn.onclick = () => {
            addTaskType = btn.dataset.type;
            updateAddTaskForm();
        };
    });
    document.getElementById('addTaskSubmitBtn').onclick = async () => {
        const name = document.getElementById('addTaskNameInput').value.trim();
        if (!name) { alert('タスク名を入力してください'); return; }
        if (!checkTaskLimit()) {
            hideAddTaskModal();
            showUpgradeModal('TODO枠');
            return;
        }
        const extra = { task_name: name, task_type: addTaskType };
        if (addTaskType === 'mission') {
            const reason = document.getElementById('addTaskReasonInput').value.trim();
            if (reason) extra.reason = reason;
        } else {
            const datetime = document.getElementById('addTaskDatetimeInput').value;
            if (datetime) extra.remind_at = new Date(datetime).toISOString();
        }
        try {
            const data = await action('create', null, extra);
            renderList(data);
            hideAddTaskModal();
        } catch (e) {
            if (e.status === 403) showUpgradeModal('TODO枠');
            else alert('追加に失敗しました');
        }
    };
}

// ===== 習慣設定モーダル（Phase2） =====
let selectedHabitIds = new Set();

async function showHabitSettingsModal() {
    await loadHabitPresets();
    selectedHabitIds = new Set(userHabits.filter(h => h.is_active !== false).map(h => h.habit_id));
    renderHabitPresets();
    document.getElementById('habitSettingsModal').style.display = 'flex';
}

function renderHabitPresets() {
    const container = document.getElementById('habitPresetList');
    if (!container || !habitPresetsData) return;
    const byCategory = {};
    HABIT_CATEGORIES.forEach(cat => { byCategory[cat] = []; });
    habitPresetsData.forEach(p => { if (byCategory[p.category]) byCategory[p.category].push(p); });
    container.innerHTML = HABIT_CATEGORIES.map(cat => `
        <div class="preset-category">
            <div class="preset-category-title">${cat}</div>
            <div class="preset-grid">
                ${byCategory[cat].map(p => `
                    <div class="preset-item${selectedHabitIds.has(p.habit_id) ? ' selected' : ''}" data-id="${p.habit_id}" data-name="${p.habit_name}" data-cat="${p.category}" data-icon="${p.icon}">
                        ${p.icon} ${p.habit_name}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    container.querySelectorAll('.preset-item').forEach(item => {
        item.onclick = () => {
            const id = item.dataset.id;
            if (selectedHabitIds.has(id)) {
                selectedHabitIds.delete(id);
                item.classList.remove('selected');
            } else if (selectedHabitIds.size < 6) {
                selectedHabitIds.add(id);
                item.classList.add('selected');
            } else {
                alert('習慣は最大6個まで選べます');
            }
        };
    });
}

// ===== ユーティリティ =====
function formatRemindLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `🔔 ${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function toLocalDatetimeValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
