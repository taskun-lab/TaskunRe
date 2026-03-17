/* =============================================
   ムキムキタスくん - MSC（ムキムキステータスカード）
   ============================================= */

let mscRadarChart = null;
let userMbti = null;
let selectedMbti = null;
let userMscCustomData = null;

let mscData = {
    level: 1,
    exp: 0,
    totalExp: 1000,
    score: 0,
    radarData: { discipline: 0, purpose: 0, curiosity: 0, reflection: 0, action: 0, consistency: 0 },
    strengths: [],
    weaknesses: [],
    bio: ''
};

/**
 * MSC UI初期化
 */
function bindMscUI() {
    const mscOpenBtn = document.getElementById('mscOpenBtn');
    const mscCardView = document.getElementById('msc-card-view');

    function showMsc() {
        mscCardView.classList.add('active');
        mscOpenBtn.classList.add('active');
        mscOpenBtn.textContent = '← 戻る';
    }

    function hideMsc() {
        mscCardView.classList.remove('active');
        mscOpenBtn.classList.remove('active');
        mscOpenBtn.textContent = 'MSC';
    }

    mscOpenBtn.addEventListener('click', () => {
        if (mscCardView.classList.contains('active')) {
            hideMsc();
        } else {
            showMsc();
        }
    });

    const mscBackdrop = document.getElementById('mscModalBackdrop');
    if (mscBackdrop) {
        mscBackdrop.addEventListener('click', hideMsc);
    }
}

/**
 * MSCデータ読み込み
 */
async function loadMscData() {
    // カスタムデータ読み込み
    try {
        const mscRes = await apiCall(`/msc?user_id=${encodeURIComponent(userId)}`);
        if (mscRes) {
            userMscCustomData = mscRes;
            userMbti = userMscCustomData.mbti_type || null;
        }
    } catch (e) {
        userMscCustomData = null;
    }

    await calculateMscFromHabits();
    applyCustomMscData();
    renderMsc();
}

/**
 * カスタムデータ適用
 */
function applyCustomMscData() {
    if (!userMscCustomData) return;

    if (userMscCustomData.custom_strength) {
        mscData.strengths = [{
            key: 'custom',
            name: userMscCustomData.custom_strength.name,
            icon: userMscCustomData.custom_strength.icon || '💪',
            desc: userMscCustomData.custom_strength.desc || '',
            score: mscData.strengths[0]?.score || 3.5
        }];
    }

    if (userMscCustomData.custom_weakness) {
        mscData.weaknesses = [{
            key: 'custom',
            name: userMscCustomData.custom_weakness.name,
            icon: userMscCustomData.custom_weakness.icon || '📝',
            desc: userMscCustomData.custom_weakness.desc || '',
            score: mscData.weaknesses[0]?.score || 2.0
        }];
    }

    if (userMscCustomData.custom_bio) {
        mscData.bio = userMscCustomData.custom_bio;
    }
}

/**
 * 習慣データからMSCスコア計算（Phase2対応版）
 */
async function calculateMscFromHabits() {
    const now = new Date();
    let allMonthlyData = [];

    for (let i = 0; i < 3; i++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        try {
            const data = await apiCall(`/habits/monthly?user_id=${encodeURIComponent(userId)}&year=${year}&month=${month}`);
            if (data.monthly) allMonthlyData = allMonthlyData.concat(data.monthly);
        } catch (e) {}
    }

    // カテゴリ別集計
    const categoryScores = {};
    for (const cat of HABIT_CATEGORIES) categoryScores[cat] = { done: 0, total: 0 };

    // currentHabits（habit.jsで取得済み）を使ってカテゴリマッピング
    const habitsForMapping = typeof currentHabits !== 'undefined' ? currentHabits : [];

    for (const day of allMonthlyData) {
        const completions = day.completions || {};
        for (const [habitId, completed] of Object.entries(completions)) {
            const habit = habitsForMapping.find(h => h.habit_id === habitId);
            const cat = habit?.category;
            if (cat && categoryScores[cat]) {
                categoryScores[cat].total++;
                if (completed) categoryScores[cat].done++;
            }
        }
    }

    // 6軸レーダーデータ
    const radarKeys = ['体力', '知力', '精神力', '節制', '生産性', '活力'];
    const radarValues = radarKeys.map(cat => {
        const s = categoryScores[cat];
        if (!s || s.total === 0) return 0;
        return Math.min(Math.round((s.done / s.total) * 5 * 10) / 10, 5);
    });

    mscData.radarData = {
        discipline: radarValues[3],   // 節制 → 規律力
        purpose: radarValues[4],      // 生産性 → 目的力
        curiosity: radarValues[1],    // 知力 → 探求力
        reflection: radarValues[2],   // 精神力 → 内省力
        action: radarValues[0],       // 体力 → 行動力
        consistency: radarValues[5],  // 活力 → 継続力
    };

    const values = Object.values(mscData.radarData);
    mscData.score = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

    const totalDone = Object.values(categoryScores).reduce((a, b) => a + b.done, 0);
    mscData.exp = totalDone * 10;
    mscData.level = Math.floor(mscData.exp / 500) + 1;
    mscData.totalExp = mscData.level * 500;

    analyzeMscTraits();
}

/**
 * 強み・弱み分析
 */
function analyzeMscTraits() {
    const traits = [
        { key: 'discipline', name: '規律シールド', icon: '🌅', desc: '早起きと禁酒を継続し、規律正しい生活を送っている。' },
        { key: 'purpose', name: '目的ブースト', icon: '🎯', desc: 'ミッション達成への意識が高く、目標に向かって進んでいる。' },
        { key: 'curiosity', name: '探究パワー', icon: '📚', desc: '読書・学習習慣が根付いており、知的好奇心が旺盛。' },
        { key: 'reflection', name: '内省タイム', icon: '📝', desc: 'ジャーナルで振り返りを行い、自己理解を深めている。' },
        { key: 'action', name: '行動エナジー', icon: '💪', desc: 'トレーニングを継続し、行動力を発揮している。' },
        { key: 'consistency', name: '継続マインド', icon: '🔥', desc: '空白日が少なく、コンスタントに取り組んでいる。' }
    ];

    const scores = traits.map(t => ({ ...t, score: mscData.radarData[t.key] }));
    scores.sort((a, b) => b.score - a.score);

    mscData.strengths = scores.filter(s => s.score >= 2.5).slice(0, 1);
    mscData.weaknesses = scores.filter(s => s.score < 3.0).slice(-1);

    generateBioMemo();
}

/**
 * 生態メモ生成
 */
function generateBioMemo() {
    const topTrait = mscData.strengths[0];

    const bios = [
        `${topTrait ? topTrait.name.replace(/シールド|ブースト|パワー|タイム|エナジー|マインド/, '') : '成長'}への情熱を持ち、日々の積み重ねを大切にしている。`,
        '一歩一歩着実に前進し、自分のペースで成長を続けるタイプ。',
        '困難があっても諦めず、粘り強く取り組む姿勢が光る。'
    ];

    if (mscData.radarData.discipline >= 3.5) {
        bios.push('朝型の生活リズムを好み、コツコツと積み上げることを得意とする。');
    }
    if (mscData.radarData.curiosity >= 3.5) {
        bios.push('知識欲が強く、常に新しいことを学ぼうとする姿勢を持つ。');
    }
    if (mscData.radarData.action >= 3.5) {
        bios.push('思い立ったら即行動。エネルギッシュに動き回るタイプ。');
    }

    mscData.bio = bios.slice(0, 2).join('\n');
}

/**
 * MSCレンダリング
 */
function renderMsc() {
    // MBTI
    const mbtiTag = document.getElementById('mscMbtiTag');
    if (userMbti && MBTI_NAMES[userMbti]) {
        mbtiTag.textContent = `${userMbti} (${MBTI_NAMES[userMbti]})`;
    } else {
        mbtiTag.textContent = 'MBTIを設定';
    }

    // レベル
    const levelTitle = LEVEL_TITLES.find(l => mscData.level >= l.min && mscData.level <= l.max)?.title || '見習い';
    document.getElementById('mscLevelBadge').textContent = `Lv.${mscData.level} ${levelTitle}`;

    // スコア・星
    const score = mscData.score || 0;
    const fullStars = Math.floor(score);
    const halfStar = score % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    document.getElementById('mscStars').textContent = '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
    document.getElementById('mscScore').textContent = score.toFixed(2);

    // EXP
    const expInLevel = mscData.exp % 1000;
    document.getElementById('mscExpFill').style.width = `${(expInLevel / 1000) * 100}%`;
    document.getElementById('mscExpText').textContent = `${expInLevel} / 1000 EXP`;

    renderMscRadarChart();

    // 強み
    const strengthsHtml = mscData.strengths.length > 0
        ? mscData.strengths.map(s => `
            <div class="msc-trait-item">
                <div class="msc-trait-label">STRENGTH</div>
                <div class="msc-trait-icon">${s.icon}</div>
                <div class="msc-trait-content">
                    <div class="msc-trait-header">
                        <span class="msc-trait-name">${s.name}</span>
                        <span class="msc-trait-level">Lv.${s.score.toFixed(1)}</span>
                    </div>
                    <div class="msc-trait-desc">${s.desc}</div>
                </div>
            </div>
        `).join('')
        : '<div class="msc-trait-item"><div class="msc-trait-label">STRENGTH</div><div class="msc-trait-icon">📊</div><div class="msc-trait-content"><div class="msc-trait-desc">データを蓄積中...</div></div></div>';
    document.getElementById('mscStrengths').innerHTML = strengthsHtml;

    // 弱み
    const weaknessesHtml = mscData.weaknesses.length > 0
        ? mscData.weaknesses.map(w => `
            <div class="msc-trait-item">
                <div class="msc-trait-label">WEAKNESS</div>
                <div class="msc-trait-icon">${w.icon}</div>
                <div class="msc-trait-content">
                    <div class="msc-trait-header">
                        <span class="msc-trait-name">${w.name}</span>
                        <span class="msc-trait-level">Lv.${w.score.toFixed(1)}</span>
                    </div>
                    <div class="msc-trait-desc">${w.desc.replace('している', 'が課題')}</div>
                </div>
            </div>
        `).join('')
        : '<div class="msc-trait-item"><div class="msc-trait-label">WEAKNESS</div><div class="msc-trait-icon">📊</div><div class="msc-trait-content"><div class="msc-trait-desc">データを蓄積中...</div></div></div>';
    document.getElementById('mscWeaknesses').innerHTML = weaknessesHtml;

    // 生態メモ
    document.getElementById('mscBioText').textContent = mscData.bio || 'まだデータが少ないです。日々のトレーニングを続けて、あなたの特性を分析しましょう。';
}

/**
 * レーダーチャートレンダリング（6軸対応）
 */
function renderMscRadarChart() {
    const ctx = document.getElementById('mscRadarChart').getContext('2d');
    if (mscRadarChart) mscRadarChart.destroy();

    const data = mscData.radarData;
    mscRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['行動力', '探求力', '内省力', '節制力', '生産力', '継続力'],
            datasets: [{
                data: [data.action, data.curiosity, data.reflection, data.discipline, data.purpose, data.consistency],
                backgroundColor: 'rgba(255, 100, 50, 0.15)',
                borderColor: 'rgba(255, 159, 67, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(255, 100, 50, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    min: 0,
                    max: 5,
                    ticks: { stepSize: 1, display: false },
                    grid: { color: 'rgba(255, 100, 50, 0.25)', lineWidth: 1 },
                    angleLines: { color: 'rgba(255, 100, 50, 0.2)' },
                    pointLabels: {
                        color: '#ff9966',
                        font: { family: "'M PLUS Rounded 1c', sans-serif", size: 11, weight: '700' }
                    }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// === MBTI ===
function bindMbtiModalUI() {
    const modal = document.getElementById('mbtiModal');
    const close = () => { modal.classList.remove('visible'); selectedMbti = null; };

    document.getElementById('mbtiBackdrop').onclick = close;
    document.getElementById('mbtiCloseBtn').onclick = close;

    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.mbti-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedMbti = opt.dataset.mbti;
        });
    });

    document.getElementById('mbtiClearBtn').onclick = () => {
        document.querySelectorAll('.mbti-option').forEach(o => o.classList.remove('selected'));
        selectedMbti = null;
    };

    document.getElementById('mbtiSaveBtn').onclick = async () => {
        userMbti = selectedMbti;
        await saveMbti();
        renderMsc();
        close();
    };
}

function openMbtiModal() {
    selectedMbti = userMbti;
    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.mbti === userMbti);
    });
    document.getElementById('mbtiModal').classList.add('visible');
}

async function saveMbti() {
    try {
        await apiCall('/msc', 'POST', { user_id: userId, mbti_type: userMbti });
        if (userMscCustomData) {
            userMscCustomData.mbti_type = userMbti;
        } else {
            userMscCustomData = { mbti_type: userMbti };
        }
    } catch (e) {
        localStorage.setItem(`msc_mbti_${userId}`, userMbti || '');
    }
}

async function saveMscCustomData(data) {
    try {
        const response = await apiCall('/msc', 'POST', { user_id: userId, ...data });
        if (response) {
            if (!userMscCustomData) userMscCustomData = {};
            Object.assign(userMscCustomData, data);
            return true;
        }
    } catch (e) {}
    return false;
}
