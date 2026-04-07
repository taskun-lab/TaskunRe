/* =============================================
   ムキムキタスくん - ジャーナル管理 v2
   ============================================= */

let currentEditJournal = null;  // null = 新規作成, object = 編集
let journalsData = [];
let journalsGrouped = [];
let currentTemplate = null;
let _journalYear = new Date().getFullYear();

/* ─────────────────────────────────────────────
   ユーティリティ
───────────────────────────────────────────── */
function _escJ(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        journalsData   = data.journals || [];
        journalsGrouped = data.grouped  || [];
    } catch (e) {
        journalsData   = [];
        journalsGrouped = [];
    }

    // 表示年を最新年に合わせる（初回のみ）
    if (journalsGrouped.length) {
        const years = [...new Set(journalsGrouped.map(g => g.year))].sort((a,b) => b - a);
        if (!years.includes(_journalYear)) _journalYear = years[0];
    }

    renderJournals();
    loadTemplateCarousel();
}

/* ─────────────────────────────────────────────
   年ナビゲーション
───────────────────────────────────────────── */
function _availableYears() {
    return [...new Set(journalsGrouped.map(g => g.year))].sort((a,b) => b - a);
}

function changeJournalYear(delta) {
    const years = _availableYears();
    if (!years.length) return;
    const idx = years.indexOf(_journalYear);
    const newIdx = Math.max(0, Math.min(years.length - 1, idx - delta)); // delta > 0 → 新しい年へ
    if (years[newIdx] !== _journalYear) {
        _journalYear = years[newIdx];
        renderJournals();
    }
}

function _updateYearNav() {
    const nav = document.getElementById('journalYearNav');
    if (!nav) return;
    const years = _availableYears();
    if (!years.length) { nav.style.display = 'none'; return; }

    nav.style.display = '';
    document.getElementById('journalYearLabel').textContent = String(_journalYear);

    const idx = years.indexOf(_journalYear);
    document.getElementById('journalYearPrev').style.opacity = idx < years.length - 1 ? '1' : '0.3';
    document.getElementById('journalYearNext').style.opacity = idx > 0              ? '1' : '0.3';
}

/* ─────────────────────────────────────────────
   カード一覧レンダリング（フラット + 月ラベル）
───────────────────────────────────────────── */
function renderJournals() {
    _updateYearNav();

    const container = document.getElementById('journalList');
    // 表示年でフィルタ
    const filtered = journalsGrouped.filter(g => g.year === _journalYear);

    if (!filtered.length) {
        const hasAny = journalsGrouped.length > 0;
        container.innerHTML = `
            <div class="empty-state" style="margin-top:24px;">
                ${hasAny ? `${_journalYear}年の記録はありません` : 'まだ記録がありません'}<br>
                <span style="font-size:13px;color:var(--text-muted);">右下の✏️から最初の記録を残しましょう</span>
            </div>`;
        return;
    }

    let html = '';
    for (const group of filtered) {
        html += `<div class="journal-month-label">${_escJ(group.label)}</div>`;
        for (const j of group.journals) {
            const dt  = j.created_at ? new Date(j.created_at) : new Date(j.date + 'T00:00:00');
            const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
            const day = dt.getDate();
            const time = j.created_at ? _timeStr(j.created_at) : '';
            // プレビュー：1行目（タイトル相当）を除いた本文を表示
            const bodyText = (j.content || '').trim();
            const preview  = bodyText.replace(/\n/g, ' ').substring(0, 100);

            html += `
                <div class="journal-card" data-id="${j.id}">
                    <div class="journal-card-date-col">
                        <span class="journal-card-dow">${dow}</span>
                        <span class="journal-card-day">${day}</span>
                        <span class="journal-card-time">${time}</span>
                    </div>
                    <div class="journal-card-body-col">
                        <div class="journal-card-title">${_escJ(j.title || '無題')}</div>
                        <div class="journal-card-preview">${_escJ(preview)}${bodyText.length > 100 ? '…' : ''}</div>
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
   テンプレートカルーセル（Phase 2 で API 化予定）
───────────────────────────────────────────── */
async function loadTemplateCarousel() {
    const carousel = document.getElementById('templateCarousel');
    if (!carousel) return;
    const templates = window._journalTemplates || [];
    renderTemplateCarousel(templates);
}

function renderTemplateCarousel(templates) {
    const carousel = document.getElementById('templateCarousel');
    if (!carousel) return;
    if (!templates.length) { carousel.innerHTML = ''; return; }

    carousel.innerHTML = templates.map(t => `
        <div class="template-card" data-template-id="${t.id}">
            <div class="template-card-title">${_escJ(t.title)}</div>
            <div class="template-card-content">${_escJ(t.content)}</div>
        </div>`).join('');

    carousel.querySelectorAll('.template-card').forEach(card => {
        card.onclick = () => {
            const tid = card.dataset.templateId;
            const t   = templates.find(x => String(x.id) === String(tid));
            if (t) openTemplateDetailModal(t);
        };
    });
}

/* ─────────────────────────────────────────────
   テンプレート詳細モーダル
───────────────────────────────────────────── */
function openTemplateDetailModal(template) {
    currentTemplate = template;
    document.getElementById('templateModalTitle').textContent       = template.title       || '';
    document.getElementById('templateModalContent').textContent     = template.content     || '';
    document.getElementById('templateModalDescription').textContent = template.description || '';
    document.getElementById('templateDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   ジャーナル詳細モーダル（閲覧モード）
───────────────────────────────────────────── */
function openJournalDetailModal(journal) {
    currentEditJournal = journal;

    const dt   = journal.created_at ? new Date(journal.created_at) : new Date(journal.date + 'T00:00:00');
    const dow  = ['日','月','火','水','木','金','土'][dt.getDay()];
    const y    = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    const time = journal.created_at ? ` ${_timeStr(journal.created_at)}` : '';

    document.getElementById('journalModalDate').textContent    = `${y}年${m}月${d}日（${dow}）${time}`;
    document.getElementById('journalModalTitle').textContent   = journal.title   || '';
    document.getElementById('journalModalContent').textContent = journal.content || '';

    // タイトルがない場合は title 行を非表示
    const titleEl = document.getElementById('journalModalTitle');
    titleEl.style.display = (journal.title && journal.title.trim()) ? '' : 'none';

    document.getElementById('journalViewContent').style.display  = '';
    document.getElementById('journalEditContent').style.display  = 'none';
    document.getElementById('journalDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   新規作成エディタを開く（FAB / テンプレ使用）
───────────────────────────────────────────── */
function openNewJournalEditor(opts = {}) {
    currentEditJournal = null;

    const now = new Date();
    const dow = ['日','月','火','水','木','金','土'][now.getDay()];
    document.getElementById('journalEditDate').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${dow}）`;

    // シングルテキストエリアに prefill
    document.getElementById('editJournalText').value = opts.prefillContent || '';

    document.getElementById('journalViewContent').style.display = 'none';
    document.getElementById('journalEditContent').style.display = '';
    document.getElementById('journalDetailModal').classList.add('visible');

    setTimeout(() => document.getElementById('editJournalText').focus(), 120);
}

/* ─────────────────────────────────────────────
   テキストを タイトル / 本文 に分割
   （1行目 = タイトル、2行目以降 = 本文）
───────────────────────────────────────────── */
function _splitTitleBody(text) {
    const nlIdx = text.indexOf('\n');
    if (nlIdx < 0) return { title: text.trim(), content: '' };
    return {
        title:   text.substring(0, nlIdx).trim(),
        content: text.substring(nlIdx + 1).trim(),
    };
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
        const dt  = currentEditJournal.created_at
            ? new Date(currentEditJournal.created_at)
            : new Date(currentEditJournal.date + 'T00:00:00');
        const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
        document.getElementById('journalEditDate').textContent =
            `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dow}）`;

        // タイトルと本文を1つのテキストエリアに結合
        const title   = currentEditJournal.title   || '';
        const content = currentEditJournal.content || '';
        document.getElementById('editJournalText').value =
            title && content ? `${title}\n${content}` : (title || content);

        document.getElementById('journalViewContent').style.display = 'none';
        document.getElementById('journalEditContent').style.display = '';
        setTimeout(() => document.getElementById('editJournalText').focus(), 80);
    };

    // ── 編集モード ──
    document.getElementById('journalCancelEditBtn').onclick = () => {
        if (currentEditJournal) {
            document.getElementById('journalViewContent').style.display = '';
            document.getElementById('journalEditContent').style.display = 'none';
        } else {
            closeModal();
        }
    };

    document.getElementById('journalSaveEditBtn').onclick = async () => {
        const rawText = document.getElementById('editJournalText').value.trim();
        if (!rawText) {
            alert('内容を入力してください');
            return;
        }
        const { title, content } = _splitTitleBody(rawText);

        try {
            if (currentEditJournal) {
                // ── 更新 ──
                await apiCall('/journals/update', 'POST', {
                    id: currentEditJournal.id,
                    user_id: userId,
                    title,
                    content,
                });
                currentEditJournal.title   = title;
                currentEditJournal.content = content;

                document.getElementById('journalModalTitle').textContent   = title   || '';
                document.getElementById('journalModalContent').textContent = content || '';
                document.getElementById('journalModalTitle').style.display = title ? '' : 'none';

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
                    title,
                    content,
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

    // ── 年ナビゲーション ──
    document.getElementById('journalYearPrev').onclick = () => changeJournalYear(-1); // 前の年
    document.getElementById('journalYearNext').onclick = () => changeJournalYear(1);  // 次の年

    // 横スワイプで年切替（ジャーナルリスト上）
    const listArea = document.getElementById('tab-journal');
    if (listArea) {
        let _swipeStartX = 0, _swipeStartY = 0;
        listArea.addEventListener('touchstart', e => {
            _swipeStartX = e.touches[0].clientX;
            _swipeStartY = e.touches[0].clientY;
        }, { passive: true });
        listArea.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - _swipeStartX;
            const dy = e.changedTouches[0].clientY - _swipeStartY;
            // 横スワイプ判定（縦方向より横方向が大きい場合のみ）
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                changeJournalYear(dx < 0 ? 1 : -1); // 左スワイプ=次の年、右=前の年
            }
        }, { passive: true });
    }

    // ── テンプレート詳細モーダル ──
    const tModal   = document.getElementById('templateDetailModal');
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
