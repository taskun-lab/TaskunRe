import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

async function pushLine(to: string, text: string, token: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) return errorResponse('LINE_CHANNEL_ACCESS_TOKEN not set', 500);

    // remind_at が現在時刻を過ぎており、まだ通知していないタスクを取得
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, user_id, task_name, remind_at')
      .not('remind_at', 'is', null)
      .lte('remind_at', new Date().toISOString())
      .is('reminded_at', null)
      .neq('complete_at', 1)
      .limit(50);

    if (error) return errorResponse(error.message, 500);
    if (!tasks || tasks.length === 0) return jsonResponse({ sent: 0 });

    let sent = 0;
    for (const task of tasks) {
      const localStr = new Date(task.remind_at).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const msg = `⏰ リマインド！\n『${task.task_name}』\n${localStr}`;

      await pushLine(task.user_id, msg, token);

      // 通知済みフラグを立てる
      await supabase.from('tasks')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', task.id);

      sent++;
      console.log(`[reminder] sent to ${task.user_id}: ${task.task_name}`);
    }

    return jsonResponse({ sent });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
