/* =============================================
   ムキムキタスくん３ - 設定・定数
   ============================================= */

// === 環境判定 ===
const ENV = (() => {
    const h = window.location.hostname;
    if (h.includes('ngrok-free.dev') || h === 'localhost' || h === '127.0.0.1') return 'DEV';
    return 'PROD';
})();

// === LIFF設定 ===
const LIFF_ID = ENV === 'DEV'
    ? "<DEV_LIFF_ID>"    // ← LINE Developers Console で作成したDEV用LIFF ID
    : "<PROD_LIFF_ID>";  // ← LINE Developers Console で作成したPROD用LIFF ID

// === Supabase設定 ===
const SUPABASE_URL = "https://ixsfyxhvwcevsvobsted.supabase.co";   // 末尾スラッシュなし
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4c2Z5eGh2d2NldnN2b2JzdGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDEyODMsImV4cCI6MjA4OTIxNzI4M30.1Ib0oPHMJM2CzL2mM7q0QJ6dAxJa_JNAM4mXF4vRBf4";
const API_BASE = `${SUPABASE_URL}/functions/v1`;

// === プラン説明ページ ===
const PLAN_PAGE_URL = "https://taskun-lab.github.io/Planspage/";

// === 開発者制限（DEVのみ）===
const DEV_ALLOWED_USER_ID = "<YOUR_LINE_USER_ID>"; // 初回DEV起動後に自分のuserIdに差し替え

// === スワイプ設定 ===
const SWIPE_CONFIG = {
    LOCK_THRESHOLD: 10,
    LOCK_ANGLE_RATIO: 1.2,
    SNAP_THRESHOLD_RATIO: 0.1,
    VELOCITY_THRESHOLD: 0.5,
    FULL_SWIPE_RATIO: 0.45,
    RUBBER_BAND_FACTOR: 0.35,
    SNAP_DURATION: 500,
    SNAP_EASING: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    TAP_SLOP: 8,
    VELOCITY_SAMPLE_COUNT: 3,
};

// === 習慣カテゴリ（6軸固定） ===
const HABIT_CATEGORIES = ['体力', '知力', '精神力', '節制', '生産性', '活力'];

// === MBTI ===
const MBTI_NAMES = {
    'INTJ': '建築家', 'INTP': '論理学者', 'ENTJ': '指揮官', 'ENTP': '討論者',
    'INFJ': '提唱者', 'INFP': '仲介者', 'ENFJ': '主人公', 'ENFP': '広報運動家',
    'ISTJ': '管理者', 'ISFJ': '擁護者', 'ESTJ': '幹部', 'ESFJ': '領事官',
    'ISTP': '巨匠', 'ISFP': '冒険家', 'ESTP': '起業家', 'ESFP': 'エンターテイナー'
};

// === レベル称号 ===
const LEVEL_TITLES = [
    { min: 1,   max: 5,   title: '見習いトレーニー' },
    { min: 6,   max: 10,  title: 'ルーキーファイター' },
    { min: 11,  max: 20,  title: 'レギュラーウォリアー' },
    { min: 21,  max: 35,  title: 'シルバーチャンピオン' },
    { min: 36,  max: 50,  title: 'ゴールドマスター' },
    { min: 51,  max: 75,  title: 'プラチナエリート' },
    { min: 76,  max: 100, title: 'ダイヤモンドレジェンド' },
    { min: 101, max: 999, title: 'ムキムキ神' }
];

// === タスク関連定数 ===
const STRONG_RATIO = SWIPE_CONFIG.FULL_SWIPE_RATIO;
