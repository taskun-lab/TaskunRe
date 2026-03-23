/* =============================================
   ムキムキタスくん - ツリービュー
   ============================================= */

(function () {
    const btnList = document.getElementById('btnViewList');
    const btnTree = document.getElementById('btnViewTree');
    const listView  = document.getElementById('listView');
    const treeView  = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');

    if (!btnList || !btnTree) return;

    // ─── 移動モード状態 ────────────────────────────
    let moveMode = null; // { taskId, taskName }

    // ─── ビュー切替 ───────────────────────────────
    btnList.addEventListener('click', () => {
        exitMoveMode();
        btnList.classList.add('active');
        btnTree.classList.remove('active');
        listView.style.display = '';
        treeView.style.display = 'none';
    });

    btnTree.addEventListener('click', async () => {
        btnTree.classList.add('active');
        btnList.classList.remove('active');
        listView.style.display = 'none';
        treeView.style.display = '';
        await renderTree();
    });

    // ─── ツリーレンダリング ────────────────────────
    async function renderTree() {
        treeContainer.innerHTML = '<div class="tree-loading">読み込み中…</div>';
        try {
            const data = await apiCall(`/tasks/tree?user_id=${encodeURIComponent(userId)}`);
            treeContainer.innerHTML = '';
            if (!data || data.length === 0) {
                treeContainer.innerHTML = '<div class="tree-empty">タスクがありません</div>';
                return;
            }
            data.forEach(node => treeContainer.appendChild(buildNode(node, 0)));
        } catch (e) {
            treeContainer.innerHTML = '<div class="tree-empty">読み込みに失敗しました</div>';
        }
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    // ─── ノード構築 ───────────────────────────────
    function buildNode(node, depth) {
        const isDone = node.complete_at === 1;
        const el = document.createElement('div');
        el.className = 'tree-node' + (isDone ? ' tree-node-done' : '');
        el.dataset.taskId = node.id;
        el.dataset.taskType = node.task_type || 'default';

        const allChildren  = node.children || [];
        const activeKids   = allChildren.filter(c => c.complete_at !== 1);
        const hasChildren  = allChildren.length > 0;

        // ── 行 ──
        const row = document.createElement('div');
        row.className = `tree-row depth-${depth}`;
        row.style.paddingLeft = `${depth * 20 + 12}px`;

        const toggle = document.createElement('button');
        toggle.className = 'tree-toggle';
        toggle.textContent = hasChildren ? '▶' : '•';
        if (!hasChildren) { toggle.style.opacity = '0.3'; toggle.style.pointerEvents = 'none'; }

        const icon = document.createElement('span');
        icon.className = 'tree-type-icon';
        icon.textContent = isDone ? '✓' : (node.task_type === 'mission' ? '🎯' : '○');

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.task_name || '(無題)';

        row.append(toggle, icon, name);

        if (isDone && node.completed_at) {
            const b = document.createElement('span');
            b.className = 'tree-completed-date';
            b.textContent = fmtDate(node.completed_at);
            row.appendChild(b);
        } else if (!isDone && activeKids.length > 0) {
            const b = document.createElement('span');
            b.className = 'tree-child-count';
            b.textContent = activeKids.length;
            row.appendChild(b);
        }

        el.appendChild(row);

        // ── 詳細パネル ──
        const detail = buildDetail(node, isDone, allChildren, depth);
        el.appendChild(detail);

        // 行タップ
        row.addEventListener('click', (e) => {
            if (e.target.closest('.tree-toggle')) return;

            // 移動モード中 → ミッションノードのみ drop target
            if (moveMode) {
                if (node.task_type === 'mission' && !isDone && node.id !== moveMode.taskId) {
                    doReparent(moveMode.taskId, node.id);
                }
                return;
            }

            const isOpen = detail.classList.contains('open');
            document.querySelectorAll('.tree-detail-panel.open').forEach(p => p.classList.remove('open'));
            if (!isOpen) detail.classList.add('open');
        });

        // ── 子ノード ──
        if (hasChildren) {
            const childrenEl = document.createElement('div');
            childrenEl.className = 'tree-children collapsed';
            allChildren.forEach(child => childrenEl.appendChild(buildNode(child, depth + 1)));
            el.appendChild(childrenEl);

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const collapsed = childrenEl.classList.contains('collapsed');
                childrenEl.classList.toggle('collapsed', !collapsed);
                toggle.textContent = collapsed ? '▼' : '▶';
            });
        }

        return el;
    }

    // ── 詳細パネル ─────────────────────────────────
    function buildDetail(node, isDone, allChildren, depth) {
        const panel = document.createElement('div');
        panel.className = 'tree-detail-panel';

        const doneCount = allChildren.filter(c => c.complete_at === 1).length;
        const total     = allChildren.length;

        let html = '<div class="tree-detail-inner">';

        if (isDone) {
            html += `<span class="tree-detail-badge done">✓ 達成済み</span>`;
            if (node.completed_at) {
                html += `<div class="tree-detail-row">📅 <b>完了日</b> ${fmtDate(node.completed_at)}</div>`;
            }
        } else if (total > 0) {
            const pct = Math.round(doneCount / total * 100);
            html += `<div class="tree-detail-row">📊 <b>進捗</b> ${doneCount}/${total} (${pct}%)</div>`;
            html += `<div class="tree-progress-bar"><div class="tree-progress-fill" style="width:${pct}%"></div></div>`;
        }

        if (node.reason)      html += `<div class="tree-detail-row">💡 ${escapeHtml(node.reason)}</div>`;
        if (node.target_date) html += `<div class="tree-detail-row">🗓 <b>目標日</b> ${node.target_date}</div>`;

        if (node.journal_id) {
            html += `<button class="tree-journal-btn" data-jid="${escapeHtml(node.journal_id)}" data-jdate="${escapeHtml(node.journal_date||'')}">📝 この日のジャーナルを見る</button>`;
        }

        // ＋ サブタスク追加（5階層まで・完了ノード除く）
        if (!isDone && depth < 4) {
            html += `<div class="tree-add-sub-row">
                <input type="text" class="tree-add-sub-input form-input" placeholder="サブタスクを追加…" style="flex:1;margin:0;" />
                <button class="tree-add-sub-btn">＋</button>
            </div>`;
        }

        html += '</div>';
        panel.innerHTML = html;

        // ジャーナルボタン
        const jBtn = panel.querySelector('.tree-journal-btn');
        if (jBtn) {
            jBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openJournalEntry(jBtn.dataset.jid, jBtn.dataset.jdate);
            });
        }

        // サブタスク追加
        const addInput = panel.querySelector('.tree-add-sub-input');
        const addBtn   = panel.querySelector('.tree-add-sub-btn');
        if (addBtn && addInput) {
            const doAdd = async () => {
                const name = addInput.value.trim();
                if (!name) return;
                addInput.value = '';
                addBtn.disabled = true;
                try {
                    await apiCall('/tasks/action', 'POST', {
                        user_id: userId, action: 'add_subtask',
                        task_name: name, parent_task_id: node.id,
                    });
                    await renderTree();
                } catch (e) {
                    console.error('サブタスク追加失敗', e);
                } finally {
                    addBtn.disabled = false;
                }
            };
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); doAdd(); });
            addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); doAdd(); } });
        }

        return panel;
    }

    // ─── 移動モード ───────────────────────────────
    function showMoveBanner(taskName) {
        removeBanner();
        const banner = document.createElement('div');
        banner.id = 'tree-move-banner';
        banner.innerHTML = `
            <span>「${escapeHtml(taskName)}」をどのクエストに入れる？</span>
            <button id="tree-move-cancel">×</button>`;
        treeView.insertBefore(banner, treeContainer);
        document.getElementById('tree-move-cancel').addEventListener('click', exitMoveMode);
        // ミッションノードをハイライト
        treeContainer.querySelectorAll('.tree-node[data-task-type="mission"]:not(.tree-node-done)').forEach(n => {
            if (n.dataset.taskId !== String(moveMode?.taskId)) {
                n.classList.add('tree-drop-target');
            }
        });
    }

    function removeBanner() {
        document.getElementById('tree-move-banner')?.remove();
        treeContainer.querySelectorAll('.tree-drop-target').forEach(n => n.classList.remove('tree-drop-target'));
    }

    function exitMoveMode() {
        moveMode = null;
        removeBanner();
        // リストのカード lifted 解除
        document.querySelectorAll('.card-lifted').forEach(c => c.classList.remove('card-lifted'));
    }

    async function doReparent(taskId, newParentId) {
        const name = moveMode?.taskName || '';
        exitMoveMode();
        try {
            await apiCall('/tasks/action', 'POST', {
                user_id: userId, action: 'reparent',
                task_id: taskId, parent_task_id: newParentId,
            });
            await renderTree();
            loadList(); // リストも更新
        } catch (e) {
            console.error('移動失敗', e);
            alert('移動に失敗しました');
        }
    }

    // ─── ジャーナル遷移 ────────────────────────────
    function openJournalEntry(journalId, journalDate) {
        const tabNav = document.querySelector('.tab-nav-item[data-tab="journal"]');
        if (tabNav) tabNav.click();
        setTimeout(() => {
            const card = document.querySelector(`.journal-card[data-id="${journalId}"]`);
            if (card) {
                const content = card.closest('.journal-month-content');
                const header  = content?.previousElementSibling;
                if (content && !content.classList.contains('active') && header) header.click();
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('journal-highlight');
                    setTimeout(() => card.classList.remove('journal-highlight'), 2000);
                }, 200);
            }
        }, 300);
    }

    // ─── 外部公開 API ─────────────────────────────
    window.refreshTreeIfVisible = function () {
        if (treeView && treeView.style.display !== 'none') renderTree();
    };

    // ロングプレスから呼ばれる（task.js）
    window.enterMoveMode = function (taskId, taskName) {
        moveMode = { taskId, taskName };
        // ツリービューに切替
        btnTree.classList.add('active');
        btnList.classList.remove('active');
        listView.style.display = 'none';
        treeView.style.display = '';
        renderTree().then(() => showMoveBanner(taskName));
    };
})();
