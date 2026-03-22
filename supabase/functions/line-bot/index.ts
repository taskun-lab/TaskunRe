import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

async function verifyLineSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return computed === signature;
}

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

async function replyLine(replyToken: string, messages: object[]): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return;

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function calcRemindAt(when: string): string | null {
  const now = new Date();
  switch (when) {
    case 'tonight': {
      const d = new Date(now);
      d.setHours(21, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    case 'tomorrow_morning': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    }
    case 'next_monday': {
      const d = new Date(now);
      const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    }
    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

    // LINE Webhook 署名検証
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');
    const signature = req.headers.get('x-line-signature') ?? '';
    const rawBody = await req.text();

    if (channelSecret) {
      const valid = await verifyLineSignature(rawBody, signature, channelSecret);
      if (!valid) return errorResponse('Invalid signature', 401);
    }

    const body = JSON.parse(rawBody);
    const events = body?.events;

    if (!Array.isArray(events) || events.length === 0) return jsonResponse({ ok: true });

    const supabase = supabaseClient();

    for (const event of events) {
      const replyToken = event?.replyToken;
      const user_id = event?.source?.userId;
      if (!user_id) continue;

      // ポストバック（リマインド設定）
      if (event.type === 'postback') {
        const data: string = event.postback?.data ?? '';
        if (data.startsWith('remind|')) {
          const parts = data.split('|');
          const task_id = parts[1];
          const when = parts[2];

          if (when === 'none') {
            if (replyToken) {
              await replyLine(replyToken, [{ type: 'text', text: '✅ リマインドなしで設定しました！' }]);
            }
          } else {
            const remind_at = calcRemindAt(when);
            if (task_id && remind_at) {
              await supabase.from('tasks').update({ remind_at }).eq('id', task_id).eq('user_id', user_id);
              const label = when === 'tonight' ? '今夜21時' : when === 'tomorrow_morning' ? '明日朝8時' : '来週月曜朝8時';
              if (replyToken) {
                await replyLine(replyToken, [{ type: 'text', text: `🔔 ${label}にリマインドします！` }]);
              }
            }
          }
        }
        continue;
      }

      // テキストメッセージ以外は無視
      if (event?.message?.type !== 'text') continue;
      const task_name: string = event.message.text;

      // ユーザー登録（未登録の場合）
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

      // タスク挿入
      const { data: inserted, error: insertError } = await supabase
        .from('tasks')
        .insert({
          user_id,
          task_name,
          complete_at: 0,
          task_type: 'appointment',
          priority: 0,
          priority_level: 'active',
          sort_order: 0,
        })
        .select('id')
        .single();

      if (insertError) {
        if (replyToken) {
          await replyLine(replyToken, [{ type: 'text', text: 'タスクの追加に失敗しました。もう一度お試しください。' }]);
        }
        continue;
      }

      const task_id = inserted?.id;

      // Quick Reply でリマインド時刻を選択させる
      if (replyToken && task_id) {
        await replyLine(replyToken, [{
          type: 'text',
          text: `☑ 追加しました！\nリマインドはいつにしますか？`,
          quickReply: {
            items: [
              {
                type: 'action',
                action: { type: 'postback', label: '今夜21時', data: `remind|${task_id}|tonight`, displayText: '今夜21時' },
              },
              {
                type: 'action',
                action: { type: 'postback', label: '明日朝8時', data: `remind|${task_id}|tomorrow_morning`, displayText: '明日朝8時' },
              },
              {
                type: 'action',
                action: { type: 'postback', label: '来週月曜', data: `remind|${task_id}|next_monday`, displayText: '来週月曜朝8時' },
              },
              {
                type: 'action',
                action: { type: 'postback', label: '設定しない', data: `remind|${task_id}|none`, displayText: '設定しない' },
              },
            ],
          },
        }]);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
