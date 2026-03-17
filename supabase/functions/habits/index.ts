import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

const DEFAULT_HABITS = [
  { habit_id: 'early_wake', habit_name: '早起き', category: '活力', icon: '🌅' },
  { habit_id: 'strength', habit_name: '筋トレ', category: '体力', icon: '💪' },
  { habit_id: 'reading', habit_name: '読書', category: '知力', icon: '📚' },
  { habit_id: 'meditation', habit_name: '瞑想', category: '精神力', icon: '🧘' },
  { habit_id: 'no_alcohol', habit_name: '禁酒', category: '節制', icon: '🚫' },
  { habit_id: 'side_work', habit_name: '副業', category: '生産性', icon: '💻' },
];

const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getPast7Dates(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toDateString(d));
  }
  return dates;
}

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

async function getHabitsResponse(supabase: ReturnType<typeof supabaseClient>, user_id: string) {
  const today = toDateString(new Date());
  const past7 = getPast7Dates();
  const weekStart = past7[0];

  // ユーザーの習慣取得
  let { data: userHabits, error: habitsError } = await supabase
    .from('user_habits')
    .select('*')
    .eq('user_id', user_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (habitsError) throw new Error(habitsError.message);

  // 未設定の場合はデフォルト6個を登録
  if (!userHabits || userHabits.length === 0) {
    const inserts = DEFAULT_HABITS.map((h, i) => ({
      user_id,
      habit_id: h.habit_id,
      habit_name: h.habit_name,
      category: h.category,
      icon: h.icon,
      is_active: true,
      sort_order: i + 1,
    }));
    const { data: inserted, error: insertError } = await supabase
      .from('user_habits')
      .upsert(inserts, { onConflict: 'user_id,habit_id' })
      .select('*');
    if (insertError) throw new Error(insertError.message);
    userHabits = inserted ?? [];
  }

  const habitIds = userHabits.map((h) => h.habit_id);

  // 今日のログ取得
  const { data: todayLogs } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', user_id)
    .eq('date', today)
    .in('habit_id', habitIds);

  // 過去7日分のログ取得
  const { data: weekLogs } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', user_id)
    .gte('date', weekStart)
    .lte('date', today)
    .in('habit_id', habitIds);

  const todayMap: Record<string, boolean> = {};
  for (const log of todayLogs ?? []) {
    todayMap[log.habit_id] = log.completed;
  }

  const streakMap: Record<string, number> = {};
  for (const log of todayLogs ?? []) {
    streakMap[log.habit_id] = log.streak ?? 0;
  }

  // week_data: { mon: { habit_id: bool }, ... }
  const weekMap: Record<string, Record<string, boolean>> = {};
  for (const dateStr of past7) {
    const d = new Date(dateStr + 'T00:00:00');
    const key = WEEK_KEYS[d.getDay()];
    weekMap[key] = {};
  }

  for (const log of weekLogs ?? []) {
    const d = new Date(log.date + 'T00:00:00');
    const key = WEEK_KEYS[d.getDay()];
    if (!weekMap[key]) weekMap[key] = {};
    weekMap[key][log.habit_id] = log.completed;
  }

  // week_progress: 今週の完了率
  let totalSlots = 0;
  let completedSlots = 0;
  for (const log of weekLogs ?? []) {
    totalSlots++;
    if (log.completed) completedSlots++;
  }
  const week_progress = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

  const habits = userHabits.map((h) => ({
    habit_id: h.habit_id,
    habit_name: h.habit_name,
    category: h.category,
    icon: h.icon,
    completed: todayMap[h.habit_id] ?? false,
    streak: streakMap[h.habit_id] ?? 0,
  }));

  return { habits, week: weekMap, week_progress };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = supabaseClient();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '');

    // GET /habits/presets
    if (req.method === 'GET' && path.endsWith('/presets')) {
      const { data: presets, error } = await supabase
        .from('habit_presets')
        .select('habit_id, habit_name, category, icon');
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ presets: presets ?? [] });
    }

    // GET /habits/monthly
    if (req.method === 'GET' && path.endsWith('/monthly')) {
      const user_id = url.searchParams.get('user_id');
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      if (!user_id || !year || !month) return errorResponse('user_id, year, month are required', 400);

      const monthStr = month.padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const { data: logs, error } = await supabase
        .from('habit_logs')
        .select('date, habit_id, completed')
        .eq('user_id', user_id)
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) return errorResponse(error.message, 500);

      const dateMap: Record<string, Record<string, boolean>> = {};
      for (const log of logs ?? []) {
        if (!dateMap[log.date]) dateMap[log.date] = {};
        dateMap[log.date][log.habit_id] = log.completed;
      }

      const monthly = Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, completions]) => ({ date, completions }));

      return jsonResponse({ monthly });
    }

    // GET /habits
    if (req.method === 'GET') {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);
      const result = await getHabitsResponse(supabase, user_id);
      return jsonResponse(result);
    }

    // POST /habits/save
    if (req.method === 'POST' && path.endsWith('/save')) {
      const body = await req.json();
      const { user_id, date, habits } = body;
      if (!user_id || !date || !habits) return errorResponse('user_id, date, habits are required', 400);

      const yesterday = toDateString(new Date(new Date(date + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000));

      for (const [habit_id, completed] of Object.entries(habits as Record<string, boolean>)) {
        let streak = 0;
        if (completed) {
          // 前日のストリークを取得
          const { data: prevLog } = await supabase
            .from('habit_logs')
            .select('streak')
            .eq('user_id', user_id)
            .eq('habit_id', habit_id)
            .eq('date', yesterday)
            .single();
          streak = (prevLog?.streak ?? 0) + 1;
        }

        const { error } = await supabase
          .from('habit_logs')
          .upsert(
            { user_id, habit_id, date, completed, streak },
            { onConflict: 'user_id,habit_id,date' },
          );
        if (error) return errorResponse(error.message, 500);
      }

      const result = await getHabitsResponse(supabase, user_id);
      return jsonResponse(result);
    }

    // POST /habits/settings
    if (req.method === 'POST' && path.endsWith('/settings')) {
      const body = await req.json();
      const { user_id, habits } = body;
      if (!user_id || !Array.isArray(habits)) return errorResponse('user_id and habits[] are required', 400);

      // 既存を全て無効化
      await supabase
        .from('user_habits')
        .update({ is_active: false })
        .eq('user_id', user_id);

      // 新しい習慣をupsert
      for (let i = 0; i < habits.length; i++) {
        const h = habits[i];
        const { error } = await supabase
          .from('user_habits')
          .upsert(
            {
              user_id,
              habit_id: h.habit_id,
              habit_name: h.habit_name,
              category: h.category,
              icon: h.icon,
              is_active: true,
              sort_order: i + 1,
            },
            { onConflict: 'user_id,habit_id' },
          );
        if (error) return errorResponse(error.message, 500);
      }

      return jsonResponse({ success: true });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
