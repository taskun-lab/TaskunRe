import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

// Stripe Webhook署名検証（Web Crypto API使用）
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === signature;
  } catch {
    return false;
  }
}

function getPlanCodeFromPriceId(price_id: string): string {
  const plus3 = Deno.env.get('STRIPE_PRICE_PLUS3');
  const plus6 = Deno.env.get('STRIPE_PRICE_PLUS6');
  const max = Deno.env.get('STRIPE_PRICE_MAX');

  if (price_id === plus3) return 'plus3';
  if (price_id === plus6) return 'plus6';
  if (price_id === max) return 'max';
  return 'free';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) return errorResponse('Webhook secret not configured', 500);

    const sigHeader = req.headers.get('stripe-signature') ?? '';
    const rawBody = await req.text();

    const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!valid) return errorResponse('Invalid signature', 400);

    const event = JSON.parse(rawBody);
    const supabase = supabaseClient();

    // 冪等性チェック
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existing) {
      return jsonResponse({ received: true, skipped: true }, 409);
    }

    // イベント記録
    await supabase.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
      payload: event,
    });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const user_id = session.metadata?.user_id;
        if (!user_id) break;

        // サブスクリプションからprice_idを取得
        let plan_code = 'free';
        if (session.subscription) {
          const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
          );
          const sub = await subRes.json();
          const price_id = sub?.items?.data?.[0]?.price?.id;
          if (price_id) plan_code = getPlanCodeFromPriceId(price_id);

          // plan_entitlementsから権限取得
          const { data: entitlement } = await supabase
            .from('plan_entitlements')
            .select('task_limit, can_status, can_journal')
            .eq('plan_code', plan_code)
            .single();

          await supabase
            .from('users')
            .update({
              plan_code,
              task_limit: entitlement?.task_limit ?? 10,
              can_status: entitlement?.can_status ?? false,
              can_journal: entitlement?.can_journal ?? false,
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              subscription_status: sub.status,
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            })
            .eq('user_id', user_id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const price_id = sub?.items?.data?.[0]?.price?.id;
        const plan_code = price_id ? getPlanCodeFromPriceId(price_id) : 'free';

        const { data: entitlement } = await supabase
          .from('plan_entitlements')
          .select('task_limit, can_status, can_journal')
          .eq('plan_code', plan_code)
          .single();

        await supabase
          .from('users')
          .update({
            plan_code,
            task_limit: entitlement?.task_limit ?? 10,
            can_status: entitlement?.can_status ?? false,
            can_journal: entitlement?.can_journal ?? false,
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_customer_id', sub.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;

        const { data: entitlement } = await supabase
          .from('plan_entitlements')
          .select('task_limit, can_status, can_journal')
          .eq('plan_code', 'free')
          .single();

        await supabase
          .from('users')
          .update({
            plan_code: 'free',
            task_limit: entitlement?.task_limit ?? 10,
            can_status: entitlement?.can_status ?? false,
            can_journal: entitlement?.can_journal ?? false,
            subscription_status: 'canceled',
            current_period_end: null,
          })
          .eq('stripe_customer_id', sub.customer);
        break;
      }

      default:
        // 未処理イベントは無視
        break;
    }

    return jsonResponse({ received: true });
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
