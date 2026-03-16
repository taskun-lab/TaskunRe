import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

async function replyLine(replyToken: string, text: string): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return;

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

    const body = await req.json();
    const events = body?.events;

    if (!Array.isArray(events) || events.length === 0) {
      return jsonResponse({ ok: true });
    }

    const event = events[0];
    const replyToken = event?.replyToken;
    const user_id = event?.source?.userId;
    const task_name = event?.message?.text;

    // テキストメッセージ以外は無視
    if (!user_id || !task_name || event?.message?.type !== 'text') {
      return jsonResponse({ ok: true });
    }

    const supabase = supabaseClient();

    // ユーザーが存在しない場合は登録
    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', user_id)
      .single();

    if (!existingUser) {
      await supabase.from('users').insert({
        user_id,
        role: 'user',
        plan_code: 'free',
        task_limit: 10,
        can_status: false,
        can_journal: false,
        subscription_status: null,
        current_period_end: null,
      });
    }

    // タスクを挿入
    const { error: insertError } = await supabase.from('tasks').insert({
      user_id,
      task_name,
      complete_at: 0,
      task_type: 'appointment',
      priority: 0,
      priority_level: 'active',
      sort_order: 0,
    });

    if (insertError) {
      if (replyToken) {
        await replyLine(replyToken, 'タスクの追加に失敗しました。もう一度お試しください。');
      }
      return errorResponse(insertError.message, 500);
    }

    // LINE返信
    if (replyToken) {
      await replyLine(replyToken, `🕐 予定タスクに追加しました！\n${task_name}`);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
