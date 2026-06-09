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
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function parseQS(data: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of data.split('&')) {
    const [k, v] = pair.split('=');
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return result;
}

function remindQuickReply(taskId: string) {
  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'datetimepicker',
          label: 'カレンダー表示🗓️',
          data: `action=remind_set&task_id=${taskId}`,
          mode: 'datetime',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: 'リマインドしない',
          data: `action=remind_none&task_id=${taskId}`,
        },
      },
    ],
  };
}

const LIFF_URL = Deno.env.get('LIFF_URL') || 'https://liff.line.me/2008277838-k2Pzxo0I';

const USAGE_GROUP = `使い方わっしょいっ！！💪

【グループでの使い方】
@ムキムキタスくん に続けてタスクを送ると、グループの共有リストに追加されるよ！

【コマンド】
📋 @ムキムキタスくん リスト → タスク一覧を表示
❓ @ムキムキタスくん 使い方 → この案内を表示

【追加例】
@ムキムキタスくん 明日の会議の資料を準備する

Let'sムキムキ‼💪`;

const USAGE_PERSONAL = `使い方わっしょいっ！！💪

メッセージを送るとタスクカードとしてリストに保存されるよ！

【コマンド】
📋 リスト → タスク一覧を表示
❓ 使い方 → この案内を表示

リストに保存したタスクはアプリで管理できるよ！

Let'sムキムキ‼💪`;

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

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
    const botUserId = Deno.env.get('LINE_BOT_USER_ID') || '';

    for (const event of events) {
      const replyToken = event?.replyToken;
      const source = event?.source || {};
      const isGroup = source.type === 'group';
      const groupId: string = source.groupId || '';
      const individualUserId: string = source.userId || '';
      const dataId = isGroup ? groupId : individualUserId;
      if (!dataId) continue;

      // ── ポストバック（リマインド設定） ──────────────────────────────
      if (event.type === 'postback') {
        const params = parseQS(event.postback?.data ?? '');
        const action = params.action || '';
        const task_id = params.task_id || '';

        if (action === 'remind_set') {
          const datetime = event.postback?.params?.datetime || '';
          console.log(`[remind_set] task_id=${task_id} datetime="${datetime}" dataId=${dataId}`);
          if (task_id && datetime) {
            // LINE datetimepicker は JST を返す。iOS は "YYYY-MM-DDTHH:mm:ss" 形式の場合あり
            const dtBase = datetime.length >= 19 ? datetime.substring(0, 19) : `${datetime}:00`;
            const remind_at = new Date(`${dtBase}+09:00`).toISOString();
            console.log(`[remind_set] remind_at=${remind_at}`);
            const { error: updateError } = await supabase.from('tasks').update({ remind_at }).eq('id', task_id).eq('user_id', dataId);
            console.log(`[remind_set] updateError=${JSON.stringify(updateError)}`);
            const localStr = new Date(remind_at).toLocaleString('ja-JP', {
              timeZone: 'Asia/Tokyo',
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
            if (replyToken) {
              await replyLine(replyToken, [{ type: 'text', text: `リマインドを設定したよ！🔔\n${localStr} に通知するね！` }]);
            }
          } else {
            console.log(`[remind_set] skipped: task_id=${!!task_id} datetime=${!!datetime}`);
          }
        } else if (action === 'remind_none') {
          if (replyToken) {
            await replyLine(replyToken, [{ type: 'text', text: '了解！リマインドなしだね！' }]);
          }
        }
        continue;
      }

      // テキストメッセージ以外は無視
      if (event?.message?.type !== 'text') continue;
      const rawText: string = event.message.text || '';

      // ── グループモード ────────────────────────────────────────────
      if (isGroup) {
        // ボットへのメンションチェック
        // isSelf=true（LINE公式）を最優先、次にLINE_BOT_USER_IDで照合
        const mentionees: Array<{ type: string; userId?: string; isSelf?: boolean; index: number; length: number }> =
          event.message?.mention?.mentionees || [];

        const isMentioned = mentionees.some(m =>
          m.isSelf === true ||
          (botUserId && m.type === 'user' && m.userId === botUserId)
        ) || mentionees.length > 0 && !botUserId; // BOT_USER_ID 未設定時はメンションがあれば反応

        if (!isMentioned) continue;

        // メンション部分をテキストから除去（後ろから処理してインデックスがずれないように）
        let text = rawText;
        const sortedMentions = [...mentionees].sort((a, b) => b.index - a.index);
        for (const m of sortedMentions) {
          text = text.slice(0, m.index) + text.slice(m.index + m.length);
        }
        text = text.trim();

        // コマンド処理
        if (text === 'リスト') {
          if (replyToken) {
            await replyLine(replyToken, [{
              type: 'text',
              text: 'タスクリストはこちらから👇',
              quickReply: {
                items: [{ type: 'action', action: { type: 'uri', label: 'リストを見る', uri: LIFF_URL } }],
              },
            }]);
          }
          continue;
        }

        if (text === '使い方') {
          if (replyToken) await replyLine(replyToken, [{ type: 'text', text: USAGE_GROUP }]);
          continue;
        }

        if (!text) continue; // メンションのみで本文なし

        // グループをusersテーブルに登録（未登録の場合）
        const { data: existingGroup } = await supabase
          .from('users').select('user_id').eq('user_id', groupId).single();
        if (!existingGroup) {
          await supabase.from('users').insert({
            user_id: groupId,
            role: 'user',
            plan_code: 'free',
            task_limit: 50,
            can_status: false,
            can_journal: false,
            subscription_status: null,
            current_period_end: null,
          });
        }

        // グループメンバー（送信者個人）に group_id を紐付け（LIFF がグループタスクを参照できるよう）
        if (individualUserId) {
          const { data: existingMember } = await supabase
            .from('users').select('user_id').eq('user_id', individualUserId).single();
          if (existingMember) {
            await supabase.from('users').update({ group_id: groupId }).eq('user_id', individualUserId);
          } else {
            await supabase.from('users').insert({
              user_id: individualUserId,
              group_id: groupId,
              role: 'user',
              plan_code: 'free',
              task_limit: 10,
              can_status: false,
              can_journal: false,
            });
          }
        }

        // タスク保存（グループ共有）
        const { data: inserted, error: insertError } = await supabase
          .from('tasks')
          .insert({
            user_id: groupId,
            task_name: text,
            complete_at: 0,
            task_type: 'appointment',
            priority: 0,
            priority_level: 'active',
            sort_order: 0,
          })
          .select('id')
          .single();

        if (insertError) {
          if (replyToken) await replyLine(replyToken, [{ type: 'text', text: 'タスクの追加に失敗しました。もう一度お試しください。' }]);
          continue;
        }

        if (replyToken && inserted?.id) {
          await replyLine(replyToken, [{
            type: 'text',
            text: `『${text}』をリストに追加したよ！\nリマインドはいつにする？👇`,
            quickReply: remindQuickReply(inserted.id),
          }]);
        }

      // ── 個人モード ──────────────────────────────────────────────
      } else {
        const text = rawText.trim();

        // ユーザー登録（未登録の場合）
        const { data: existingUser } = await supabase
          .from('users').select('user_id').eq('user_id', individualUserId).single();
        if (!existingUser) {
          await supabase.from('users').insert({
            user_id: individualUserId,
            role: 'user',
            plan_code: 'free',
            task_limit: 10,
            can_status: false,
            can_journal: false,
            subscription_status: null,
            current_period_end: null,
          });
        }

        // コマンド処理
        if (text === 'リスト') {
          if (replyToken) {
            await replyLine(replyToken, [{
              type: 'text',
              text: 'タスクリストはこちらから👇',
              quickReply: {
                items: [{ type: 'action', action: { type: 'uri', label: 'リストを見る', uri: LIFF_URL } }],
              },
            }]);
          }
          continue;
        }

        if (text === '使い方') {
          if (replyToken) await replyLine(replyToken, [{ type: 'text', text: USAGE_PERSONAL }]);
          continue;
        }

        // タスク保存
        const { data: inserted, error: insertError } = await supabase
          .from('tasks')
          .insert({
            user_id: individualUserId,
            task_name: text,
            complete_at: 0,
            task_type: 'appointment',
            priority: 0,
            priority_level: 'active',
            sort_order: 0,
          })
          .select('id')
          .single();

        if (insertError) {
          if (replyToken) await replyLine(replyToken, [{ type: 'text', text: 'タスクの追加に失敗しました。もう一度お試しください。' }]);
          continue;
        }

        if (replyToken && inserted?.id) {
          await replyLine(replyToken, [{
            type: 'text',
            text: `『${text}』をリストに追加したよ！\nリマインドはいつにする？👇`,
            quickReply: remindQuickReply(inserted.id),
          }]);
        }
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
