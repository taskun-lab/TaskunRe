import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (req.method === 'GET') {
      const { data: plans, error } = await supabase
        .from('plan_entitlements')
        .select('plan_code, display_name, price_jpy, task_limit, can_status, can_journal');

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ plans: plans ?? [] });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
