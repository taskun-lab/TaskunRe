/* =============================================
   ムキムキタスくん - ツリービュー（SVGキャンバス）
   ============================================= */

(function () {
    const btnList       = document.getElementById('btnViewList');
    const btnTree       = document.getElementById('btnViewTree');
    const listView      = document.getElementById('listView');
    const treeView      = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');

    if (!btnList || !btnTree) return;

    // ─── 定数 ────────────────────────────────────
    const QUEST_R  = 20;   // クエストノード半径
    const TASK_R   = 8;    // タスクノード半径
    const V_GAP    = 100;  // 縦間隔
    const H_GAP    = 120;  // 横間隔
    const MAX_CHARS = 14;  // ラベル最大文字数
    const NS       = 'http://www.w3.org/2000/svg';

    // ─── 状態 ────────────────────────────────────
    let pan        = { x: 0, y: 50 };
    let scale      = 1;
    let svgEl      = null;
    let gEl        = null;
    let moveMode   = null;   // { taskId, taskName }
    let collapsed  = new Set();
    let lastData   = null;

    // ─── ビュー切替 ──────────────────────────────
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

    // ─── ツリー描画メイン ──────────────────────────
    async function renderTree() {
        try {
            const data = await apiCall(`/tasks/tree?user_id=${encodeURIComponent(userId)}`);
            lastData = data;
            if (!data || data.length === 0) {
                treeContainer.innerHTML = '<div class="tree-empty">タスクがありません</div>';
                return;
            }
            initSvg();
            redraw(data);
        } catch (e) {
            treeContainer.innerHTML = '<div class="tree-empty">読み込みに失敗しました</div>';
        }
    }

    function redraw(data) {
        if (!gEl) return;
        gEl.innerHTML = '';
        const layout = computeLayout(data);
        const layoutMap = Object.fromEntries(layout.map(i => [i.node.id, i]));

        // エッジ（背面）
        const eg = svgNS('g'); gEl.appendChild(eg);
        // ノード（前面）
        const ng = svgNS('g'); gEl.appendChild(ng);

        layout.forEach(({ node, x, y }) => {
            // エッジ
            if (!collapsed.has(node.id)) {
                (node.children || []).forEach(child => {
                    const ci = layoutMap[child.id];
                    if (ci) drawEdge(eg, x, y, ci.x, ci.y, node.complete_at === 1);
                });
            }
            drawNode(ng, node, x, y);
        });

        // 初期センタリング
        const w = treeContainer.clientWidth;
        const xs = layout.map(i => i.x);
        pan.x = w / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
        applyTransform();
    }

    // ─── SVG初期化 ───────────────────────────────
    function initSvg() {
        treeContainer.innerHTML = '';
        treeContainer.style.cssText = 'overflow:hidden;position:relative;background:var(--bg-main);';
        treeContainer.style.height = `${window.innerHeight - 140}px`;

        svgEl = svgNS('svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.cssText = 'display:block;touch-action:none;cursor:grab;';

        gEl = svgNS('g');
        svgEl.appendChild(gEl);
        treeContainer.appendChild(svgEl);

        setupPanZoom(svgEl);

        // 背景クリックで詳細を閉じる
        svgEl.addEventListener('click', (e) => {
            if (e.target === svgEl || e.target === gEl) {
                document.getElementById('tree-detail-overlay')?.remove();
            }
        });
    }

    // ─── レイアウト計算（縦展開ツリー）──────────────
    function computeLayout(nodes) {
        const all = [];
        let leafIdx = 0;

        function visit(node, depth) {
            const kids = collapsed.has(node.id) ? [] : (node.children || []);
            const info = { node, depth, x: 0, y: depth * V_GAP };
            all.push(info);

            if (kids.length === 0) {
                info.x = leafIdx * H_GAP;
                leafIdx++;
            } else {
                const start = leafIdx;
                kids.forEach(c => visit(c, depth + 1));
                info.x = ((start + leafIdx - 1) * H_GAP) / 2;
            }
        }
        nodes.forEach(n => visit(n, 0));
        return all;
    }

    // ─── ノード描画 ───────────────────────────────
    function drawNode(parent, node, x, y) {
        const isDone  = node.complete_at === 1;
        const isQuest = node.task_type === 'mission';
        const isDrop  = moveMode && isQuest && !isDone && node.id !== moveMode.taskId;
        const hasKids = (node.children || []).length > 0;
        const g = svgNS('g');
        g.style.cursor = 'pointer';
        let tapOk = true;

        if (isQuest) {
            // ── クエスト：大きい円 ──
            const fill = isDone ? '#4caf50' : isDrop ? '#ff4757' : '#ff9f43';
            const circle = svgEl_('circle', { cx: x, cy: y, r: QUEST_R, fill,
                stroke: 'white', 'stroke-width': 2.5 });
            if (!isDone) circle.style.filter = 'drop-shadow(0 3px 8px rgba(255,159,67,0.45))';
            if (isDrop)  circle.style.filter = 'drop-shadow(0 3px 8px rgba(255,71,87,0.5))';
            g.appendChild(circle);

            const iconEl = svgEl_('text', { x, y: y + 1,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': 14, 'pointer-events': 'none' });
            iconEl.textContent = isDone ? '✓' : '🎯';
            iconEl.setAttribute('fill', 'white');
            g.appendChild(iconEl);

        } else {
            // ── タスク：小ドット ──
            const fill = isDone ? '#4caf50' : '#94a3b8';
            const circle = svgEl_('circle', { cx: x, cy: y, r: TASK_R, fill });
            g.appendChild(circle);
            if (isDone) {
                const chk = svgEl_('text', { x, y: y + 1,
                    'text-anchor': 'middle', 'dominant-baseline': 'middle',
                    'font-size': 8, fill: 'white', 'pointer-events': 'none' });
                chk.textContent = '✓';
                g.appendChild(chk);
            }
        }

        // ── テキストラベル ──
        const textX = x + (isQuest ? QUEST_R + 7 : TASK_R + 6);
        const label = truncate(node.task_name || '(無題)', MAX_CHARS);
        const textEl = svgEl_('text', {
            x: textX, y: isDone ? y - 6 : y,
            'dominant-baseline': 'middle',
            'font-size': isQuest ? 13 : 12,
            'font-weight': isQuest ? 700 : 400,
            'pointer-events': 'none',
        });
        textEl.textContent = label;
        textEl.setAttribute('class', isDone ? 'tree-svg-label-muted' : 'tree-svg-label');
        if (isDone) textEl.setAttribute('text-decoration', 'line-through');
        g.appendChild(textEl);

        // 完了日（ラベル下）
        if (isDone && node.completed_at) {
            const dateEl = svgEl_('text', {
                x: textX, y: y + 8,
                'dominant-baseline': 'middle',
                'font-size': 10,
                'pointer-events': 'none',
            });
            dateEl.textContent = fmtDate(node.completed_at);
            dateEl.setAttribute('class', 'tree-svg-label-muted');
            g.appendChild(dateEl);
        }

        // 折りたたみバッジ（+/−）
        if (hasKids) {
            const bx = x + QUEST_R - 4, by = y - QUEST_R + 4;
            const isCollapsed = collapsed.has(node.id);
            const badgeCircle = svgEl_('circle', { cx: bx, cy: by, r: 9,
                fill: '#5a67d8', stroke: 'white', 'stroke-width': 1.5 });
            const badgeText = svgEl_('text', { x: bx, y: by + 1,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': 11, fill: 'white', 'font-weight': 700 });
            badgeText.textContent = isCollapsed ? '+' : '−';
            [badgeCircle, badgeText].forEach(el => {
                el.style.cursor = 'pointer';
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id);
                    if (lastData) redraw(lastData);
                });
            });
            g.appendChild(badgeCircle);
            g.appendChild(badgeText);
        }

        // タップ → 詳細 or 移動モード
        g.addEventListener('click', e => {
            e.stopPropagation();
            if (!tapOk) return;
            if (moveMode) {
                if (isQuest && !isDone && node.id !== moveMode.taskId) doReparent(moveMode.taskId, node.id);
                return;
            }
            showDetail(node);
        });
        // パン後タップ抑制
        g.addEventListener('pointerdown', () => { tapOk = true; });
        g.addEventListener('pointermove', () => { tapOk = false; });

        parent.appendChild(g);
    }

    // ─── エッジ（ベジェ曲線）─────────────────────
    function drawEdge(parent, x1, y1, x2, y2, isDone) {
        const my = (y1 + y2) / 2;
        const path = svgEl_('path', {
            d: `M${x1},${y1 + QUEST_R} C${x1},${my} ${x2},${my} ${x2},${y2 - (isDone ? TASK_R : TASK_R)}`,
            fill: 'none',
            stroke: isDone ? '#c8d6e5' : '#cbd5e1',
            'stroke-width': 1.5,
        });
        parent.appendChild(path);
    }

    // ─── 詳細ボトムシート ──────────────────────────
    function showDetail(node) {
        document.getElementById('tree-detail-overlay')?.remove();
        const isDone  = node.complete_at === 1;
        const kids    = node.children || [];
        const doneK   = kids.filter(c => c.complete_at === 1).length;
        const depth   = node.depth ?? 0;

        const overlay = document.createElement('div');
        overlay.id    = 'tree-detail-overlay';
        overlay.className = 'tree-detail-overlay';

        let html = `
        <div class="tree-overlay-handle"></div>
        <div class="tree-overlay-header">
            <span class="tree-overlay-title">${escapeHtml(node.task_name || '(無題)')}</span>
            <button class="tree-overlay-close">×</button>
        </div>
        <div class="tree-overlay-body">`;

        if (isDone) {
            html += `<span class="tree-detail-badge done">✓ 達成済み</span>`;
            if (node.completed_at)
                html += `<div class="tree-detail-row">📅 <b>完了日</b> ${fmtDate(node.completed_at)}</div>`;
        } else if (kids.length > 0) {
            const pct = Math.round(doneK / kids.length * 100);
            html += `<div class="tree-detail-row">📊 <b>進捗</b> ${doneK}/${kids.length} (${pct}%)</div>
                     <div class="tree-progress-bar"><div class="tree-progress-fill" style="width:${pct}%"></div></div>`;
        }
        if (node.reason)      html += `<div class="tree-detail-row">💡 ${escapeHtml(node.reason)}</div>`;
        if (node.target_date) html += `<div class="tree-detail-row">🗓 <b>目標日</b> ${node.target_date}</div>`;
        if (node.journal_id)  html += `<button class="tree-journal-btn" data-jid="${escapeHtml(node.journal_id)}" data-jdate="${escapeHtml(node.journal_date||'')}">📝 この日のジャーナルを見る</button>`;

        // サブタスク追加（5階層 = depth 0〜4）
        if (!isDone && depth < 4) {
            html += `<div class="tree-add-sub-row">
                <input type="text" class="form-input tree-add-sub-input" placeholder="サブタスクを追加…" style="flex:1;margin:0;" />
                <button class="tree-add-sub-btn">＋</button>
            </div>`;
        }
        html += '</div>';
        overlay.innerHTML = html;

        overlay.querySelector('.tree-overlay-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.tree-journal-btn')?.addEventListener('click', e => {
            const b = e.currentTarget;
            openJournalEntry(b.dataset.jid);
            overlay.remove();
        });

        const inp = overlay.querySelector('.tree-add-sub-input');
        const btn = overlay.querySelector('.tree-add-sub-btn');
        if (inp && btn) {
            const doAdd = async () => {
                const name = inp.value.trim();
                if (!name) return;
                inp.value = ''; btn.disabled = true;
                try {
                    await apiCall('/tasks/action', 'POST', {
                        user_id: userId, action: 'add_subtask',
                        task_name: name, parent_task_id: node.id,
                    });
                    overlay.remove();
                    await renderTree();
                } catch (err) { console.error(err); }
                finally { btn.disabled = false; }
            };
            btn.addEventListener('click', doAdd);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        }

        treeView.appendChild(overlay);
        // アニメーション
        requestAnimationFrame(() => overlay.classList.add('open'));
    }

    // ─── 移動モード ───────────────────────────────
    function showMoveBanner(taskName) {
        document.getElementById('tree-move-banner')?.remove();
        const b = document.createElement('div');
        b.id = 'tree-move-banner';
        b.innerHTML = `<span>「${escapeHtml(taskName)}」をどのクエストに移動？</span><button id="tree-move-cancel">×</button>`;
        treeView.insertBefore(b, treeContainer);
        document.getElementById('tree-move-cancel').addEventListener('click', exitMoveMode);
    }

    function exitMoveMode() {
        moveMode = null;
        document.getElementById('tree-move-banner')?.remove();
        document.querySelectorAll('.card-lifted').forEach(c => c.classList.remove('card-lifted'));
        if (lastData) redraw(lastData);
    }

    async function doReparent(taskId, newParentId) {
        exitMoveMode();
        try {
            await apiCall('/tasks/action', 'POST', {
                user_id: userId, action: 'reparent',
                task_id: taskId, parent_task_id: newParentId,
            });
            await renderTree();
            loadList();
        } catch (e) {
            console.error('移動失敗', e);
            alert('移動に失敗しました');
        }
    }

    // ─── パン・ズーム ─────────────────────────────
    function applyTransform() {
        if (gEl) gEl.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${scale})`);
    }

    function setupPanZoom(svg) {
        let dragging = false, ox = 0, oy = 0, hasMoved = false;
        let lastTouches = null;

        // マウス
        svg.addEventListener('mousedown', e => {
            if (e.target !== svg && e.target !== gEl) return;
            dragging = true; hasMoved = false;
            ox = e.clientX - pan.x; oy = e.clientY - pan.y;
            svg.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            hasMoved = true;
            pan.x = e.clientX - ox; pan.y = e.clientY - oy;
            applyTransform();
        });
        window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });

        // スクロールズーム
        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const r  = svg.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const ns = Math.min(3, Math.max(0.25, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
            pan.x = mx - (mx - pan.x) * (ns / scale);
            pan.y = my - (my - pan.y) * (ns / scale);
            scale = ns;
            applyTransform();
        }, { passive: false });

        // タッチ
        svg.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                dragging = true; hasMoved = false;
                ox = e.touches[0].clientX - pan.x;
                oy = e.touches[0].clientY - pan.y;
            }
            lastTouches = Array.from(e.touches);
        }, { passive: true });

        svg.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && dragging) {
                hasMoved = true;
                pan.x = e.touches[0].clientX - ox;
                pan.y = e.touches[0].clientY - oy;
                applyTransform();
            } else if (e.touches.length === 2) {
                const [t1, t2] = [e.touches[0], e.touches[1]];
                const nd = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                if (lastTouches?.length === 2) {
                    const od = Math.hypot(
                        lastTouches[0].clientX - lastTouches[1].clientX,
                        lastTouches[0].clientY - lastTouches[1].clientY);
                    const ns = Math.min(3, Math.max(0.25, scale * (nd / od)));
                    const r  = svg.getBoundingClientRect();
                    const mx = (t1.clientX + t2.clientX) / 2 - r.left;
                    const my = (t1.clientY + t2.clientY) / 2 - r.top;
                    pan.x = mx - (mx - pan.x) * (ns / scale);
                    pan.y = my - (my - pan.y) * (ns / scale);
                    scale = ns;
                    applyTransform();
                }
                dragging = false;
            }
            lastTouches = Array.from(e.touches);
        }, { passive: false });

        svg.addEventListener('touchend', () => { dragging = false; lastTouches = null; });
    }

    // ─── ジャーナル遷移 ────────────────────────────
    function openJournalEntry(journalId) {
        document.querySelector('.tab-nav-item[data-tab="journal"]')?.click();
        setTimeout(() => {
            const card = document.querySelector(`.journal-card[data-id="${journalId}"]`);
            if (!card) return;
            const content = card.closest('.journal-month-content');
            const header  = content?.previousElementSibling;
            if (content && !content.classList.contains('active') && header) header.click();
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('journal-highlight');
                setTimeout(() => card.classList.remove('journal-highlight'), 2000);
            }, 200);
        }, 300);
    }

    // ─── ユーティリティ ───────────────────────────
    function svgNS(tag) { return document.createElementNS(NS, tag); }
    function svgEl_(tag, attrs) {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }
    function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    // ─── 外部公開 ─────────────────────────────────
    window.refreshTreeIfVisible = () => {
        if (treeView?.style.display !== 'none') renderTree();
    };
    window.enterMoveMode = (taskId, taskName) => {
        moveMode = { taskId, taskName };
        btnTree.classList.add('active'); btnList.classList.remove('active');
        listView.style.display = 'none'; treeView.style.display = '';
        renderTree().then(() => showMoveBanner(taskName));
    };
})();
