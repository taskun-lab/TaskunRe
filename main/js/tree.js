/* =============================================
   ムキムキタスくん - ツリービュー
   ============================================= */

(function () {
    // リスト/ツリー切替ボタン
    const btnList = document.getElementById('btnViewList');
    const btnTree = document.getElementById('btnViewTree');
    const listView = document.getElementById('listView');
    const treeView = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');

    if (!btnList || !btnTree) return;

    btnList.addEventListener('click', () => {
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
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    function buildNode(node, depth) {
        const isCompleted = node.complete_at === 1;
        const el = document.createElement('div');
        el.className = 'tree-node' + (isCompleted ? ' tree-node-done' : '');
        el.dataset.taskId = node.id;

        const allChildren = node.children || [];
        const activeChildren = allChildren.filter(c => c.complete_at !== 1);
        const hasChildren = allChildren.length > 0;

        // ─── 行 ───────────────────────────────────────
        const row = document.createElement('div');
        row.className = `tree-row depth-${depth}`;
        row.style.paddingLeft = `${depth * 20 + 12}px`;

        // 展開トグル
        const toggle = document.createElement('button');
        toggle.className = 'tree-toggle';
        toggle.textContent = hasChildren ? '▶' : '•';
        if (!hasChildren) { toggle.style.opacity = '0.3'; toggle.style.pointerEvents = 'none'; }

        // アイコン
        const icon = document.createElement('span');
        icon.className = 'tree-type-icon';
        icon.textContent = isCompleted ? '✓' : (node.task_type === 'mission' ? '🎯' : '○');

        // 名前
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.task_name || '(無題)';

        row.append(toggle, icon, name);

        // 右側バッジ（完了日 or 未完了子数）
        if (isCompleted && node.completed_at) {
            const badge = document.createElement('span');
            badge.className = 'tree-completed-date';
            badge.textContent = fmtDate(node.completed_at);
            row.appendChild(badge);
        } else if (!isCompleted && activeChildren.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'tree-child-count';
            badge.textContent = activeChildren.length;
            row.appendChild(badge);
        }

        el.appendChild(row);

        // ─── 詳細パネル ──────────────────────────────
        const detail = buildDetail(node, isCompleted, allChildren);
        el.appendChild(detail);

        // 行タップ → 詳細開閉
        row.addEventListener('click', (e) => {
            if (e.target.closest('.tree-toggle')) return;
            const isOpen = detail.classList.contains('open');
            document.querySelectorAll('.tree-detail-panel.open').forEach(p => p.classList.remove('open'));
            if (!isOpen) detail.classList.add('open');
        });

        // ─── 子ノード ────────────────────────────────
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

    function buildDetail(node, isCompleted, allChildren) {
        const panel = document.createElement('div');
        panel.className = 'tree-detail-panel';

        const doneCount = allChildren.filter(c => c.complete_at === 1).length;
        const total = allChildren.length;

        let html = '<div class="tree-detail-inner">';

        if (isCompleted) {
            html += `<span class="tree-detail-badge done">✓ 達成済み</span>`;
            if (node.completed_at) {
                html += `<div class="tree-detail-row">📅 <b>完了日</b> ${fmtDate(node.completed_at)}</div>`;
            }
        } else if (total > 0) {
            const pct = Math.round(doneCount / total * 100);
            html += `<div class="tree-detail-row">📊 <b>進捗</b> ${doneCount}/${total} (${pct}%)</div>`;
            html += `<div class="tree-progress-bar"><div class="tree-progress-fill" style="width:${pct}%"></div></div>`;
        }

        if (node.reason) {
            html += `<div class="tree-detail-row">💡 ${escapeHtml(node.reason)}</div>`;
        }
        if (node.target_date) {
            html += `<div class="tree-detail-row">🗓 <b>目標日</b> ${node.target_date}</div>`;
        }
        if (node.journal_id) {
            html += `<button class="tree-journal-btn" data-jid="${escapeHtml(node.journal_id)}" data-jdate="${escapeHtml(node.journal_date || '')}">📝 この日のジャーナルを見る</button>`;
        }

        html += '</div>';
        panel.innerHTML = html;

        const jBtn = panel.querySelector('.tree-journal-btn');
        if (jBtn) {
            jBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openJournalEntry(jBtn.dataset.jid, jBtn.dataset.jdate);
            });
        }

        return panel;
    }

    function openJournalEntry(journalId, journalDate) {
        // ジャーナルタブへ切り替え
        const tabNav = document.querySelector('.tab-nav-item[data-tab="journal"]');
        if (tabNav) tabNav.click();

        setTimeout(() => {
            // data-id で該当カードを探してスクロール
            const card = document.querySelector(`.journal-card[data-id="${journalId}"]`);
            if (card) {
                // 月グループを開く
                const content = card.closest('.journal-month-content');
                const header = content?.previousElementSibling;
                if (content && !content.classList.contains('active')) {
                    if (header) header.click();
                }
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('journal-highlight');
                    setTimeout(() => card.classList.remove('journal-highlight'), 2000);
                }, 200);
            }
        }, 300);
    }

    // 外部から呼び出し（タスク完了後にツリーを更新）
    window.refreshTreeIfVisible = function () {
        if (treeView && treeView.style.display !== 'none') {
            renderTree();
        }
    };
})();
