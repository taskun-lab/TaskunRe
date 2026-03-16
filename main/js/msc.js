/* =============================================
   ムキムキタスくん３ - MSC（ムキムキステータスカード）
   ============================================= */

let mscData = null;
let userMbti = null;
let selectedMbti = null;
let userMscCustomData = null;
let mscRadarChart = null;

async function loadMscData() {
    try {
        const [mscRes, ...monthlyResults] = await Promise.all([
            apiCall(`/msc?user_id=${encodeURIComponent(userId)}`),
            ...[-2, -1, 0].map(offset => {
                const d = new Date();
                d.setMonth(d.getMonth() + offset);
                return loadMonthlyData(d.getFullYear(), d.getMonth() + 1);
            })
        ]);
        userMbti = mscRes.mbti_type || null;
        userMscCustomData = mscRes;
        calculateMscFromHabits(monthlyResults.filter(Boolean));
        renderMsc();
    } catch (e) {
        console.error('loadMscData error:', e);
    }
}

function calculateMscFromHabits(monthlyDataList) {
    // カテゴリ別達成率集計
    const categoryScores = {};
    HABIT_CATEGORIES.forEach(cat => { categoryScores[cat] = { total: 0, done: 0 }; });

    monthlyDataList.forEach(monthData => {
        if (!monthData?.monthly) return;
        monthData.monthly.forEach(dayData => {
            Object.entries(dayData.completions || {}).forEach(([habitId, completed]) => {
                const habit = userHabits.find(h => h.habit_id === habitId);
                if (!habit) return;
                categoryScores[habit.category].total++;
                if (completed) categoryScores[habit.category].done++;
            });
        });
    });

    const radarData = HABIT_CATEGORIES.map(cat => {
        const s = categoryScores[cat];
        return s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    });

    const totalScore = Math.round(radarData.reduce((a, b) => a + b, 0) / HABIT_CATEGORIES.length);
    const level = getLevelFromScore(totalScore);

    mscData = { radarData, totalScore, level };
}

function getLevelFromScore(score) {
    const levelNum = Math.floor(score / 10) + 1;
    const capped = Math.min(levelNum, 101);
    const titleObj = LEVEL_TITLES.find(t => capped >= t.min && capped <= t.max);
    return { num: capped, title: titleObj?.title || 'ムキムキ神' };
}

function analyzeMscTraits(radarData) {
    const indexed = HABIT_CATEGORIES.map((cat, i) => ({ cat, score: radarData[i] }));
    indexed.sort((a, b) => b.score - a.score);
    return { strength: indexed[0], weakness: indexed[indexed.length - 1] };
}

function renderMsc() {
    if (!mscData) return;
    const { radarData, totalScore, level } = mscData;
    const { strength, weakness } = analyzeMscTraits(radarData);

    // レベル・スコア表示
    const levelEl = document.getElementById('mscLevelBadge');
    if (levelEl) levelEl.textContent = `Lv.${level.num} ${level.title}`;
    const scoreEl = document.getElementById('mscScore');
    if (scoreEl) scoreEl.textContent = totalScore;

    // MBTI
    const mbtiEl = document.getElementById('mscMbtiTag');
    if (mbtiEl) {
        mbtiEl.textContent = userMbti ? `${userMbti} - ${MBTI_NAMES[userMbti] || ''}` : 'MBTIを設定';
        mbtiEl.onclick = () => openMbtiModal();
    }

    // 強み・弱み
    const strEl = document.getElementById('mscStrengths');
    const weakEl = document.getElementById('mscWeaknesses');
    if (strEl) strEl.textContent = userMscCustomData?.custom_strength_name || strength.cat;
    if (weakEl) weakEl.textContent = userMscCustomData?.custom_weakness_name || weakness.cat;

    renderMscRadarChart(radarData);
}

function renderMscRadarChart(radarData) {
    const canvas = document.getElementById('mscRadarChart');
    if (!canvas) return;
    if (mscRadarChart) { mscRadarChart.destroy(); mscRadarChart = null; }
    mscRadarChart = new Chart(canvas, {
        type: 'radar',
        data: {
            labels: HABIT_CATEGORIES,
            datasets: [{
                data: radarData,
                backgroundColor: 'rgba(255,159,67,0.2)',
                borderColor: '#ff9f43',
                borderWidth: 2,
                pointBackgroundColor: '#ff9f43',
            }]
        },
        options: {
            responsive: true,
            scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.1)' } } },
            plugins: { legend: { display: false } }
        }
    });
}

function openMbtiModal() {
    selectedMbti = userMbti;
    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.mbti === selectedMbti);
    });
    document.getElementById('mbtiModal').style.display = 'flex';
}

function bindMbtiModalUI() {
    const modal = document.getElementById('mbtiModal');
    if (!modal) return;
    document.getElementById('mbtiCloseBtn').onclick = () => modal.style.display = 'none';
    document.getElementById('mbtiBackdrop').onclick = () => modal.style.display = 'none';
    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.onclick = () => {
            selectedMbti = opt.dataset.mbti;
            document.querySelectorAll('.mbti-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        };
    });
    document.getElementById('mbtiSaveBtn').onclick = saveMbti;
}

async function saveMbti() {
    if (!selectedMbti) return;
    try {
        await apiCall('/msc', 'POST', { user_id: userId, mbti_type: selectedMbti });
        userMbti = selectedMbti;
        document.getElementById('mbtiModal').style.display = 'none';
        renderMsc();
    } catch (e) {
        console.error('saveMbti error:', e);
    }
}

function bindMscUI() {
    const openBtn = document.getElementById('mscOpenBtn');
    if (!openBtn) return;
    openBtn.onclick = () => {
        const card = document.getElementById('msc-card-view');
        const log = document.getElementById('msc-log-view');
        const isCardVisible = card.style.display !== 'none';
        card.style.display = isCardVisible ? 'none' : 'block';
        log.style.display = isCardVisible ? 'block' : 'none';
        openBtn.textContent = isCardVisible ? 'カードを見る' : '閉じる';
    };
}
