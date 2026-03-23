/* =============================================
   ムキムキタスくん - ツリービュー
   ============================================= */

(function () {
    let treeData = null;

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
            treeData = data;
            treeContainer.innerHTML = '';
            if (!data || data.length === 0) {
                treeContainer.innerHTML = '<div class="tree-empty">タスクがありません</div>';
                return;
            }
            // ルートノード（未完了のみ表示）
            const roots = data.filter(t => t.complete_at !== 1);
            if (roots.length === 0) {
                treeContainer.innerHTML = '<div class="tree-empty">未完了のタスクがありません</div>';
                return;
            }
            roots.forEach(node => treeContainer.appendChild(buildNode(node, 0)));
        } catch (e) {
            treeContainer.innerHTML = '<div class="tree-empty">読み込みに失敗しました</div>';
        }
    }

    function buildNode(node, depth) {
        const el = document.createElement('div');
        el.className = 'tree-node';
        el.dataset.taskId = node.id;

        const children = (node.children || []).filter(c => c.complete_at !== 1);
        const hasChildren = children.length > 0;

        const row = document.createElement('div');
        row.className = `tree-row depth-${depth}`;
        row.style.paddingLeft = `${depth * 20 + 12}px`;

        // 展開ボタン or スペーサー
        const toggle = document.createElement('button');
        toggle.className = 'tree-toggle';
        if (hasChildren) {
            toggle.textContent = '▶';
            toggle.title = '展開/折りたたみ';
        } else {
            toggle.textContent = '•';
            toggle.style.opacity = '0.3';
            toggle.style.pointerEvents = 'none';
        }

        // タイプアイコン
        const typeIcon = document.createElement('span');
        typeIcon.className = 'tree-type-icon';
        typeIcon.textContent = node.task_type === 'mission' ? '🎯' : '✅';

        // タスク名
        const nameEl = document.createElement('span');
        nameEl.className = 'tree-name';
        nameEl.textContent = node.task_name || '(無題)';

        // 子カウント
        if (hasChildren) {
            const cnt = document.createElement('span');
            cnt.className = 'tree-child-count';
            cnt.textContent = children.length;
            row.append(toggle, typeIcon, nameEl, cnt);
        } else {
            row.append(toggle, typeIcon, nameEl);
        }

        el.appendChild(row);

        // 子ノード
        if (hasChildren) {
            const childrenEl = document.createElement('div');
            childrenEl.className = 'tree-children collapsed';
            children.forEach(child => childrenEl.appendChild(buildNode(child, depth + 1)));
            el.appendChild(childrenEl);

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = childrenEl.classList.contains('collapsed');
                childrenEl.classList.toggle('collapsed', !isCollapsed);
                toggle.textContent = isCollapsed ? '▼' : '▶';
            });
        }

        return el;
    }

    // ツリービューから完了アクション後に再レンダリング
    window.refreshTreeIfVisible = function () {
        if (treeView && treeView.style.display !== 'none') {
            renderTree();
        }
    };
})();
