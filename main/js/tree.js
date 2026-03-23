/* =============================================
   ムキムキタスくん - ツリービュー（SVGキャンバス v3）
   横展開 / コズミックダーク / ノードD&D
   ============================================= */

(function () {
    const btnList       = document.getElementById('btnViewList');
    const btnTree       = document.getElementById('btnViewTree');
    const listView      = document.getElementById('listView');
    const treeView      = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');

    if (!btnList || !btnTree) return;

    // ─── 定数 ────────────────────────────────────
    const QUEST_R   = 22;    // クエストノード半径
    const TASK_R    = 9;     // タスクノード半径
    const V_GAP     = 80;    // 兄弟ノード縦間隔
    const H_GAP     = 190;   // 親子横間隔
    const MAX_CHARS = 13;    // ラベル最大文字数
    const NS        = 'http://www.w3.org/2000/svg';
    const DRAG_THR  = 6;     // ドラッグ判定閾値(px)

    // ─── コズミックカラー ────────────────────────
    const C = {
        bg        : '#080818',
        edge      : 'rgba(100,120,255,0.35)',
        edgeDone  : 'rgba(60,60,100,0.25)',
        quest     : '#ff9f43',
        task      : '#7c8aff',
        done      : '#4ade80',
        drop      : '#ff4757',
        label     : '#d8e4ff',
        muted     : '#5a6a9a',
        badge     : '#4c5bd4',
    };

    // ─── 状態 ────────────────────────────────────
    let pan        = { x: 50, y: 60 };
    let scale      = 1;
    let svgEl      = null;
    let gEl        = null;
    let moveMode   = null;        // { taskId, taskName }
    let collapsed  = new Set();
    let lastData   = null;
    let firstLoad  = true;
    let nodeOffsets = new Map();  // Map<id, {dx,dy}> — D&D オフセット

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
        // SVGがなければ初期化（パン・ズームも初期値へ）
        if (!svgEl || !svgEl.isConnected) {
            treeContainer.innerHTML = '';
            initSvg();
            firstLoad = true;
        }
        try {
            const data = await apiCall(`/tasks/tree?user_id=${encodeURIComponent(userId)}`);
            lastData = data;
            if (!data || data.length === 0) {
                gEl.innerHTML = '';
                const t = svgEl_('text', { x: '50%', y: '50%',
                    'text-anchor': 'middle', 'dominant-baseline': 'middle',
                    fill: C.muted, 'font-size': 14 });
                t.textContent = 'タスクがありません';
                gEl.appendChild(t);
                return;
            }
            if (firstLoad) {
                pan = { x: 50, y: 60 };
                scale = 1;
                firstLoad = false;
            }
            redraw(data);
        } catch (e) {
            gEl.innerHTML = '';
            const t = svgEl_('text', { x: '50%', y: '50%',
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                fill: C.muted, 'font-size': 14 });
            t.textContent = '読み込みに失敗しました';
            gEl.appendChild(t);
        }
    }

    function redraw(data) {
        if (!gEl) return;
        gEl.innerHTML = '';

        const layout = computeLayout(data);

        // D&D オフセット適用
        layout.forEach(item => {
            const off = nodeOffsets.get(item.node.id);
            if (off) { item.x += off.dx; item.y += off.dy; }
        });

        const lmap = new Map(layout.map(i => [i.node.id, i]));

        const eg = svgNS('g');
        const ng = svgNS('g');
        gEl.appendChild(eg);
        gEl.appendChild(ng);

        layout.forEach(({ node, x, y }) => {
            if (!collapsed.has(node.id)) {
                (node.children || []).forEach(child => {
                    const ci = lmap.get(child.id);
                    if (ci) drawEdge(eg, x, y, ci.x, ci.y, node, child);
                });
            }
            drawNode(ng, node, x, y);
        });

        applyTransform();
    }

    // ─── SVG 初期化 ──────────────────────────────
    function initSvg() {
        treeContainer.style.cssText = 'overflow:hidden;position:relative;';
        treeContainer.style.height  = `${window.innerHeight - 140}px`;

        svgEl = svgNS('svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.cssText = `display:block;touch-action:none;cursor:grab;background:${C.bg};`;

        // グロウフィルター
        const defs = svgNS('defs');
        addGlow(defs, 'gq',  '#ff9f43', 8);   // quest
        addGlow(defs, 'gt',  '#7c8aff', 5);   // task
        addGlow(defs, 'gd',  '#4ade80', 6);   // done
        addGlow(defs, 'gdr', '#ff4757', 10);  // drop target
        svgEl.appendChild(defs);

        gEl = svgNS('g');
        svgEl.appendChild(gEl);
        treeContainer.appendChild(svgEl);

        setupPanZoom(svgEl);

        // 背景クリックで詳細を閉じる
        svgEl.addEventListener('click', e => {
            if (e.target === svgEl || e.target === gEl) {
                document.getElementById('tree-detail-overlay')?.remove();
            }
        });
    }

    function addGlow(defs, id, color, blur) {
        const f = svgNS('filter');
        f.setAttribute('id', id);
        f.setAttribute('x', '-60%'); f.setAttribute('y', '-60%');
        f.setAttribute('width', '220%'); f.setAttribute('height', '220%');
        const fe = svgNS('feGaussianBlur');
        fe.setAttribute('in', 'SourceGraphic');
        fe.setAttribute('stdDeviation', blur);
        fe.setAttribute('result', 'blur');
        const fm = svgNS('feMerge');
        const n1 = svgNS('feMergeNode'); n1.setAttribute('in', 'blur');
        const n2 = svgNS('feMergeNode'); n2.setAttribute('in', 'SourceGraphic');
        fm.appendChild(n1); fm.appendChild(n2);
        f.appendChild(fe); f.appendChild(fm);
        defs.appendChild(f);
    }

    // ─── レイアウト（横展開: depth=X軸, 兄弟=Y軸）──
    function computeLayout(nodes) {
        const all = [];
        let leaf = 0;

        function visit(node, depth) {
            const kids = collapsed.has(node.id) ? [] : (node.children || []);
            const info = { node, depth, x: depth * H_GAP, y: 0 };
            all.push(info);
            if (kids.length === 0) {
                info.y = leaf++ * V_GAP;
            } else {
                const s = leaf;
                kids.forEach(c => visit(c, depth + 1));
                info.y = ((s + leaf - 1) * V_GAP) / 2;
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
        const R = isQuest ? QUEST_R : TASK_R;

        const g = svgNS('g');
        g.style.cursor = 'grab';

        // ── 円 ──
        const fill    = isDone ? C.done : isDrop ? C.drop : isQuest ? C.quest : C.task;
        const glowId  = isDone ? 'gd' : isDrop ? 'gdr' : isQuest ? 'gq' : 'gt';
        const circle  = svgEl_('circle', {
            cx: x, cy: y, r: R, fill,
            stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1.5,
            filter: `url(#${glowId})`,
        });
        g.appendChild(circle);

        // ── アイコン（クエスト or 完了チェック）──
        if (isQuest || isDone) {
            const ic = svgEl_('text', {
                x, y: y + 1,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': isQuest ? 13 : 7,
                fill: 'white', 'pointer-events': 'none',
            });
            ic.textContent = isDone ? '✓' : '🎯';
            g.appendChild(ic);
        }

        // ── テキストラベル（ノード右）──
        const tx = x + R + 8;
        const lbl = truncate(node.task_name || '(無題)', MAX_CHARS);
        const te = svgEl_('text', {
            x: tx, y: isDone ? y - 6 : y,
            'dominant-baseline': 'middle',
            'font-size': isQuest ? 13 : 12,
            'font-weight': isQuest ? 700 : 400,
            fill: isDone ? C.muted : C.label,
            'pointer-events': 'none',
        });
        te.textContent = lbl;
        if (isDone) te.setAttribute('text-decoration', 'line-through');
        g.appendChild(te);

        // 完了日（ラベル下）
        if (isDone && node.completed_at) {
            const de = svgEl_('text', {
                x: tx, y: y + 7,
                'dominant-baseline': 'middle',
                'font-size': 10, fill: C.muted,
                'pointer-events': 'none',
            });
            de.textContent = fmtDate(node.completed_at);
            g.appendChild(de);
        }

        // ── 折りたたみバッジ ──
        if (hasKids) {
            const bx = x + R - 4, by = y - R + 4;
            const isCol = collapsed.has(node.id);
            const bc = svgEl_('circle', { cx: bx, cy: by, r: 8,
                fill: C.badge, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1 });
            const bt = svgEl_('text', { x: bx, y: by + 1,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': 11, fill: 'white', 'font-weight': 700,
                'pointer-events': 'none' });
            bt.textContent = isCol ? '+' : '−';
            bc.style.cursor = 'pointer';
            const onBadge = e => {
                e.stopPropagation();
                isCol ? collapsed.delete(node.id) : collapsed.add(node.id);
                if (lastData) redraw(lastData);
            };
            bc.addEventListener('pointerdown', e => e.stopPropagation());
            bc.addEventListener('click', onBadge);
            g.appendChild(bc);
            g.appendChild(bt);
        }

        // ── ポインターイベント（タップ vs D&D）──
        let tapOk = true, dragging = false, startPx = 0, startPy = 0;

        g.addEventListener('pointerdown', e => {
            e.stopPropagation();
            tapOk = true; dragging = false;
            startPx = e.clientX; startPy = e.clientY;
            g.setPointerCapture(e.pointerId);
        });

        g.addEventListener('pointermove', e => {
            const dx = e.clientX - startPx, dy = e.clientY - startPy;
            if (!dragging && Math.hypot(dx, dy) > DRAG_THR) {
                dragging = true; tapOk = false;
            }
            if (dragging) {
                g.style.cursor = 'grabbing';
                // ノードを視覚的に移動（エッジはリリース後に再描画）
                g.setAttribute('transform', `translate(${dx / scale},${dy / scale})`);
            }
        });

        g.addEventListener('pointerup', e => {
            if (dragging) {
                const dx = (e.clientX - startPx) / scale;
                const dy = (e.clientY - startPy) / scale;
                const cur = nodeOffsets.get(node.id) || { dx: 0, dy: 0 };
                nodeOffsets.set(node.id, { dx: cur.dx + dx, dy: cur.dy + dy });
                g.removeAttribute('transform');
                dragging = false;
                if (lastData) redraw(lastData);
                return;
            }
            if (!tapOk) return;
            // タップ処理
            if (moveMode) {
                if (isQuest && !isDone && node.id !== moveMode.taskId) {
                    doReparent(moveMode.taskId, node.id);
                }
                return;
            }
            showDetail(node);
        });

        g.addEventListener('pointercancel', () => {
            dragging = false;
            g.removeAttribute('transform');
        });

        parent.appendChild(g);
    }

    // ─── エッジ（横向きベジェ）───────────────────
    function drawEdge(parent, px, py, cx, cy, pNode, cNode) {
        const R1 = pNode.task_type === 'mission' ? QUEST_R : TASK_R;
        const R2 = cNode.task_type === 'mission' ? QUEST_R : TASK_R;
        const bothDone = pNode.complete_at === 1 && cNode.complete_at === 1;
        const mx = (px + R1 + cx - R2) / 2;
        const path = svgEl_('path', {
            d: `M${px + R1},${py} C${mx},${py} ${mx},${cy} ${cx - R2},${cy}`,
            fill: 'none',
            stroke: bothDone ? C.edgeDone : C.edge,
            'stroke-width': 1.5,
            'pointer-events': 'none',
        });
        parent.appendChild(path);
    }

    // ─── 詳細ボトムシート ──────────────────────────
    function showDetail(node) {
        document.getElementById('tree-detail-overlay')?.remove();
        const isDone = node.complete_at === 1;
        const kids   = node.children || [];
        const doneK  = kids.filter(c => c.complete_at === 1).length;
        const depth  = node.depth ?? 0;

        const ov = document.createElement('div');
        ov.id = 'tree-detail-overlay';

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
        if (node.journal_id)  html += `<button class="tree-journal-btn" data-jid="${escapeHtml(node.journal_id)}">📝 この日のジャーナルを見る</button>`;
        if (!isDone && depth < 4) {
            html += `<div class="tree-add-sub-row">
                <input type="text" class="form-input tree-add-sub-input" placeholder="サブタスクを追加…" style="flex:1;margin:0;background:#131330;color:#d8e4ff;border-color:#2a2a6a;" />
                <button class="tree-add-sub-btn">＋</button>
            </div>`;
        }
        html += '</div>';
        ov.innerHTML = html;

        ov.querySelector('.tree-overlay-close').addEventListener('click', () => ov.remove());
        ov.querySelector('.tree-journal-btn')?.addEventListener('click', e => {
            openJournalEntry(e.currentTarget.dataset.jid);
            ov.remove();
        });

        const inp = ov.querySelector('.tree-add-sub-input');
        const btn = ov.querySelector('.tree-add-sub-btn');
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
                    ov.remove();
                    await renderTree();
                } catch (err) { console.error(err); }
                finally { btn.disabled = false; }
            };
            btn.addEventListener('click', doAdd);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        }

        treeView.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('open'));
    }

    // ─── 移動モード（リスト長押し → ツリーでタップ）─
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
        let panning = false, ox = 0, oy = 0;

        // マウス / タッチパッド パン
        svg.addEventListener('pointerdown', e => {
            if (e.target !== svg && e.target !== gEl) return;
            panning = true;
            ox = e.clientX - pan.x; oy = e.clientY - pan.y;
            svg.style.cursor = 'grabbing';
            svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', e => {
            if (!panning) return;
            pan.x = e.clientX - ox; pan.y = e.clientY - oy;
            applyTransform();
        });
        svg.addEventListener('pointerup',     () => { panning = false; svg.style.cursor = 'grab'; });
        svg.addEventListener('pointercancel', () => { panning = false; svg.style.cursor = 'grab'; });

        // スクロールズーム
        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const r  = svg.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const ns = Math.min(3, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
            pan.x = mx - (mx - pan.x) * (ns / scale);
            pan.y = my - (my - pan.y) * (ns / scale);
            scale = ns; applyTransform();
        }, { passive: false });

        // ピンチズーム（タッチ）
        let lastTouches = null;
        svg.addEventListener('touchstart', e => { lastTouches = Array.from(e.touches); }, { passive: true });
        svg.addEventListener('touchmove', e => {
            if (e.touches.length === 2 && lastTouches?.length === 2) {
                e.preventDefault();
                const [t1, t2] = [e.touches[0], e.touches[1]];
                const nd = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                const od = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX,
                                      lastTouches[0].clientY - lastTouches[1].clientY);
                const ns = Math.min(3, Math.max(0.2, scale * (nd / od)));
                const r  = svg.getBoundingClientRect();
                const mx = (t1.clientX + t2.clientX) / 2 - r.left;
                const my = (t1.clientY + t2.clientY) / 2 - r.top;
                pan.x = mx - (mx - pan.x) * (ns / scale);
                pan.y = my - (my - pan.y) * (ns / scale);
                scale = ns; applyTransform();
            }
            lastTouches = Array.from(e.touches);
        }, { passive: false });
        svg.addEventListener('touchend', () => { lastTouches = null; });
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
    function svgNS(tag)       { return document.createElementNS(NS, tag); }
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
