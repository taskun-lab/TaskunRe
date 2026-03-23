/* =============================================
   ムキムキタスくん - ツリービュー（SVGキャンバス v5）
   横展開 / コズミックダーク / ノードD&D / エッジ操作 / 位置記憶
   ============================================= */

(function () {
    const btnList       = document.getElementById('btnViewList');
    const btnTree       = document.getElementById('btnViewTree');
    const listView      = document.getElementById('listView');
    const treeView      = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');

    if (!btnList || !btnTree) return;

    // ─── 定数 ────────────────────────────────────
    const QUEST_R   = 22;
    const TASK_R    = 14;
    const V_GAP     = 80;
    const H_GAP     = 190;
    const MAX_CHARS = 13;
    const NS        = 'http://www.w3.org/2000/svg';
    const DRAG_THR  = 6;
    const DETECT_R  = 90;
    const ACTIVATE  = 42;

    const C = {
        bg       : '#080818',
        edge     : 'rgba(100,120,255,0.35)',
        edgeDone : 'rgba(60,60,100,0.25)',
        quest    : '#ff9f43',
        task     : '#7c8aff',
        done     : '#4ade80',
        drop     : '#ff4757',
        hint     : '#4c5bd4',
        hintLine : 'rgba(100,130,255,0.5)',
        label    : '#d8e4ff',
        muted    : '#5a6a9a',
        badge    : '#4c5bd4',
    };

    let pan          = { x: 50, y: 60 };
    let scale        = 1;
    let svgEl        = null;
    let gEl          = null;
    let hintGroup    = null;
    let moveMode     = null;
    let collapsed    = new Set();
    let lastData     = null;
    let layoutMapRef = null;
    let activeHint   = null;
    let nodeOffsets  = new Map();
    let rafId        = null;  // requestAnimationFrame handle for transform

    const SS = {
        savePZ  : () => { try { sessionStorage.setItem('treePZ', JSON.stringify({ x: pan.x, y: pan.y, s: scale })); } catch (_) {} },
        loadPZ  : () => { try { const d = JSON.parse(sessionStorage.getItem('treePZ') || 'null'); if (d) { pan.x = d.x; pan.y = d.y; scale = d.s; } } catch (_) {} },
        saveOff : () => { try { sessionStorage.setItem('treeOff', JSON.stringify([...nodeOffsets])); } catch (_) {} },
        loadOff : () => { try { const d = JSON.parse(sessionStorage.getItem('treeOff') || 'null'); if (d) nodeOffsets = new Map(d); } catch (_) {} },
    };

    // ─── ビュー切替 ──────────────────────────────
    btnList.addEventListener('click', () => {
        exitMoveMode();
        btnList.classList.add('active'); btnTree.classList.remove('active');
        listView.style.display = ''; treeView.style.display = 'none';
        window._treeViewActive = false;
    });

    btnTree.addEventListener('click', async () => {
        btnTree.classList.add('active'); btnList.classList.remove('active');
        listView.style.display = 'none'; treeView.style.display = '';
        window._treeViewActive = true;
        await renderTree();
    });

    // ─── ツリー描画 ──────────────────────────────
    async function renderTree() {
        if (!svgEl || !svgEl.isConnected) {
            treeContainer.innerHTML = '';
            initSvg();
            SS.loadPZ(); SS.loadOff();
        }
        try {
            const data = await apiCall(`/tasks/tree?user_id=${encodeURIComponent(userId)}`);
            lastData = data;
            if (!data || data.length === 0) {
                gEl.innerHTML = ''; hintGroup = null;
                const t = svgEl_('text', { x: '50%', y: '50%', 'text-anchor': 'middle',
                    'dominant-baseline': 'middle', fill: C.muted, 'font-size': 14 });
                t.textContent = 'タスクがありません';
                gEl.appendChild(t); return;
            }
            redraw(data);
        } catch (e) {
            if (gEl) gEl.innerHTML = '';
            hintGroup = null;
        }
    }

    function redraw(data) {
        if (!gEl) return;
        gEl.innerHTML = ''; hintGroup = null; activeHint = null;

        const layout = computeLayout(data);
        layout.forEach(item => {
            const off = nodeOffsets.get(item.node.id);
            if (off) { item.x += off.dx; item.y += off.dy; }
        });
        layoutMapRef = new Map(layout.map(i => [i.node.id, i]));

        const eg = svgNS('g'); const ng = svgNS('g'); const hg = svgNS('g');
        hintGroup = hg;
        gEl.appendChild(eg); gEl.appendChild(ng); gEl.appendChild(hg);

        layout.forEach(({ node, x, y }) => {
            if (!collapsed.has(node.id)) {
                (node.children || []).forEach(child => {
                    const ci = layoutMapRef.get(child.id);
                    if (ci) drawEdge(eg, x, y, ci.x, ci.y, node, child);
                });
            }
            drawNode(ng, node, x, y);
        });
        applyTransform();
    }

    // ─── SVG 初期化 ──────────────────────────────
    function initSvg() {
        treeContainer.style.cssText =
            'overflow:hidden;position:relative;overscroll-behavior:none;touch-action:none;';
        treeContainer.style.height = `${window.innerHeight - 140}px`;

        svgEl = svgNS('svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.cssText =
            `display:block;touch-action:none;cursor:grab;background:${C.bg};` +
            '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';

        const defs = svgNS('defs');
        addGlow(defs, 'gq', 8); addGlow(defs, 'gt', 5);
        addGlow(defs, 'gd', 6); addGlow(defs, 'gdr', 10); addGlow(defs, 'gh', 7);
        svgEl.appendChild(defs);

        gEl = svgNS('g');
        // CSS transform で GPU 合成レイヤーに昇格 → ズームぶれ軽減
        gEl.style.willChange = 'transform';
        gEl.style.transformOrigin = '0 0';
        svgEl.appendChild(gEl);
        treeContainer.appendChild(svgEl);

        setupPanZoom(svgEl);

        svgEl.addEventListener('click', e => {
            if (e.target === svgEl || e.target === gEl) {
                document.getElementById('tree-detail-overlay')?.remove();
                document.getElementById('tree-edge-menu')?.remove();
            }
        });
    }

    function addGlow(defs, id, blur) {
        const f = svgNS('filter');
        f.setAttribute('id', id);
        f.setAttribute('x', '-60%'); f.setAttribute('y', '-60%');
        f.setAttribute('width', '220%'); f.setAttribute('height', '220%');
        const fe = svgNS('feGaussianBlur');
        fe.setAttribute('in', 'SourceGraphic'); fe.setAttribute('stdDeviation', blur); fe.setAttribute('result', 'blur');
        const fm = svgNS('feMerge');
        const n1 = svgNS('feMergeNode'); n1.setAttribute('in', 'blur');
        const n2 = svgNS('feMergeNode'); n2.setAttribute('in', 'SourceGraphic');
        fm.appendChild(n1); fm.appendChild(n2);
        f.appendChild(fe); f.appendChild(fm);
        defs.appendChild(f);
    }

    // ─── レイアウト計算 ────────────────────────────
    function computeLayout(nodes) {
        const all = [];
        let leaf = 0;
        function visit(node, depth, parentId) {
            const kids = collapsed.has(node.id) ? [] : (node.children || []);
            const info = { node, depth, x: depth * H_GAP, y: 0, parentId };
            all.push(info);
            if (kids.length === 0) { info.y = leaf++ * V_GAP; }
            else { const s = leaf; kids.forEach(c => visit(c, depth + 1, node.id)); info.y = ((s + leaf - 1) * V_GAP) / 2; }
        }
        nodes.forEach(n => visit(n, 0, null));
        return all;
    }

    // ─── ノード描画 ───────────────────────────────
    function drawNode(parent, node, x, y) {
        const isDone  = node.complete_at === 1;
        const isQuest = node.task_type === 'mission';
        const isDrop  = moveMode && !isDone && node.id !== moveMode.taskId;
        const hasKids = (node.children || []).length > 0;
        const R = isQuest ? QUEST_R : TASK_R;

        const g = svgNS('g');
        g.style.cursor = 'grab';

        const fill = isDone ? C.done : isDrop ? C.drop : isQuest ? C.quest : C.task;
        const gid  = isDone ? 'gd'   : isDrop ? 'gdr'  : isQuest ? 'gq'   : 'gt';
        g.appendChild(svgEl_('circle', { cx: x, cy: y, r: R, fill,
            stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1.5, filter: `url(#${gid})` }));

        if (isQuest || isDone) {
            const ic = svgEl_('text', { x, y: y + 1, 'text-anchor': 'middle',
                'dominant-baseline': 'middle', 'font-size': isQuest ? 13 : 9,
                fill: 'white', 'pointer-events': 'none' });
            ic.textContent = isDone ? '✓' : '🎯';
            g.appendChild(ic);
        }

        const te = svgEl_('text', { x: x + R + 8, y: isDone ? y - 6 : y,
            'dominant-baseline': 'middle', 'font-size': isQuest ? 13 : 12,
            'font-weight': isQuest ? 700 : 400,
            fill: isDone ? C.muted : C.label, 'pointer-events': 'none' });
        te.textContent = truncate(node.task_name || '(無題)', MAX_CHARS);
        if (isDone) te.setAttribute('text-decoration', 'line-through');
        g.appendChild(te);

        if (isDone && node.completed_at) {
            const de = svgEl_('text', { x: x + R + 8, y: y + 7, 'dominant-baseline': 'middle',
                'font-size': 10, fill: C.muted, 'pointer-events': 'none' });
            de.textContent = fmtDate(node.completed_at);
            g.appendChild(de);
        }

        if (hasKids) {
            const bx = x + R - 4, by = y - R + 4, isCol = collapsed.has(node.id);
            const bc = svgEl_('circle', { cx: bx, cy: by, r: 8,
                fill: C.badge, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1 });
            const bt = svgEl_('text', { x: bx, y: by + 1, 'text-anchor': 'middle',
                'dominant-baseline': 'middle', 'font-size': 11, fill: 'white',
                'font-weight': 700, 'pointer-events': 'none' });
            bt.textContent = isCol ? '+' : '−';
            bc.style.cursor = 'pointer';
            bc.addEventListener('pointerdown', e => e.stopPropagation());
            bc.addEventListener('click', e => {
                e.stopPropagation();
                isCol ? collapsed.delete(node.id) : collapsed.add(node.id);
                if (lastData) redraw(lastData);
            });
            g.appendChild(bc); g.appendChild(bt);
        }

        // D&D
        let tapOk = true, dragging = false, pressed = false, startPx = 0, startPy = 0;

        g.addEventListener('pointerdown', e => {
            e.stopPropagation();
            pressed = true; tapOk = true; dragging = false;
            startPx = e.clientX; startPy = e.clientY;
            g.setPointerCapture(e.pointerId);
        });

        g.addEventListener('pointermove', e => {
            if (!pressed) return;
            const sdx = (e.clientX - startPx), sdy = (e.clientY - startPy);
            if (!dragging && Math.hypot(sdx, sdy) > DRAG_THR) { dragging = true; tapOk = false; }
            if (!dragging) return;
            g.style.cursor = 'grabbing';
            g.setAttribute('transform', `translate(${sdx / scale},${sdy / scale})`);
            updateHints(node.id, x + sdx / scale, y + sdy / scale);
        });

        g.addEventListener('pointerup', async e => {
            pressed = false;
            if (dragging) {
                const sdx = (e.clientX - startPx) / scale;
                const sdy = (e.clientY - startPy) / scale;
                dragging = false; g.style.cursor = 'grab';
                g.removeAttribute('transform');
                const hint = activeHint; clearHints();
                if (hint) {
                    await reparentNode(node.id, hint.targetId);
                } else {
                    const cur = nodeOffsets.get(node.id) || { dx: 0, dy: 0 };
                    nodeOffsets.set(node.id, { dx: cur.dx + sdx, dy: cur.dy + sdy });
                    SS.saveOff();
                    if (lastData) redraw(lastData);
                }
                return;
            }
            if (!tapOk) return;
            if (moveMode) {
                if (!isDone && node.id !== moveMode.taskId) doReparent(moveMode.taskId, node.id);
                return;
            }
            showDetail(node);
        });

        g.addEventListener('pointercancel', () => {
            pressed = false; dragging = false;
            g.removeAttribute('transform'); clearHints();
        });

        parent.appendChild(g);
    }

    // ─── エッジ（クリック可能）────────────────────
    function drawEdge(parent, px, py, cx, cy, pNode, cNode) {
        const R1 = pNode.task_type === 'mission' ? QUEST_R : TASK_R;
        const R2 = cNode.task_type === 'mission' ? QUEST_R : TASK_R;
        const bothDone = pNode.complete_at === 1 && cNode.complete_at === 1;
        const mx = (px + R1 + cx - R2) / 2;
        const d = `M${px + R1},${py} C${mx},${py} ${mx},${cy} ${cx - R2},${cy}`;

        // 視覚エッジ
        parent.appendChild(svgEl_('path', {
            d, fill: 'none',
            stroke: bothDone ? C.edgeDone : C.edge,
            'stroke-width': 1.5, 'pointer-events': 'none',
        }));

        // 広いヒット領域（透明・クリック可能）
        const hit = svgEl_('path', {
            d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, cursor: 'pointer',
        });
        hit.addEventListener('click', e => {
            e.stopPropagation();
            showEdgeMenu(e.clientX, e.clientY, pNode, cNode);
        });
        parent.appendChild(hit);
    }

    // ─── エッジメニュー ───────────────────────────
    function showEdgeMenu(screenX, screenY, pNode, cNode) {
        document.getElementById('tree-edge-menu')?.remove();
        const menu = document.createElement('div');
        menu.id = 'tree-edge-menu';
        menu.style.cssText =
            `position:fixed;left:${screenX + 8}px;top:${screenY - 8}px;z-index:300;` +
            'background:#0d0d2b;border:1px solid rgba(100,120,255,0.3);border-radius:10px;' +
            'padding:4px;box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:140px;';
        menu.innerHTML = `
            <button class="edge-menu-btn" data-act="disconnect">🔗 接続解除</button>
            <button class="edge-menu-btn" data-act="collapse">🙈 子を隠す</button>`;

        menu.querySelectorAll('.edge-menu-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation(); menu.remove();
                if (btn.dataset.act === 'disconnect') {
                    await reparentNode(cNode.id, null);
                } else {
                    collapsed.add(cNode.id);
                    if (lastData) redraw(lastData);
                }
            });
        });

        document.body.appendChild(menu);
        const closeMenu = e => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    // ─── D&D ヒント ──────────────────────────────
    function updateHints(draggedId, cx, cy) {
        if (!hintGroup) return;
        hintGroup.innerHTML = ''; activeHint = null;

        let nearest = null, nearestDist = DETECT_R;
        layoutMapRef?.forEach((item, id) => {
            if (id === draggedId) return;
            const d = Math.hypot(cx - item.x, cy - item.y);
            if (d < nearestDist) { nearestDist = d; nearest = item; }
        });
        if (!nearest) return;

        const { node: tgt, x: tx, y: ty } = nearest;
        const childHX = tx + H_GAP * 0.48, childHY = ty;
        const toChild = Math.hypot(cx - childHX, cy - childHY);
        const active  = toChild < ACTIVATE;

        hintGroup.appendChild(svgEl_('line', {
            x1: tx, y1: ty, x2: cx, y2: cy,
            stroke: C.hintLine, 'stroke-width': 1.5, 'stroke-dasharray': '5,4', 'pointer-events': 'none',
        }));

        const r = active ? 15 : 11;
        hintGroup.appendChild(svgEl_('circle', {
            cx: childHX, cy: childHY, r, fill: active ? C.hint : 'rgba(76,91,212,0.45)',
            stroke: active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
            'stroke-width': active ? 2 : 1,
            ...(active ? { filter: 'url(#gh)' } : {}), 'pointer-events': 'none',
        }));
        const lt = svgEl_('text', { x: childHX, y: childHY + 1, 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'font-size': active ? 18 : 14,
            fill: 'white', 'font-weight': 700, 'pointer-events': 'none' });
        lt.textContent = '+';
        hintGroup.appendChild(lt);
        if (active) {
            const lab = svgEl_('text', { x: childHX + r + 4, y: childHY,
                'dominant-baseline': 'middle', 'font-size': 10, fill: '#8090d0', 'pointer-events': 'none' });
            lab.textContent = '子へ';
            hintGroup.appendChild(lab);
            activeHint = { targetId: tgt.id };
        }
    }

    function clearHints() { if (hintGroup) hintGroup.innerHTML = ''; activeHint = null; }

    // ─── reparentNode ──────────────────────────
    async function reparentNode(taskId, newParentId) {
        nodeOffsets.delete(taskId); SS.saveOff();
        try {
            await apiCall('/tasks/action', 'POST', {
                user_id: userId, action: 'reparent',
                task_id: taskId, parent_task_id: newParentId ?? null,
            });
            await renderTree(); loadList();
        } catch (e) {
            const msg = String(e?.message || e?.error || e);
            if (msg.includes('MAX_DEPTH') || msg.includes('depth') || msg.includes('5')) {
                showToast('⚠ 5階層を超えるため移動できません');
            } else {
                showToast('⚠ 接続に失敗しました');
            }
            if (lastData) redraw(lastData);
        }
    }

    // ─── トースト通知 ──────────────────────────
    function showToast(msg) {
        document.querySelectorAll('.tree-toast').forEach(t => t.remove());
        const t = document.createElement('div');
        t.className = 'tree-toast';
        t.textContent = msg;
        treeView.appendChild(t);
        requestAnimationFrame(() => t.classList.add('visible'));
        setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 2800);
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
            if (node.completed_at) html += `<div class="tree-detail-row">📅 <b>完了日</b> ${fmtDate(node.completed_at)}</div>`;
        } else if (kids.length > 0) {
            const pct = Math.round(doneK / kids.length * 100);
            html += `<div class="tree-detail-row">📊 <b>進捗</b> ${doneK}/${kids.length} (${pct}%)</div>
                     <div class="tree-progress-bar"><div class="tree-progress-fill" style="width:${pct}%"></div></div>`;
        }
        if (node.reason)      html += `<div class="tree-detail-row">💡 ${escapeHtml(node.reason)}</div>`;
        if (node.target_date) html += `<div class="tree-detail-row">🗓 <b>目標日</b> ${node.target_date}</div>`;
        if (node.journal_id)  html += `<button class="tree-journal-btn" data-jid="${escapeHtml(node.journal_id)}">📝 ジャーナルを見る</button>`;
        if (!isDone && depth < 4) {
            html += `<div class="tree-add-sub-row">
                <input type="text" class="form-input tree-add-sub-input"
                    placeholder="サブタスクを追加…"
                    style="flex:1;margin:0;background:#131330;color:#d8e4ff;border-color:#2a2a6a;" />
                <button class="tree-add-sub-btn">＋</button>
            </div>`;
        }
        html += '</div>';
        ov.innerHTML = html;

        ov.querySelector('.tree-overlay-close').addEventListener('click', () => ov.remove());
        ov.querySelector('.tree-journal-btn')?.addEventListener('click', e => {
            openJournalEntry(e.currentTarget.dataset.jid); ov.remove();
        });
        const inp = ov.querySelector('.tree-add-sub-input');
        const btn = ov.querySelector('.tree-add-sub-btn');
        if (inp && btn) {
            const doAdd = async () => {
                const name = inp.value.trim(); if (!name) return;
                inp.value = ''; btn.disabled = true;
                try {
                    await apiCall('/tasks/action', 'POST', {
                        user_id: userId, action: 'add_subtask',
                        task_name: name, parent_task_id: node.id,
                    });
                    ov.remove(); await renderTree(); loadList();
                } catch (err) { console.error(err); }
                finally { btn.disabled = false; }
            };
            btn.addEventListener('click', doAdd);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        }
        treeView.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('open'));
    }

    // ─── 移動モード ───────────────────────────────
    function showMoveBanner(taskName) {
        document.getElementById('tree-move-banner')?.remove();
        const b = document.createElement('div');
        b.id = 'tree-move-banner';
        b.innerHTML = `<span>「${escapeHtml(taskName)}」をどのノードに移動？</span><button id="tree-move-cancel">×</button>`;
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
            await renderTree(); loadList();
        } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes('MAX_DEPTH')) showToast('⚠ 5階層を超えるため移動できません');
            else alert('移動に失敗しました');
        }
    }

    // ─── パン・ズーム ─────────────────────────────
    // rAF でバッチ処理 → ズームぶれ軽減（MindMeister方式と同様）
    function applyTransform() {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            if (!gEl) return;
            // CSS transform（GPU合成）で適用
            gEl.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
        });
    }

    function setupPanZoom(svg) {
        let panning = false, ox = 0, oy = 0, lastTouches = null;

        svg.addEventListener('touchstart', e => { e.stopPropagation(); lastTouches = Array.from(e.touches); }, { passive: true });

        svg.addEventListener('touchmove', e => {
            e.preventDefault(); e.stopPropagation();
            if (e.touches.length === 2 && lastTouches?.length === 2) {
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
                scale = ns; applyTransform(); SS.savePZ();
            }
            lastTouches = Array.from(e.touches);
        }, { passive: false });

        svg.addEventListener('touchend',    () => { lastTouches = null; });
        svg.addEventListener('touchcancel', () => { lastTouches = null; });

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
        svg.addEventListener('pointerup', () => {
            if (panning) { panning = false; svg.style.cursor = 'grab'; SS.savePZ(); }
        });
        svg.addEventListener('pointercancel', () => { panning = false; svg.style.cursor = 'grab'; });

        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const r  = svg.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const ns = Math.min(3, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
            pan.x = mx - (mx - pan.x) * (ns / scale);
            pan.y = my - (my - pan.y) * (ns / scale);
            scale = ns; applyTransform(); SS.savePZ();
        }, { passive: false });
    }

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

    function svgNS(tag)         { return document.createElementNS(NS, tag); }
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

    window.refreshTreeIfVisible = () => {
        if (treeView?.style.display !== 'none') renderTree();
    };
    window.enterMoveMode = (taskId, taskName) => {
        moveMode = { taskId, taskName };
        window._treeViewActive = true;
        btnTree.classList.add('active'); btnList.classList.remove('active');
        listView.style.display = 'none'; treeView.style.display = '';
        renderTree().then(() => showMoveBanner(taskName));
    };
})();
