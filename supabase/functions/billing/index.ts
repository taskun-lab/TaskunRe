import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

const PRICE_ID_MAP: Record<string, string> = {
  plus3: 'STRIPE_PRICE_PLUS3',
  plus6: 'STRIPE_PRICE_PLUS6',
  max: 'STRIPE_PRICE_MAX',
};

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '');

    // POST /billing/checkout
    if (req.method === 'POST' && path.endsWith('/checkout')) {
      const body = await req.json();
      const { user_id, plan_code } = body;

      if (!user_id || !plan_code) return errorResponse('user_id and plan_code are required', 400);

      const priceEnvKey = PRICE_ID_MAP[plan_code];
      if (!priceEnvKey) return errorResponse(`Unknown plan_code: ${plan_code}`, 400);

      const price_id = Deno.env.get(priceEnvKey);
      if (!price_id) return errorResponse(`Price ID not configured for plan: ${plan_code}`, 500);

      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) return errorResponse('Stripe not configured', 500);

      const appUrl = Deno.env.get('APP_URL') ?? '';

      const params = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price]': price_id,
        'line_items[0][quantity]': '1',
        'mode': 'subscription',
        'success_url': `${appUrl}/?checkout=success`,
        'cancel_url': appUrl,
        'metadata[user_id]': user_id,
      });

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const session = await stripeRes.json();

      if (!stripeRes.ok) {
        return errorResponse(session?.error?.message ?? 'Stripe error', stripeRes.status);
      }

      return jsonResponse({ checkout_url: session.url });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
