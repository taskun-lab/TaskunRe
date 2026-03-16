/* =============================================
   ムキムキタスくん３ - ジャーナル
   ============================================= */

let journalsData = [];
let journalsGrouped = [];
let currentEditJournal = null;
let openMonthKey = null;

async function loadJournals() {
    try {
        const data = await apiCall(`/journals?user_id=${encodeURIComponent(userId)}`);
        journalsData = data.journals || [];
        journalsGrouped = data.grouped || [];
        renderJournals();
    } catch (e) {
        console.error('loadJournals error:', e);
    }
}

function renderJournals() {
    const listEl = document.getElementById('journalList');
    if (!listEl) return;
    if (journalsGrouped.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px;">まだ記録がありません</div>';
        return;
    }
    listEl.innerHTML = journalsGrouped.map(group => {
        const isOpen = openMonthKey === group.label;
        return `
            <div class="journal-month-group">
                <div class="journal-month-header" data-month="${group.label}">
                    <span>${group.label}（${group.journals.length}件）</span>
                    <span>${isOpen ? '▲' : '▼'}</span>
                </div>
                <div class="journal-month-body" style="${isOpen ? '' : 'display:none;'}">
                    ${group.journals.map(j => `
                        <div class="journal-item" data-id="${j.id}">
                            <div class="journal-item-date">${j.date}</div>
                            <div class="journal-item-title">${escapeHtml(j.title || '（無題）')}</div>
                            <div class="journal-item-preview">${escapeHtml((j.content || '').slice(0, 60))}${(j.content || '').length > 60 ? '…' : ''}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.journal-month-header').forEach(header => {
        header.onclick = () => {
            const key = header.dataset.month;
            openMonthKey = openMonthKey === key ? null : key;
            renderJournals();
        };
    });
    listEl.querySelectorAll('.journal-item').forEach(item => {
        item.onclick = () => {
            const j = journalsData.find(j => j.id === item.dataset.id);
            if (j) openJournalDetailModal(j);
        };
    });
}

function openJournalDetailModal(j) {
    currentEditJournal = j;
    document.getElementById('journalModalDate').textContent = j.date;
    document.getElementById('journalModalTitle').textContent = j.title || '（無題）';
    document.getElementById('journalModalContent').textContent = j.content || '';
    document.getElementById('journalDetailModal').style.display = 'flex';
}

function bindJournalDetailModalUI() {
    const modal = document.getElementById('journalDetailModal');
    if (!modal) return;
    document.getElementById('closeJournalDetail').onclick = () => modal.style.display = 'none';
    document.getElementById('journalDetailBackdrop').onclick = () => modal.style.display = 'none';
    document.getElementById('journalEditBtn').onclick = () => {
        if (!currentEditJournal) return;
        document.getElementById('journalTitle').value = currentEditJournal.title || '';
        document.getElementById('journalContent').value = currentEditJournal.content || '';
        document.getElementById('journalDate').value = currentEditJournal.date;
        modal.style.display = 'none';
        switchTab('journal');
        document.getElementById('journalSubmitBtn').dataset.editId = currentEditJournal.id;
        document.getElementById('journalSubmitBtn').textContent = '💾 更新する';
    };
    document.getElementById('journalDeleteBtn').onclick = async () => {
        if (!currentEditJournal) return;
        if (!confirm('このジャーナルを削除しますか？')) return;
        await deleteJournal(currentEditJournal.id);
        modal.style.display = 'none';
    };
}

async function saveJournal() {
    const date = document.getElementById('journalDate').value;
    const title = document.getElementById('journalTitle').value;
    const content = document.getElementById('journalContent').value;
    if (!content.trim()) { alert('内容を入力してください'); return; }

    const submitBtn = document.getElementById('journalSubmitBtn');
    const editId = submitBtn.dataset.editId;

    try {
        if (editId) {
            await apiCall('/journals/update', 'POST', { id: editId, user_id: userId, title, content });
            delete submitBtn.dataset.editId;
            submitBtn.textContent = '💪 記録を保存';
        } else {
            await apiCall('/journals/save', 'POST', { user_id: userId, date: date || new Date().toISOString().split('T')[0], title, content });
        }
        document.getElementById('journalDate').value = '';
        document.getElementById('journalTitle').value = '';
        document.getElementById('journalContent').value = '';
        await loadJournals();
    } catch (e) {
        console.error('saveJournal error:', e);
        alert('保存に失敗しました');
    }
}

async function deleteJournal(id) {
    try {
        await apiCall('/journals/delete', 'POST', { id, user_id: userId });
        await loadJournals();
    } catch (e) {
        console.error('deleteJournal error:', e);
        alert('削除に失敗しました');
    }
}
