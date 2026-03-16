/* =============================================
   ムキムキタスくん３ - 習慣管理（Phase2: プリセットバンク対応）
   ============================================= */

let userHabits = [];      // ユーザーが選択中の習慣
let todayHabits = {};     // 今日の達成状況 { habit_id: boolean }
let weekHabitsData = {};  // 週間データ
let habitPresetsData = []; // プリセット一覧
let monthlyChart = null;

async function loadHabits() {
    try {
        const data = await apiCall(`/habits?user_id=${encodeURIComponent(userId)}`);
        userHabits = data.habits || [];
        todayHabits = {};
        userHabits.forEach(h => { todayHabits[h.habit_id] = h.completed; });
        weekHabitsData = data.week || {};
        renderHabitList();
        renderStreakBadges();
        renderWeekView();
        checkStreakWarning();
    } catch (e) {
        console.error('loadHabits error:', e);
    }
}

function renderHabitList() {
    const el = document.getElementById('habitList');
    if (!el) return;
    el.innerHTML = userHabits.map(h => `
        <label class="habit-item" data-id="${h.habit_id}">
            <input type="checkbox" ${todayHabits[h.habit_id] ? 'checked' : ''} data-habit="${h.habit_id}">
            <span class="habit-icon">${h.icon || '✅'}</span>
            <span class="habit-name">${h.habit_name}</span>
            <span class="habit-category">${h.category}</span>
        </label>
    `).join('');
    el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.onchange = () => {
            todayHabits[cb.dataset.habit] = cb.checked;
        };
    });
}

// ストリークバッジ表示（Phase1）
function renderStreakBadges() {
    const el = document.getElementById('streakBadges');
    if (!el) return;
    const withStreak = userHabits.filter(h => h.streak > 0);
    if (withStreak.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">習慣を続けるとここに連続日数が表示されます</div>';
        return;
    }
    el.innerHTML = withStreak
        .sort((a, b) => b.streak - a.streak)
        .map(h => `
            <div class="streak-badge${!todayHabits[h.habit_id] ? ' streak-warning' : ''}">
                <span>${h.icon || '🔥'}</span>
                <span>${h.habit_name}</span>
                <span class="streak-count">${h.streak}日連続</span>
            </div>
        `).join('');
}

// 23時以降に未完了習慣がある場合の警告（Phase1）
function checkStreakWarning() {
    const hour = new Date().getHours();
    if (hour < 23) return;
    const incomplete = userHabits.filter(h => !todayHabits[h.habit_id] && h.streak > 0);
    if (incomplete.length === 0) return;
    const names = incomplete.map(h => h.habit_name).join('・');
    showInAppBanner(`🔥 ${names} のストリークが今日で途切れます`, 'warning');
}

function showInAppBanner(message, type = 'info') {
    const existing = document.getElementById('inAppBanner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'inAppBanner';
    banner.className = `in-app-banner in-app-banner-${type}`;
    banner.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">×</button>`;
    document.body.prepend(banner);
    setTimeout(() => banner.remove(), 8000);
}

function renderWeekView() {
    const el = document.getElementById('weekTable');
    if (!el || !weekHabitsData) return;
    const days = ['月', '火', '水', '木', '金', '土', '日'];
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    el.innerHTML = `
        <table class="week-table">
            <thead><tr><th>習慣</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>
            <tbody>
                ${userHabits.map(h => `
                    <tr>
                        <td>${h.icon || ''} ${h.habit_name}</td>
                        ${keys.map(k => {
                            const completed = weekHabitsData[k]?.[h.habit_id];
                            return `<td>${completed ? '✅' : '<span style="color:#ddd">○</span>'}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function saveHabits() {
    try {
        const data = await apiCall('/habits/save', 'POST', {
            user_id: userId,
            date: new Date().toISOString().split('T')[0],
            habits: todayHabits,
        });
        userHabits = data.habits || userHabits;
        userHabits.forEach(h => { todayHabits[h.habit_id] = h.completed; });
        renderHabitList();
        renderStreakBadges();
        renderWeekView();
        showInAppBanner('💪 習慣を記録しました！');
    } catch (e) {
        console.error('saveHabits error:', e);
        alert('保存に失敗しました');
    }
}

async function loadMonthlyData(year, month) {
    try {
        return await apiCall(`/habits/monthly?user_id=${encodeURIComponent(userId)}&year=${year}&month=${month}`);
    } catch (e) {
        console.error('loadMonthlyData error:', e);
        return null;
    }
}

// 習慣設定（Phase2）
async function loadHabitPresets() {
    try {
        const data = await apiCall('/habits/presets');
        habitPresetsData = data.presets || [];
    } catch (e) {
        console.error('loadHabitPresets error:', e);
    }
}

async function saveHabitSettings(selectedHabits) {
    try {
        await apiCall('/habits/settings', 'POST', { user_id: userId, habits: selectedHabits });
        await loadHabits();
        showInAppBanner('習慣設定を更新しました');
    } catch (e) {
        console.error('saveHabitSettings error:', e);
        alert('設定の保存に失敗しました');
    }
}
