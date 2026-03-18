/* =============================================
   ムキムキタスくん - ジャーナル管理
   ============================================= */

let currentEditJournal = null;
let journalsData = [];
let journalsGrouped = [];
let openMonthKey = null;

/**
 * ジャーナルデータ読み込み
 */
async function loadJournals() {
    try {
        const data = await apiCall(`/journals?user_id=${encodeURIComponent(userId)}`);
        journalsData = data.journals || [];
        journalsGrouped = data.grouped || [];
    } catch (e) {
        journalsData = [];
        journalsGrouped = [];
    }
    renderJournals();
}

/**
 * ジャーナルリストレンダリング
 */
function renderJournals() {
    const container = document.getElementById('journalList');
    if (!journalsGrouped.length) {
        container.innerHTML = '<div class="empty-state">まだ記録がありません</div>';
        return;
    }

    // 今月のキー
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!openMonthKey) openMonthKey = currentMonthKey;

    container.innerHTML = journalsGrouped.map(group => {
        const key = `${group.year}-${String(group.month).padStart(2, '0')}`;
        const isOpen = key === openMonthKey;
        return `
            <div class="journal-month-group" data-month-key="${key}">
                <div class="journal-month-header ${isOpen ? 'active' : ''}">
                    <div class="journal-month-title">📅 ${group.label}</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="journal-month-count">${group.journals.length}件</div>
                        <span class="journal-month-arrow">▼</span>
                    </div>
                </div>
                <div class="journal-month-content ${isOpen ? 'active' : ''}">
                    <div class="journal-month-content-inner">
                        ${group.journals.map(j => `
                            <div class="journal-card" data-id="${j.id}">
                                <div class="journal-card-header">
                                    <div class="journal-date">📅 ${formatDate(j.date)}</div>
                                    <div class="journal-tasks-count">✓ ${j.tasks_completed_count || 0}タスク達成</div>
                                </div>
                                <div class="journal-title-text">${j.title || '無題'}</div>
                                <div class="journal-preview">${(j.content || '').substring(0, 50)}...</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 月別アコーディオン
    container.querySelectorAll('.journal-month-header').forEach(header => {
        header.onclick = () => {
            const group = header.closest('.journal-month-group');
            const key = group.dataset.monthKey;

            // 他を閉じる
            container.querySelectorAll('.journal-month-group').forEach(g => {
                if (g !== group) {
                    g.querySelector('.journal-month-header').classList.remove('active');
                    g.querySelector('.journal-month-content').classList.remove('active');
                }
            });

            const isNowOpen = header.classList.contains('active');
            header.classList.toggle('active', !isNowOpen);
            group.querySelector('.journal-month-content').classList.toggle('active', !isNowOpen);
            openMonthKey = isNowOpen ? null : key;
        };
    });

    // カードクリック
    container.querySelectorAll('.journal-card').forEach(card => {
        card.onclick = (e) => {
            e.stopPropagation();
            const cardId = String(card.dataset.id);
            let j = journalsData.find(x => String(x.id) === cardId);
            if (!j) {
                for (const group of journalsGrouped) {
                    j = group.journals.find(x => String(x.id) === cardId);
                    if (j) break;
                }
            }
            if (j) openJournalDetailModal(j);
        };
    });
}

/**
 * ジャーナル詳細モーダルを開く
 */
function openJournalDetailModal(journal) {
    currentEditJournal = journal;
    document.getElementById('journalViewContent').classList.remove('hidden');
    document.getElementById('journalEditContent').classList.remove('active');

    const d = new Date(journal.date);
    document.getElementById('journalModalDate').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    document.getElementById('journalModalTitle').textContent = journal.title || '無題';
    document.getElementById('journalModalContent').textContent = journal.content || '内容なし';

    const tasks = journal.completed_tasks || [];
    document.getElementById('journalModalTasks').innerHTML = tasks.length
        ? tasks.map(t => `<span class="journal-task-chip">${t}</span>`).join('')
        : '<span style="color:var(--text-muted);font-size:12px;">達成タスクなし</span>';

    document.getElementById('journalDetailModal').classList.add('visible');
}

/**
 * ジャーナル詳細モーダルUI初期化
 */
function bindJournalDetailModalUI() {
    const modal = document.getElementById('journalDetailModal');
    const close = () => { modal.classList.remove('visible'); currentEditJournal = null; };

    document.getElementById('journalDetailBackdrop').onclick = close;
    document.getElementById('closeJournalDetail').onclick = close;
    document.getElementById('journalCloseBtn').onclick = close;
    document.getElementById('closeJournalEdit').onclick = close;

    // 削除
    document.getElementById('journalDeleteBtn').onclick = async () => {
        if (!currentEditJournal) return;
        if (!confirm('このジャーナルを削除しますか？この操作は取り消せません。')) return;
        await deleteJournal(currentEditJournal.id);
        close();
    };

    // 編集モード
    document.getElementById('journalEditBtn').onclick = () => {
        if (!currentEditJournal) return;
        document.getElementById('journalViewContent').classList.add('hidden');
        document.getElementById('journalEditContent').classList.add('active');
        document.getElementById('editJournalTitle').value = currentEditJournal.title || '';
        document.getElementById('editJournalContent').value = currentEditJournal.content || '';
    };

    // 編集キャンセル
    document.getElementById('journalCancelEditBtn').onclick = () => {
        document.getElementById('journalViewContent').classList.remove('hidden');
        document.getElementById('journalEditContent').classList.remove('active');
    };

    // 編集保存
    document.getElementById('journalSaveEditBtn').onclick = async () => {
        if (!currentEditJournal) return;
        const newTitle = document.getElementById('editJournalTitle').value.trim();
        const newContent = document.getElementById('editJournalContent').value.trim();

        try {
            await apiCall('/journals/update', 'POST', {
                id: currentEditJournal.id,
                user_id: userId,
                title: newTitle,
                content: newContent
            });
            currentEditJournal.title = newTitle;
            currentEditJournal.content = newContent;
            document.getElementById('journalModalTitle').textContent = newTitle || '無題';
            document.getElementById('journalModalContent').textContent = newContent || '内容なし';
            document.getElementById('journalViewContent').classList.remove('hidden');
            document.getElementById('journalEditContent').classList.remove('active');
            await loadJournals();
            alert('💪 更新しました！');
        } catch (e) {
            alert('更新に失敗しました');
        }
    };
}

/**
 * ジャーナル保存
 */
async function saveJournal() {
    const date = document.getElementById('journalDate').value;
    const title = document.getElementById('journalTitle').value.trim();
    const content = document.getElementById('journalContent').value.trim();

    if (!title && !content) {
        alert('タイトルまたは内容を入力してください');
        return;
    }

    try {
        const todayCompleted = (window._completedTasksForJournal || []);
        await apiCall('/journals/save', 'POST', {
            user_id: userId,
            date: date,
            title: title,
            content: content,
            tasks_completed_count: todayCompleted.length,
            completed_tasks: todayCompleted.map(t => t.task_name || t.title || '').filter(Boolean)
        });
        document.getElementById('journalTitle').value = '';
        document.getElementById('journalContent').value = '';
        await loadJournals();
        alert('💪 保存しました！');
    } catch (e) {
        alert('保存に失敗しました');
    }
}

/**
 * ジャーナル削除
 */
async function deleteJournal(journalId) {
    try {
        await apiCall('/journals/delete', 'POST', {
            id: journalId,
            user_id: userId
        });
        await loadJournals();
        alert('🗑️ ジャーナルを削除しました');
    } catch (e) {
        alert('削除に失敗しました');
    }
}
