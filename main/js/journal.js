/* =============================================
   ムキムキタスくん - ジャーナル管理 v2
   ============================================= */

let currentEditJournal = null;
let journalsData = [];
let journalsGrouped = [];
let currentTemplate = null;
let _journalYear = new Date().getFullYear();
let _templateCache = [];   // カルーセル用キャッシュ

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
    // 管理ボタン表示：data ロード後に確実に反映
    _updateManageBtn();

    try {
        const data = await apiCall(`/journals?user_id=${encodeURIComponent(userId)}`);
        journalsData    = data.journals || [];
        journalsGrouped = data.grouped  || [];
    } catch (e) {
        journalsData    = [];
        journalsGrouped = [];
    }
    if (journalsGrouped.length) {
        const years = [...new Set(journalsGrouped.map(g => g.year))].sort((a,b) => b - a);
        if (!years.includes(_journalYear)) _journalYear = years[0];
    }
    renderJournals();
    loadTemplateCarousel();
}

function _updateManageBtn() {
    const btn = document.getElementById('journalTemplateManageBtn');
    if (!btn) return;
    const isDev = currentEntitlements?.role === 'developer' || currentEntitlements?.role === 'admin';
    btn.style.display = isDev ? 'flex' : 'none';
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
    const idx    = years.indexOf(_journalYear);
    const newIdx = Math.max(0, Math.min(years.length - 1, idx - delta));
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
    document.getElementById('journalYearNext').style.opacity = idx > 0               ? '1' : '0.3';
}

/* ─────────────────────────────────────────────
   カード一覧
───────────────────────────────────────────── */
function renderJournals() {
    _updateYearNav();
    const container = document.getElementById('journalList');
    const filtered  = journalsGrouped.filter(g => g.year === _journalYear);

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
            const dt   = j.created_at ? new Date(j.created_at) : new Date(j.date + 'T00:00:00');
            const dow  = ['日','月','火','水','木','金','土'][dt.getDay()];
            const day  = dt.getDate();
            const time = j.created_at ? _timeStr(j.created_at) : '';
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
            let j    = journalsData.find(x => String(x.id) === id);
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
   テンプレートカルーセル（API から取得）
───────────────────────────────────────────── */
async function loadTemplateCarousel() {
    const carousel = document.getElementById('templateCarousel');
    if (!carousel) return;
    try {
        const data = await apiCall('/journal-templates');
        _templateCache = Array.isArray(data) ? data : [];
    } catch (e) {
        _templateCache = [];
    }
    renderTemplateCarousel(_templateCache);
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
            const t   = _templateCache.find(x => String(x.id) === String(tid));
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
   テンプレート管理モーダル（developer/admin のみ）
───────────────────────────────────────────── */
function openTemplateManageModal() {
    document.getElementById('tmplListView').style.display = '';
    document.getElementById('tmplFormView').style.display = 'none';
    renderTmplList();
    document.getElementById('templateManageModal').classList.add('visible');
}

function renderTmplList() {
    const c = document.getElementById('tmplListContainer');
    if (!_templateCache.length) {
        c.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:12px 0;">テンプレートがありません</p>';
        return;
    }
    c.innerHTML = _templateCache.map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid rgba(13,27,42,0.06);">
            <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escJ(t.title)}</div>
                <div style="font-size:12px;color:var(--text-muted);">並び順 ${t.sort_order ?? 0}</div>
            </div>
            <button class="tmpl-edit-btn" data-id="${t.id}" style="background:none;border:1px solid rgba(13,27,42,0.12);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text-secondary);">編集</button>
            <button class="tmpl-del-btn"  data-id="${t.id}" style="background:none;border:1px solid rgba(255,107,107,0.3);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--power-red);">削除</button>
        </div>`).join('');

    c.querySelectorAll('.tmpl-edit-btn').forEach(btn => {
        btn.onclick = () => {
            const t = _templateCache.find(x => String(x.id) === String(btn.dataset.id));
            if (t) openTmplForm(t);
        };
    });
    c.querySelectorAll('.tmpl-del-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('このテンプレートを削除しますか？')) return;
            try {
                await apiCall('/journal-templates/delete', 'POST', { user_id: userId, id: btn.dataset.id });
                await loadTemplateCarousel();
                renderTmplList();
            } catch (e) { alert('削除に失敗しました'); }
        };
    });
}

function openTmplForm(template = null) {
    document.getElementById('tmplFormTitle').textContent    = template ? 'テンプレートを編集' : 'テンプレートを追加';
    document.getElementById('tmplInputTitle').value         = template?.title       || '';
    document.getElementById('tmplInputContent').value       = template?.content     || '';
    document.getElementById('tmplInputDescription').value   = template?.description || '';
    document.getElementById('tmplInputOrder').value         = template?.sort_order  ?? '';
    document.getElementById('tmplInputId').value            = template?.id          || '';
    document.getElementById('tmplListView').style.display   = 'none';
    document.getElementById('tmplFormView').style.display   = '';
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
    const titleEl = document.getElementById('journalModalTitle');
    titleEl.style.display = (journal.title && journal.title.trim()) ? '' : 'none';

    document.getElementById('journalViewContent').style.display = '';
    document.getElementById('journalEditContent').style.display = 'none';
    document.getElementById('journalDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   新規作成エディタ（FAB / テンプレ使用）
───────────────────────────────────────────── */
function openNewJournalEditor(opts = {}) {
    currentEditJournal = null;

    const now = new Date();
    const dow = ['日','月','火','水','木','金','土'][now.getDay()];
    document.getElementById('journalEditDate').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${dow}）`;

    const ta = document.getElementById('editJournalText');
    if (opts.prefillContent) {
        // テンプレ使用: 1行目=日付、2行目以降=テンプレ内容
        const dateStr = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()}`;
        ta.value = `${dateStr}\n${opts.prefillContent}`;
        setTimeout(() => {
            ta.focus();
            const pos = dateStr.length + 1;
            ta.setSelectionRange(pos, pos);
        }, 120);
    } else {
        // 通常新規: まっさら
        ta.value = '';
        setTimeout(() => ta.focus(), 120);
    }

    document.getElementById('journalViewContent').style.display = 'none';
    document.getElementById('journalEditContent').style.display = '';
    document.getElementById('journalDetailModal').classList.add('visible');
}

/* ─────────────────────────────────────────────
   テキスト → タイトル / 本文 分割
───────────────────────────────────────────── */
function _splitTitleBody(text) {
    const nlIdx = text.indexOf('\n');
    if (nlIdx < 0) return { title: text.trim(), content: '' };
    return { title: text.substring(0, nlIdx).trim(), content: text.substring(nlIdx + 1).trim() };
}

/* ─────────────────────────────────────────────
   フルスクリーンモーダル スワイプで戻る
───────────────────────────────────────────── */
function _bindSwipeToClose(modal, onBack) {
    // document レベルで監視し、モーダルが表示中かつ左端エッジからのみ発動
    const EDGE_ZONE = 50; // 左端からこのpx以内
    let sx = 0, sy = 0, locked = null, active = false, watching = false;

    document.addEventListener('touchstart', e => {
        if (!modal.classList.contains('visible')) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        watching = sx <= EDGE_ZONE; // 左端エッジのみ
        locked   = null;
        active   = false;
        if (watching) modal.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!watching) return;

        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;

        if (!locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if (locked === 'h' && dx > 0) {
            active = true;
            const progress = Math.min(dx / window.innerWidth, 1);
            modal.style.transform = `translateX(${dx}px)`;
            modal.style.opacity   = String(1 - progress * 0.4);
        }
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!watching || !active) { watching = false; return; }
        watching = false;
        const dx = e.changedTouches[0].clientX - sx;
        modal.style.transition = 'transform 0.28s ease, opacity 0.28s ease';

        if (dx > window.innerWidth * 0.35) {
            modal.style.transform = 'translateX(100%)';
            modal.style.opacity   = '0';
            setTimeout(() => {
                modal.style.transition = '';
                modal.style.transform  = '';
                modal.style.opacity    = '';
                onBack();
            }, 260);
        } else {
            modal.style.transform = 'translateX(0)';
            modal.style.opacity   = '1';
            setTimeout(() => { modal.style.transition = ''; }, 300);
        }
        active = false;
    }, { passive: true });
}

/* ─────────────────────────────────────────────
   モーダル UI バインド（init で一度だけ呼ぶ）
───────────────────────────────────────────── */
function bindJournalDetailModalUI() {
    const modal = document.getElementById('journalDetailModal');

    const closeModal = () => {
        modal.classList.remove('visible');
        currentEditJournal = null;
    };
    const goToView = () => {
        document.getElementById('journalViewContent').style.display = '';
        document.getElementById('journalEditContent').style.display = 'none';
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
        currentEditJournal ? goToView() : closeModal();
    };

    document.getElementById('journalSaveEditBtn').onclick = async () => {
        const rawText = document.getElementById('editJournalText').value.trim();
        if (!rawText) { alert('内容を入力してください'); return; }
        const { title, content } = _splitTitleBody(rawText);

        try {
            if (currentEditJournal) {
                await apiCall('/journals/update', 'POST', {
                    id: currentEditJournal.id, user_id: userId, title, content,
                });
                currentEditJournal.title   = title;
                currentEditJournal.content = content;
                document.getElementById('journalModalTitle').textContent   = title   || '';
                document.getElementById('journalModalContent').textContent = content || '';
                document.getElementById('journalModalTitle').style.display = title ? '' : 'none';
                goToView();
                await loadJournals();
            } else {
                const now  = new Date();
                const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                const todayCompleted = window._completedTasksForJournal || [];
                await apiCall('/journals/save', 'POST', {
                    user_id: userId, date, title, content,
                    tasks_completed_count: todayCompleted.length,
                    completed_tasks: todayCompleted.map(t => t.task_name || t.title || '').filter(Boolean),
                });
                closeModal();
                await loadJournals();
            }
        } catch (e) { alert('保存に失敗しました'); }
    };

    // ── FAB ──
    const fab = document.getElementById('journalFab');
    if (fab) fab.onclick = () => openNewJournalEditor();

    // ── 年ナビ ──
    document.getElementById('journalYearPrev').onclick = () => changeJournalYear(-1);
    document.getElementById('journalYearNext').onclick = () => changeJournalYear(1);

    // ── 横スワイプで年切替（タブ全体） ──
    const tabArea = document.getElementById('tab-journal');
    if (tabArea) {
        let _swX = 0, _swY = 0;
        tabArea.addEventListener('touchstart', e => {
            _swX = e.touches[0].clientX;
            _swY = e.touches[0].clientY;
        }, { passive: true });
        tabArea.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - _swX;
            const dy = e.changedTouches[0].clientY - _swY;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                changeJournalYear(dx < 0 ? 1 : -1);
            }
        }, { passive: true });
    }

    // ── スワイプで戻る（フルスクリーンモーダル） ──
    _bindSwipeToClose(modal, () => {
        const editVisible = document.getElementById('journalEditContent').style.display !== 'none';
        if (editVisible && currentEditJournal) {
            // 編集モード → 閲覧モードへ戻る
            goToView();
        } else {
            closeModal();
        }
    });

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

    // ── テンプレート管理ボタン（表示制御は loadJournals 内の _updateManageBtn で行う） ──
    const manageBtn = document.getElementById('journalTemplateManageBtn');
    if (manageBtn) manageBtn.onclick = openTemplateManageModal;

    // ── テンプレート管理モーダル ──
    const mModal = document.getElementById('templateManageModal');
    const closeMModal = () => mModal.classList.remove('visible');
    document.getElementById('templateManageBackdrop').onclick = closeMModal;
    document.getElementById('closeTemplateManage').onclick    = closeMModal;

    document.getElementById('tmplAddNewBtn').onclick  = () => openTmplForm(null);
    document.getElementById('tmplFormBack').onclick   = () => {
        document.getElementById('tmplListView').style.display = '';
        document.getElementById('tmplFormView').style.display = 'none';
    };
    document.getElementById('tmplFormCancelBtn').onclick = () => {
        document.getElementById('tmplListView').style.display = '';
        document.getElementById('tmplFormView').style.display = 'none';
    };

    document.getElementById('tmplFormSaveBtn').onclick = async () => {
        const title       = document.getElementById('tmplInputTitle').value.trim();
        const content     = document.getElementById('tmplInputContent').value.trim();
        const description = document.getElementById('tmplInputDescription').value.trim();
        const sort_order  = parseInt(document.getElementById('tmplInputOrder').value) || 0;
        const id          = document.getElementById('tmplInputId').value || null;

        if (!title || !content) { alert('見出しと内容を入力してください'); return; }
        try {
            await apiCall('/journal-templates/save', 'POST', { user_id: userId, id, title, content, description, sort_order });
            await loadTemplateCarousel();
            document.getElementById('tmplListView').style.display = '';
            document.getElementById('tmplFormView').style.display = 'none';
            renderTmplList();
        } catch (e) { alert('保存に失敗しました'); }
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
