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
    const url = new URL(req.url);

    // GET /msc?user_id=xxx
    if (req.method === 'GET') {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);

      const { data, error } = await supabase
        .from('user_msc_data')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (error && error.code !== 'PGRST116') return errorResponse(error.message, 500);

      if (!data) {
        return jsonResponse({ exists: false, mbti_type: null, custom_strength: null, custom_weakness: null, custom_bio: null });
      }

      return jsonResponse({
        exists: true,
        mbti_type: data.mbti_type,
        custom_strength: {
          name: data.custom_strength_name,
          icon: data.custom_strength_icon,
          desc: data.custom_strength_desc,
        },
        custom_weakness: {
          name: data.custom_weakness_name,
          icon: data.custom_weakness_icon,
          desc: data.custom_weakness_desc,
        },
        custom_bio: data.custom_bio,
      });
    }

    // POST /msc
    if (req.method === 'POST') {
      const body = await req.json();
      const { user_id, mbti_type, custom_strength, custom_weakness, custom_bio } = body;
      if (!user_id) return errorResponse('user_id is required', 400);

      const upsertData: Record<string, unknown> = {
        user_id,
        updated_at: new Date().toISOString(),
      };

      if (mbti_type !== undefined) upsertData.mbti_type = mbti_type;
      if (custom_bio !== undefined) upsertData.custom_bio = custom_bio;

      if (custom_strength !== undefined) {
        upsertData.custom_strength_name = custom_strength.name ?? null;
        upsertData.custom_strength_icon = custom_strength.icon ?? null;
        upsertData.custom_strength_desc = custom_strength.desc ?? null;
      }

      if (custom_weakness !== undefined) {
        upsertData.custom_weakness_name = custom_weakness.name ?? null;
        upsertData.custom_weakness_icon = custom_weakness.icon ?? null;
        upsertData.custom_weakness_desc = custom_weakness.desc ?? null;
      }

      const { data, error } = await supabase
        .from('user_msc_data')
        .upsert(upsertData, { onConflict: 'user_id' })
        .select('*')
        .single();

      if (error) return errorResponse(error.message, 500);

      return jsonResponse({
        exists: true,
        mbti_type: data.mbti_type,
        custom_strength: {
          name: data.custom_strength_name,
          icon: data.custom_strength_icon,
          desc: data.custom_strength_desc,
        },
        custom_weakness: {
          name: data.custom_weakness_name,
          icon: data.custom_weakness_icon,
          desc: data.custom_weakness_desc,
        },
        custom_bio: data.custom_bio,
      });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
