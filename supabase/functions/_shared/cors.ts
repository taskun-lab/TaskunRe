const ALLOWED_ORIGINS = [
  'https://taskun-lab.github.io',
];

function resolveOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // ローカル開発・ngrok を許可
  if (
    origin === 'http://localhost' ||
    origin === 'http://127.0.0.1' ||
    /\.ngrok-free\.app$/.test(origin) ||
    /\.ngrok\.io$/.test(origin)
  ) return origin;
  return ALLOWED_ORIGINS[0];
}

/**
 * リクエストの Origin ヘッダーを渡して、CORS 済みのレスポンスヘルパーを返す。
 * 使い方:
 *   const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
 */
export function buildCors(origin: string | null) {
  const allowedOrigin = resolveOrigin(origin);
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  return {
    corsResponse: () =>
      new Response(null, { status: 204, headers }),
    jsonResponse: (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      }),
    errorResponse: (message: string, status = 400) =>
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      }),
  };
}
