// ========================================
//  CORS 跨域支持工具
// ========================================
// 为 Edge Function 添加 CORS 响应头，支持从任意域调用
// 用法：在函数开头添加 cors(req) 或用 corsHandler(req, async () => {...})
// ========================================

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-client-info, apikey, x-api-key, anthropic-version',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * 构造带 CORS 头的 Response（等价于 new Response(...)，但自动添加 CORS 头）
 */
export function corsJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
  req: Request,
): Response {
  const corsHeaders = getCorsHeaders(req);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

/**
 * 处理 OPTIONS 预检请求。
 * 返回 Response 表示已处理（直接返回该响应即可）；
 * 返回 null 表示这不是 OPTIONS 请求，应继续业务处理。
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(req);
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
}
