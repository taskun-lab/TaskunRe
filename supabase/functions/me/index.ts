import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    const user_id = url.searchParams.get('user_id');
    if (!user_id) return errorResponse('user_id is required', 400);

    // ユーザー検索
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return errorResponse(error.message, 500);
    }

    // 存在しない場合は初回登録
    if (!user) {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          user_id,
          role: 'user',
          plan_code: 'free',
          task_limit: 10,
          can_status: false,
          can_journal: false,
          subscription_status: null,
          current_period_end: null,
        })
        .select('*')
        .single();

      if (insertError) return errorResponse(insertError.message, 500);
      user = newUser;
    }

    // developer/admin はフル権限
    const isPrivileged = user.role === 'developer' || user.role === 'admin';

    return jsonResponse({
      user_id: user.user_id,
      role: user.role,
      plan_code: user.plan_code,
      task_limit: isPrivileged ? 9999 : user.task_limit,
      can_status: isPrivileged ? true : user.can_status,
      can_journal: isPrivileged ? true : user.can_journal,
      subscription_status: user.subscription_status,
      current_period_end: user.current_period_end,
    });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
