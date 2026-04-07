/* =============================================
   ムキムキタスくん - ジャーナル管理 v2
   ============================================= */

let currentEditJournal = null;  // null = 新規作成モード, object = 編集モード
let journalsData = [];
let journalsGrouped = [];
let currentTemplate = null;

/* ─────────────────────────────────────────────
   ユーティリティ
───────────────────────────────────────────── */
function _escJournal(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _dateLabel(isoOrDate) {
    const dt = new Date(isoOrDate);
    if (isNaN(dt)) return '';
    const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
    const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    return `${y}年${m}月${d}日（${dow}）`;
}

function _timeStr(isoStr) {
    if (!isoStr) return '';
    const dt = new Date(isoStr);
    if (isNaN(dt)) return '';
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────────
   データ取得
───────────────────────────────────────────── */
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
    loadTemplateCarousel();
}

/* ─────────────────────────────────────────────
   カード一覧レンダリング（フラット + 月ラベル）
───────────────────────────────────────────── */
function renderJournals() {
    const container = document.getElementById('journalList');
    if (!journalsGrouped.length) {
        container.innerHTML = `
            <div class="empty-state" style="margin-top:24px;">
                まだ記録がありません<br>
                <span style="font-size:13px;color:var(--text-muted);">右下の✏️から最初の記録を残しましょう</span>
            </div>`;
        return;
    }

    let html = '';
    for (const group of journalsGrouped) {
        html += `<div class="journal-month-label">${_escJournal(group.label)}</div>`;
        for (const j of group.journals) {
            // created_at があればそこから時刻・曜日を取得、なければ date を使う
            const dt = j.created_at ? new Date(j.created_at) : new Date(j.date + 'T00:00:00');
            const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
            const day = dt.getDate();
            const time = j.created_at ? _timeStr(j.created_at) : '';
            const preview = (j.content || '').replace(/\n/g, ' ').substring(0, 50);

            html += `
                <div class="journal-card" data-id="${j.id}">
                    <div class="journal-card-date-col">
                        <span class="journal-card-dow">${dow}</span>
                        <span class="journal-card-day">${day}</span>
                        <span class="journal-card-time">${time}</span>
                    </div>
                    <div class="journal-card-body-col">
                        <div class="journal-card-title">${_escJournal(j.title || '無題')}</div>
                        <div class="journal-card-preview">${_escJournal(preview)}${preview.length >= 50 ? '…' : ''}</div>
                    </div>
                </div>`;
        }
    }
    container.innerHTML = html;

    container.querySelectorAll('.journal-card').forEach(card => {
        card.onclick = () => {
            const id = String(card.dataset.id);
            let j = journalsData.find(x => String(x.id) === id);
            if (!j) {
                for (const g of journalsGrouped) {
                    j = g.journals.find(x => String(x.id) === id);
                    if (j) break;
                }
            }
            if (j) openJournalDetailModal(j);
        };
    });
}

/* ─────────────────────────────────────────────
   テンプレートカルーセル（Phase 2 で API 化、今は静的）
───────────────────────────────────────────── */
async function loadTemplateCarousel() {
    const carousel = document.getElementById('templateCarousel');
    if (!carousel) return;

    // Phase 2: APIから取得
    // const data = await apiCall('/journal-templates').catch(() => []);
    // const templates = Array.isArray(data) ? data : (data.templates || []);

    // Phase 1: 静的データ（DB準備後にAPIに差し替え）
    const templates = window._journalTemplates || [];
    renderTemplateCarousel(templates);
}

function renderTemplateCarousel(templates) {
    const carousel = document.getElementById('templateCarousel');
    if (!carousel) return;
    if (!templates.length) { carousel.innerHTML = ''; return; }

    carousel.innerHTML = templates.map(t => `
        <div class="template-card" data-template-id="${t.id}">
            <div class="template-card-title">${_escJournal(t.title)}</div>
            <div class="template-card-content">${_escJournal(t.content)}</div>
        </div>`).join('');

    carousel.querySelectorAll('.template-card').forEach(card => {
        card.onclick = () => {
            const tid = card.dataset.templateId;
            const t = templates.find(x => String(x.id) === String(tid));
            if (t) openTemplateDetailModal(t);
        };
    });
}

/* ─────────────────────────────────────────────
   テンプレート詳細モーダル
───────────────────────────────────────────── */
function openTemplateDetailModal(template) {
    currentTemplate = template;
    document.getElementById('templateModalTitle').textContent = template.title || '';
    document.getElementById('templateModalContent').textContent = template.content || '';
    document.getElementById('templateModalDescription').textContent = template.description || '';
    document.getElementById('templateDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   ジャーナル詳細モーダル（閲覧モード）
───────────────────────────────────────────── */
function openJournalDetailModal(journal) {
    currentEditJournal = journal;

    const dt = journal.created_at ? new Date(journal.created_at) : new Date(journal.date + 'T00:00:00');
    const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
    const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    const time = journal.created_at ? ` ${_timeStr(journal.created_at)}` : '';
    document.getElementById('journalModalDate').textContent = `${y}年${m}月${d}日（${dow}）${time}`;
    document.getElementById('journalModalTitle').textContent = journal.title || '無題';
    document.getElementById('journalModalContent').textContent = journal.content || '';

    document.getElementById('journalViewContent').style.display = '';
    document.getElementById('journalEditContent').style.display = 'none';
    document.getElementById('journalDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   新規作成エディタを開く（FAB / テンプレ使用）
───────────────────────────────────────────── */
function openNewJournalEditor(opts = {}) {
    currentEditJournal = null; // 新規作成モード

    const now = new Date();
    const dow = ['日','月','火','水','木','金','土'][now.getDay()];
    document.getElementById('journalEditDate').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${dow}）`;

    document.getElementById('editJournalTitle').value = opts.title || '';
    document.getElementById('editJournalContent').value = opts.prefillContent || '';

    document.getElementById('journalViewContent').style.display = 'none';
    document.getElementById('journalEditContent').style.display = '';
    document.getElementById('journalDetailModal').classList.add('visible');

    setTimeout(() => document.getElementById('editJournalTitle').focus(), 120);
}

/* ─────────────────────────────────────────────
   モーダル UI バインド
───────────────────────────────────────────── */
function bindJournalDetailModalUI() {
    const modal = document.getElementById('journalDetailModal');
    const closeModal = () => {
        modal.classList.remove('visible');
        currentEditJournal = null;
    };

    // ── 閲覧モード ──
    document.getElementById('closeJournalDetail').onclick = closeModal;

    document.getElementById('journalDeleteBtn').onclick = async () => {
        if (!currentEditJournal) return;
        if (!confirm('このジャーナルを削除しますか？この操作は取り消せません。')) return;
        await deleteJournal(currentEditJournal.id);
        closeModal();
    };

    document.getElementById('journalEditBtn').onclick = () => {
        if (!currentEditJournal) return;
        const dt = currentEditJournal.created_at
            ? new Date(currentEditJournal.created_at)
            : new Date(currentEditJournal.date + 'T00:00:00');
        const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
        document.getElementById('journalEditDate').textContent =
            `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dow}）`;
        document.getElementById('editJournalTitle').value = currentEditJournal.title || '';
        document.getElementById('editJournalContent').value = currentEditJournal.content || '';

        document.getElementById('journalViewContent').style.display = 'none';
        document.getElementById('journalEditContent').style.display = '';
        setTimeout(() => document.getElementById('editJournalTitle').focus(), 80);
    };

    // ── 編集モード ──
    document.getElementById('journalCancelEditBtn').onclick = () => {
        if (currentEditJournal) {
            // 既存編集 → 閲覧モードへ戻る
            document.getElementById('journalViewContent').style.display = '';
            document.getElementById('journalEditContent').style.display = 'none';
        } else {
            // 新規作成 → モーダルを閉じる
            closeModal();
        }
    };

    document.getElementById('journalSaveEditBtn').onclick = async () => {
        const newTitle   = document.getElementById('editJournalTitle').value.trim();
        const newContent = document.getElementById('editJournalContent').value.trim();
        if (!newTitle && !newContent) {
            alert('タイトルまたは内容を入力してください');
            return;
        }

        try {
            if (currentEditJournal) {
                // ── 更新 ──
                await apiCall('/journals/update', 'POST', {
                    id: currentEditJournal.id,
                    user_id: userId,
                    title: newTitle,
                    content: newContent,
                });
                currentEditJournal.title   = newTitle;
                currentEditJournal.content = newContent;
                document.getElementById('journalModalTitle').textContent   = newTitle || '無題';
                document.getElementById('journalModalContent').textContent = newContent || '';
                document.getElementById('journalViewContent').style.display = '';
                document.getElementById('journalEditContent').style.display = 'none';
                await loadJournals();
            } else {
                // ── 新規保存 ──
                const now  = new Date();
                const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                const todayCompleted = window._completedTasksForJournal || [];
                await apiCall('/journals/save', 'POST', {
                    user_id: userId,
                    date,
                    title: newTitle,
                    content: newContent,
                    tasks_completed_count: todayCompleted.length,
                    completed_tasks: todayCompleted.map(t => t.task_name || t.title || '').filter(Boolean),
                });
                closeModal();
                await loadJournals();
            }
        } catch (e) {
            alert('保存に失敗しました');
        }
    };

    // ── FAB ──
    const fab = document.getElementById('journalFab');
    if (fab) fab.onclick = () => openNewJournalEditor();

    // ── テンプレート詳細モーダル ──
    const tModal = document.getElementById('templateDetailModal');
    const closeTModal = () => tModal.classList.remove('visible');
    document.getElementById('templateDetailBackdrop').onclick = closeTModal;
    document.getElementById('closeTemplateDetail').onclick    = closeTModal;

    document.getElementById('useTemplateBtn').onclick = () => {
        const prefill = currentTemplate ? (currentTemplate.content || '') : '';
        closeTModal();
        openNewJournalEditor({ prefillContent: prefill });
    };
}

/* ─────────────────────────────────────────────
   ジャーナル削除
───────────────────────────────────────────── */
async function deleteJournal(journalId) {
    try {
        await apiCall('/journals/delete', 'POST', { id: journalId, user_id: userId });
        await loadJournals();
    } catch (e) {
        alert('削除に失敗しました');
    }
}
