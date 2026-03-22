import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = supabaseClient();

    // GET /app-config
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('app_config')
        .select('gating_enabled, billing_enabled, debug_menu_enabled, updated_at')
        .eq('id', 1)
        .single();

      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    // PATCH /app-config
    if (req.method === 'PATCH') {
      const body = await req.json();
      const { user_id, gating_enabled, billing_enabled, debug_menu_enabled } = body;

      if (!user_id) return errorResponse('user_id is required', 400);

      // 権限チェック
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', user_id)
        .single();

      if (userError) return errorResponse(userError.message, 500);
      if (!userRow || (userRow.role !== 'developer' && userRow.role !== 'admin')) {
        return errorResponse('Forbidden', 403);
      }

      // 現在値取得
      const { data: current, error: currentError } = await supabase
        .from('app_config')
        .select('gating_enabled, billing_enabled, debug_menu_enabled')
        .eq('id', 1)
        .single();

      if (currentError) return errorResponse(currentError.message, 500);

      // マージ
      const newConfig = {
        gating_enabled: gating_enabled !== undefined ? gating_enabled : current.gating_enabled,
        billing_enabled: billing_enabled !== undefined ? billing_enabled : current.billing_enabled,
        debug_menu_enabled: debug_menu_enabled !== undefined ? debug_menu_enabled : current.debug_menu_enabled,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await supabase
        .from('app_config')
        .update(newConfig)
        .eq('id', 1)
        .select('gating_enabled, billing_enabled, debug_menu_enabled, updated_at')
        .single();

      if (updateError) return errorResponse(updateError.message, 500);

      // audit_log に記録
      await supabase.from('audit_log').insert({
        actor_user_id: user_id,
        action: 'update_app_config',
        before_value: JSON.stringify(current),
        after_value: JSON.stringify(newConfig),
        created_at: new Date().toISOString(),
      });

      return jsonResponse({ success: true, config: updated });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
