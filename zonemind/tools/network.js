// myzone.ai-assistant / tools/network.js
// 工具实现（技能 'network'）：联网能力——发起 HTTP 请求。
// 提示词在 skills/network/skill.md。这里只放可调用函数与 schema。

'use strict';

// 结果正文统一截断，避免把超大响应体塞进上下文
const NET_BODY_LIMIT = 4000;

function n_confirmLines(labelKey, detail) {
  return [{ k: tSync(labelKey), v: detail }];
}
function n_doneLines(labelKey, ok, detail) {
  return [{ k: tSync(labelKey), v: ok ? (detail || tSync('toolSuccess')) : String(detail || tSync('toolFailed')) }];
}

// ========== fetch（网络请求，无需权限） ==========
registerTool({
  name: 'fetch_url',
  skillId: 'network',
  
  labelKey: 'toolFetchUrl',
  write: true, // 未知目标 URL，GET 之外的 method 有副作用，统一按写操作确认
  description: 'Send an HTTP request through the authenticated MyZone Supabase proxy to avoid browser CORS restrictions. Returns the status code and response body text (truncated).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Request URL.' },
      method: { type: 'string', description: 'HTTP method, e.g. GET/POST/PUT/DELETE. Defaults to GET.', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'] },
      headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Request headers as a key-value object.' },
      body: { type: 'string', description: 'Request body (usually JSON.stringify(...)).' },
    },
    required: ['url'],
  },
  confirmLines: (args) => n_confirmLines('toolFetchUrl', `${String(args.method || 'GET')} ${String(args.url || '')}`),
  async handler(args) {
    const opts = {
      method: String(args.method || 'GET').toUpperCase(),
      headers: (args.headers && typeof args.headers === 'object') ? args.headers : {},
    };
    if (args.body != null) opts.body = String(args.body);
    const resp = await window.myzone.fetch(String(args.url || ''), opts);
    let body = '';
    try { body = await resp.text(); } catch (e) { /* 读取响应体失败时忽略 */ }
    const truncated = body.length > NET_BODY_LIMIT;
    const text = truncated ? body.slice(0, NET_BODY_LIMIT) + '…' : body;
    const ok = !!(resp && resp.status >= 200 && resp.status < 400);
    return { success: ok, status: resp && resp.status, statusText: resp && resp.statusText, truncated, result: text };
  },
  resultLines: (args, r) => {
    const lines = [];
    if (!r || !r.success) {
      lines.push({ k: tSync('toolHttpStatus'), v: String((r && r.status) || '') });
      lines.push({ k: tSync('toolFailed'), v: String((r && r.result) || '') });
      return lines;
    }
    lines.push({ k: tSync('toolHttpStatus'), v: String(r.status) });
    if (r.truncated) lines.push({ k: tSync('toolResultTruncated'), v: (tSync('searchShown').replace('{{count}}', String(NET_BODY_LIMIT))) });
    lines.push({ k: tSync('toolNewContent'), v: String(r.result || '') });
    return lines;
  },
});

registerTool({
  name: 'web_search',
  skillId: 'network',
  labelKey: 'toolWebSearch',
  description: 'Search the web using the administrator-configured Tavily search API. Use this for current information and return concise source links.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      search_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'Search depth.' },
      max_results: { type: 'integer', minimum: 1, maximum: 10, description: 'Maximum number of results.' },
    },
    required: ['query'],
  },
  async handler(args) { return window.myzone.search(args); },
  resultLines: (args, result) => {
    if (!result || !result.success) return [{ k: tSync('toolWebSearch'), v: String((result && result.error) || tSync('toolFailed')) }];
    const lines = result.answer ? [{ k: tSync('toolWebSearch'), v: result.answer }] : [];
    for (const item of result.results || []) lines.push({ k: item.title || item.url || '', v: `${item.url || ''}\n${item.content || item.raw_content || ''}` });
    return lines;
  },
});