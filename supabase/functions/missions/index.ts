import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = supabaseClient();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '');
    const today = toDateString(new Date());

    // GET /missions?user_id=xxx
    if (req.method === 'GET') {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);

      // アクティブなミッション取得
      const { data: missions, error: missionError } = await supabase
        .from('missions')
        .select('id, title, description, difficulty, xp_bonus, expires_at')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (missionError) return errorResponse(missionError.message, 500);

      const mission = missions && missions.length > 0 ? missions[0] : null;

      if (!mission) {
        return jsonResponse({ mission: null, completed_today: false, today_completions: 0 });
      }

      // 今日のユーザー完了チェック
      const { data: userCompletion } = await supabase
        .from('mission_completions')
        .select('id')
        .eq('user_id', user_id)
        .eq('mission_id', mission.id)
        .eq('completed_date', today)
        .single();

      // 今日の達成者数
      const { count: todayCount } = await supabase
        .from('mission_completions')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', mission.id)
        .eq('completed_date', today);

      return jsonResponse({
        mission,
        completed_today: !!userCompletion,
        today_completions: todayCount ?? 0,
      });
    }

    // POST /missions/complete
    if (req.method === 'POST' && path.endsWith('/complete')) {
      const body = await req.json();
      const { user_id, mission_id } = body;
      if (!user_id || !mission_id) return errorResponse('user_id and mission_id are required', 400);

      const { error } = await supabase
        .from('mission_completions')
        .insert({ user_id, mission_id, completed_date: today });

      // UNIQUE制約違反は重複とみなして無視
      if (error && !error.message.includes('duplicate') && error.code !== '23505') {
        return errorResponse(error.message, 500);
      }

      return jsonResponse({ success: true });
    }

    // POST /missions/uncomplete
    if (req.method === 'POST' && path.endsWith('/uncomplete')) {
      const body = await req.json();
      const { user_id, mission_id } = body;
      if (!user_id || !mission_id) return errorResponse('user_id and mission_id are required', 400);

      const { error } = await supabase
        .from('mission_completions')
        .delete()
        .eq('user_id', user_id)
        .eq('mission_id', mission_id)
        .eq('completed_date', today);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
