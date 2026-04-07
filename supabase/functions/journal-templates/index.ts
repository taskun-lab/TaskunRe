import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

async function checkPrivileged(supabase: ReturnType<typeof supabaseClient>, user_id: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', user_id)
    .single();
  return data?.role === 'developer' || data?.role === 'admin';
}

Deno.serve(async (req) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = supabaseClient();
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // ── GET /journal-templates ─────────────────────────────────
    // 認証不要（全ユーザー共通テンプレート）
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('journal_templates')
        .select('id, title, content, description, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data ?? []);
    }

    // ── POST 系（developer / admin のみ） ───────────────────────
    const body = await req.json();
    const { user_id } = body;
    if (!user_id) return errorResponse('user_id is required', 400);

    const ok = await checkPrivileged(supabase, user_id);
    if (!ok) return errorResponse('Forbidden', 403);

    // POST /journal-templates/save → 追加 or 更新
    if (req.method === 'POST' && path.endsWith('/save')) {
      const { id, title, content, description, sort_order } = body;
      if (!title || !content) return errorResponse('title and content are required', 400);

      if (id) {
        const { error } = await supabase
          .from('journal_templates')
          .update({ title, content, description: description ?? null, sort_order: sort_order ?? 0 })
          .eq('id', id);
        if (error) return errorResponse(error.message, 500);
      } else {
        const { error } = await supabase
          .from('journal_templates')
          .insert({ title, content, description: description ?? null, sort_order: sort_order ?? 0, is_active: true });
        if (error) return errorResponse(error.message, 500);
      }
      return jsonResponse({ ok: true });
    }

    // POST /journal-templates/delete → 論理削除
    if (req.method === 'POST' && path.endsWith('/delete')) {
      const { id } = body;
      if (!id) return errorResponse('id is required', 400);
      const { error } = await supabase
        .from('journal_templates')
        .update({ is_active: false })
        .eq('id', id);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ ok: true });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
