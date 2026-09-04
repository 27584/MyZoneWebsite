// ===== ZoneMind 网页版：window.myzone 浏览器 shim =====
// 在普通浏览器页面里复刻扩展所需的宿主 API。
// 只实现「网页可用」能力；桌面专属能力（filesystem/downloads/cookies/…）不定义，
// 对应 tool 文件未加载、技能未注册，运行期不会被访问。
// 内置 LLM 走与桌面端一致的 supabase ai-gateway（/relay + SSE + __gateway_final），蓝本：
//   src/services/ai.js 的 chatBuiltInStream / listBuiltInModels / checkBuiltIn（服务端需鉴权 RPC）。

'use strict';

(function () {
  const ZM = (typeof window !== 'undefined' ? window : {});
  if (ZM.myzone) return; // 防止重复注入

  // ---------- 通用工具 ----------
  function lang() {
    try {
      const l = ZM.localStorage && ZM.localStorage.getItem('myzone-lang');
      return l === 'en' ? 'en' : 'zh';
    } catch (e) { return 'zh'; }
  }
  function getMessage(key) {
    const table = lang() === 'en' ? ZM.ZM_I18N_EN : ZM.ZM_I18N_ZH;
    return (table && table[key]) || key;
  }

  // 清洗将被发送的 assistant 消息里被截断的 tool_calls arguments，避免上游 400。
  function sanitizeHistoryMessages(msgs) {
    if (!Array.isArray(msgs)) return msgs;
    return msgs.map(function (m) {
      if (!m || m.role !== 'assistant' || !Array.isArray(m.tool_calls) || !m.tool_calls.length) return m;
      const valid = m.tool_calls.filter(function (tc) {
        const args = tc && tc.function && tc.function.arguments;
        if (typeof args === 'string' && args && args !== '{}') {
          try { JSON.parse(args); } catch (e) { return false; }
        }
        return true;
      });
      if (valid.length === m.tool_calls.length) return m;
      return Object.assign({}, m, { tool_calls: valid });
    });
  }
  function extractApiError(data, status) {
    if (data && data.error) {
      if (typeof data.error === 'string') return data.error;
      return data.error.message || data.error.type || JSON.stringify(data.error);
    }
    if (data && typeof data.error_reason === 'string') return data.error_reason;
    return 'HTTP ' + status;
  }
  function buildApiError(data, status) {
    const err = new Error(extractApiError(data, status));
    if (status != null) err.status = status;
    if (data != null) {
      try { err.detail = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }
      catch (e) { err.detail = String(data); }
    }
    return err;
  }

  // ---------- supabase 路由（与桌面端一致，用同一个后端） ----------
  function sbClient() {
    return (ZM.appSupabase && ZM.appSupabase.client) || null;
  }
  async function ensureSb() {
    if (ZM.appSupabase && typeof ZM.appSupabase.ensureInitialized === 'function') {
      try { await ZM.appSupabase.ensureInitialized(); } catch (e) { /* 交给下方 getSession 判断 */ }
    }
    return sbClient();
  }
  async function getAccessToken() {
    const c = await ensureSb();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  }
  function gatewayBase() {
    // 与桌面端一致：gateway = <supabaseUrl>/functions/v1/ai-gateway，relay 在其下。
    const c = sbClient();
    const url = (c && (c.supabaseUrl || c.projectUrl)) || null;
    return url ? String(url).replace(/\/+$/, '') + '/functions/v1/ai-gateway' : null;
  }

  // ---------- ai.chat：复刻 chatBuiltInStream ----------
  const abortCtrls = new Map();

  async function chat(opts) {
    opts = opts || {};
    const token = await getAccessToken();
    if (!token) throw Object.assign(new Error('未登录，无法使用内置 AI'), { status: 401, detail: '' });
    const gateway = gatewayBase();
    if (!gateway) throw Object.assign(new Error('内置 AI 网关未配置'), { status: 500, detail: '' });

    const { messages, tools, toolChoice, temperature, maxTokens, modelId, size, n, ratio } = opts;
    const baseBody = { modelId, messages: sanitizeHistoryMessages(messages), stream: true };
    if (temperature != null) baseBody.temperature = temperature;
    if (tools && tools.length) baseBody.tools = tools;
    if (toolChoice) baseBody.tool_choice = toolChoice;
    if (maxTokens) baseBody.max_tokens = maxTokens;
    if (size) baseBody.size = size;
    if (n != null) baseBody.n = n;
    if (ratio) baseBody.ratio = ratio;

    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

    const ctl = new AbortController();
    if (opts.requestId != null) abortCtrls.set(opts.requestId, ctl);
    const signal = ctl.signal;
    const onEvent = (typeof opts.onEvent === 'function') ? opts.onEvent : null;

    let res = await fetch(gateway + '/relay', {
      method: 'POST', headers, body: JSON.stringify(baseBody), signal,
    });

    // 并发排队：轮询 /queue/status 直到轮到自己；取消则通知网关释放队列
    if (res.ok) {
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      let info = null;
      if (ctype.indexOf('application/json') >= 0) {
        try { info = await res.json(); } catch (e) { info = null; }
      }
      if (info && info.status === 'queued' && info.queue_id) {
        const queueId = info.queue_id;
        if (onEvent) onEvent({ type: 'queue', status: 'queued', position: info.position, queueId });
        for (;;) {
          if (signal.aborted) {
            try {
              await fetch(gateway + '/queue/cancel', {
                method: 'POST', headers, body: JSON.stringify({ queueId }),
              });
            } catch (e) { /* 取消通知失败不阻塞中止流程 */ }
            throw new DOMException('The operation was aborted.', 'AbortError');
          }
          await new Promise(function (r) { setTimeout(r, 3000); });
          const st = await fetch(gateway + '/queue/status', {
            method: 'POST', headers, body: JSON.stringify({ queueId }), signal,
          });
          let sj = null;
          try { sj = await st.json(); } catch (e) { sj = null; }
          if (!st.ok || !sj) throw new Error((sj && sj.error) || '排队状态查询失败');
          if (sj.status === 'processing') break;
          if (sj.status === 'failed' || sj.status === 'canceled') {
            throw new Error((sj.error) || '排队已取消或失效，请重新发起请求');
          }
          if (onEvent && sj.position != null) onEvent({ type: 'queue', status: 'queued', position: sj.position, queueId });
        }
        if (onEvent) onEvent({ type: 'queue', status: 'processing', queueId });
        // 轮到自己：携带 queueId 重新请求 /relay，并重新解析最终响应类型
        res = await fetch(gateway + '/relay', {
          method: 'POST', headers, body: JSON.stringify(Object.assign({}, baseBody, { queueId })), signal,
        });
        const ctype2 = (res.headers.get('content-type') || '').toLowerCase();
        if (ctype2.indexOf('application/json') >= 0) {
          try { info = await res.json(); } catch (e) { info = null; }
        } else {
          info = null;
        }
      }
      // 非流式 JSON 同步结果（如文生图）
      if (info) {
        if (onEvent) onEvent({ type: 'done', interrupted: info.interrupted || null });
        return {
          success: true, content: '', images: info.images || [], model: info.model || '',
          usage: info.usage || null, balance: info.balance, credits_cost: info.credits_cost,
          interrupted: info.interrupted || null, aborted: signal.aborted,
        };
      }
    }

    if (!res.ok) {
      let errData = null;
      try { errData = await res.json(); } catch (e) { errData = null; }
      throw buildApiError(errData, res.status);
    }

    let content = '';
    let reasoning = '';
    const toolCalls = [];
    let usage = null;
    let model = '';
    let balance = null;
    let creditsCost = null;
    let interrupted = null;

    await readStreamLines(res, function (line) {
      if (line.indexOf('data:') !== 0) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let json = null;
      try { json = JSON.parse(data); } catch (e) { return; }
      if (json.error) throw buildApiError(json, res.status);

      // 网关在流尾注入的计费结算事件
      if (json.__gateway_final) {
        if (json.model) model = json.model;
        if (json.usage) usage = json.usage;
        balance = json.balance;
        creditsCost = json.credits_cost;
        interrupted = json.interrupted || null;
        if (onEvent && json.usage) onEvent({ type: 'usage', usage: json.usage });
        return;
      }

      if (json.model) model = json.model;
      const choice = json.choices && json.choices[0];
      const delta = (choice && choice.delta) || {};

      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        if (onEvent) onEvent({ type: 'reasoning', text: delta.reasoning_content });
      } else if (typeof delta.reasoning === 'string' && delta.reasoning) {
        reasoning += delta.reasoning;
        if (onEvent) onEvent({ type: 'reasoning', text: delta.reasoning });
      }

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        if (onEvent) onEvent({ type: 'content', text: delta.content });
      }

      // 工具调用增量（按 index 聚合）
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
        for (const dt of delta.tool_calls) {
          const idx = dt.index != null ? dt.index : 0;
          while (toolCalls.length <= idx) {
            toolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
          }
          if (dt.id) toolCalls[idx].id = dt.id;
          if (dt.type) toolCalls[idx].type = dt.type;
          const fn = dt.function || {};
          if (fn.name) toolCalls[idx].function.name += fn.name;
          if (typeof fn.arguments === 'string') toolCalls[idx].function.arguments += fn.arguments;
        }
        if (onEvent) onEvent({ type: 'tool_calls', toolCalls: toolCalls.map(function (t) { return Object.assign({}, t); }) });
      }

      if (json.usage) {
        usage = json.usage;
        if (onEvent) onEvent({ type: 'usage', usage: usage });
      }
    });

    // 过滤并规整工具调用（丢弃未填完整名的空项；参数必须是合法 JSON，防止上游 400）
    const validTools = toolCalls
      .filter(function (t) { return t.function && (t.function.name || t.function.arguments); })
      .filter(function (t) {
        const args = t.function.arguments;
        if (typeof args === 'string' && args && args !== '{}') {
          try { JSON.parse(args); } catch (e) { return false; }
        }
        return true;
      })
      .map(function (t) {
        return {
          id: t.id || ('call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
          type: 'function',
          function: {
            name: t.function.name || '',
            arguments: t.function.arguments || '{}',
          },
        };
      });

    if (onEvent) onEvent({ type: 'done', interrupted: interrupted });
    return {
      success: true, content: content, toolCalls: validTools, usage: usage, model: model, reasoning: reasoning,
      balance: balance, credits_cost: creditsCost, interrupted: interrupted, aborted: signal.aborted,
    };
  }

  async function readStreamLines(res, onLine) {
    if (!res.body || typeof res.body.getReader !== 'function') {
      const text = await res.text();
      for (const line of text.split('\n')) onLine(line);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        onLine(line);
      }
    }
    if (buffer) onLine(buffer.replace(/\r$/, ''));
  }

  // ---------- ai：其它方法 ----------
  async function listBuiltinModels() {
    const c = await ensureSb();
    if (!c) throw new Error('未登录，无法获取内置 AI 模型');
    const params = [
      c.rpc('ai_user_get_models'),
      c.rpc('ai_get_billing_config').then(function (r) { return r.data; }).catch(function () { return null; }),
    ];
    const [{ data, error }, cfg] = await Promise.all(params);
    if (error) throw new Error(error.message);
    const baseRate = cfg && Number(cfg.base_rate);
    return { success: true, models: data || [], base_rate: Number.isFinite(baseRate) && baseRate > 0 ? baseRate : null };
  }
  async function getCreditsBalance() {
    const c = await ensureSb();
    if (!c) return { success: true, balance: null };
    const { data, error } = await c.rpc('ai_user_get_credits');
    if (error) return { success: true, balance: null };
    return { success: true, balance: data || null };
  }
  async function getCreditsEntries() {
    const c = await ensureSb();
    if (!c) return { success: true, balance: 0, total_granted: 0, total_spent: 0, grants: [] };
    const { data, error } = await c.rpc('ai_user_get_grants');
    if (error) return { success: true, balance: 0, total_granted: 0, total_spent: 0, grants: [] };
    const d = data || {};
    return { success: true, balance: d.balance || 0, total_granted: d.total_granted || 0, total_spent: d.total_spent || 0, grants: d.grants || [] };
  }
  async function getCreditsUsage(limit, offset) {
    const c = await ensureSb();
    if (!c) return { success: true, items: [], total: 0, has_more: false };
    const params = { p_limit: limit || 50 };
    if (offset) params.p_offset = offset;
    const { data, error } = await c.rpc('ai_user_get_usage', params);
    if (error) return { success: true, items: [], total: 0, has_more: false };
    const d = data || {};
    return { success: true, items: d.items || [], total: d.total || 0, has_more: !!d.has_more };
  }
  async function checkBuiltin() {
    const c = await ensureSb();
    const loggedIn = !!(c && (await getAccessToken()));
    const gateway = gatewayBase();
    if (!loggedIn || !gateway) {
      return { success: true, available: false, loggedIn: loggedIn, configured: !!gateway, models: [], balance: null, error: null };
    }
    let models = [];
    let baseRate = null;
    let modelError = null;
    try {
      const r = await listBuiltinModels();
      models = r.models || [];
      baseRate = r.base_rate;
    } catch (err) { modelError = (err && err.message) || String(err); }
    let balance = null;
    try { balance = (await getCreditsBalance()).balance; } catch (e) { balance = null; }
    return { success: true, available: models.length > 0, loggedIn: true, configured: true, models: models, balance: balance, base_rate: baseRate, error: modelError };
  }
  async function generateImage(opts) {
    opts = opts || {};
    try {
      // 文生图：与桌面端一致走 /relay，网关返回同步 JSON（images/usage/balance/credits_cost）
      const res = await chat({
        modelId: opts.modelId,
        messages: [{ role: 'user', content: String(opts.prompt || '') }],
        stream: true,
        size: opts.size,
        n: opts.n,
        ratio: opts.ratio,
      });
      if (!res || !res.success) return { success: false, error: '图片生成失败' };
      if (res.interrupted) {
        return { success: false, error: 'credits 余额不足，生成已中断', interrupted: true, balance: res.balance };
      }
      return { success: true, images: res.images || [], model: res.model || '', usage: res.usage || null, credits_cost: res.credits_cost, balance: res.balance };
    } catch (err) {
      return { success: false, error: (err && err.message) || '图片生成失败', status: err && err.status };
    }
  }
  async function generateVideo(opts) {
    opts = opts || {};
    const token = await getAccessToken();
    if (!token) return { success: false, error: '未登录，无法使用内置 AI' };
    const gateway = gatewayBase();
    if (!gateway) return { success: false, error: '内置 AI 网关未配置' };
    try {
      const body = {
        modelId: opts.modelId,
        messages: [{ role: 'user', content: String(opts.prompt || '') }],
        stream: true,
      };
      // 网关约定的文生视频字段：mode / size / seconds / aspect_ratio
      if (opts.mode) body.mode = opts.mode;
      if (opts.size) body.size = opts.size;
      if (opts.seconds != null) body.seconds = String(opts.seconds);
      if (opts.aspectRatio) body.aspect_ratio = String(opts.aspectRatio);
      const res = await fetch(gateway + '/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      let info = null;
      try { info = await res.json(); } catch (e) { info = null; }
      if (!res.ok) throw buildApiError(info, res.status);
      if (!info || (info.status !== 'submitted' && !info.task_id)) {
        return { success: false, error: (info && info.error) || '视频任务提交失败' };
      }
      return { success: true, taskId: info.task_id, videoTaskId: info.video_task_id || null, modelId: info.modelId || opts.modelId };
    } catch (err) {
      return { success: false, error: (err && err.message) || '视频任务提交失败', status: err && err.status };
    }
  }
  async function pollVideo(taskId) {
    const token = await getAccessToken();
    if (!token) return { success: false, error: '未登录，无法使用内置 AI' };
    const gateway = gatewayBase();
    if (!gateway) return { success: false, error: '内置 AI 网关未配置' };
    try {
      const res = await fetch(gateway + '/video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ taskId }),
      });
      let info = null;
      try { info = await res.json(); } catch (e) { info = null; }
      if (!res.ok) throw buildApiError(info, res.status);
      if (!info) return { success: false, error: '查询视频任务状态失败' };
      // info 含 status / video_url / credits_cost / error / note，原样透传给渲染侧
      return Object.assign({ success: true }, info);
    } catch (err) {
      return { success: false, error: (err && err.message) || '查询视频任务状态失败', status: err && err.status };
    }
  }
  function notSupported(name) {
    const err = new Error('浏览器版不支持该能力：' + name);
    err.status = 501;
    return err;
  }

  const M = {
    ai: {
      chat: chat,
      abort: function (requestId) {
        const ctl = abortCtrls.get(requestId);
        if (ctl) { try { ctl.abort(); } catch (e) { /* 忽略 */ } }
        return Promise.resolve({ success: true });
      },
      checkBuiltin: checkBuiltin,
      isConfigured: function () { return Promise.resolve({ success: true, configured: false }); },
      getModels: function () { return Promise.resolve({ success: true, models: [], activeModelId: null }); },
      setActiveModel: function (id) { return Promise.resolve({ success: true, activeModelId: id }); },
      listBuiltinModels: listBuiltinModels,
      getCreditsBalance: getCreditsBalance,
      getCreditsEntries: getCreditsEntries,
      getCreditsUsage: getCreditsUsage,
      getModelMeta: function () { return Promise.resolve({ success: true, contextLimit: null, quota: null }); },
      generateImage: generateImage,
      generateVideo: generateVideo,
      pollVideo: pollVideo,
    },
    account: {
      async _user() {
        const c = await ensureSb();
        if (!c) return { session: null, user: null, profile: null };
        const { data } = await c.auth.getSession();
        const user = (data && data.session && data.session.user) || null;
        if (!user) return { session: null, user: null, profile: null, email: null };
        let profile = null;
        try {
          const { data: p, error } = await c
            .from('user_profiles')
            .select('username, avatar_url')
            .eq('id', user.id)
            .maybeSingle();
          if (!error && p) profile = p;
        } catch (e) { profile = null; }
        return { session: data.session, user, profile, email: user.email || null };
      },
      async _pro() {
        const { session, user } = await M.account._user();
        if (!session || !user) return { isPro: false, expiresAt: null };
        try {
          const { data, error } = await sbClient().rpc('check_pro_status');
          if (error || !data || !data.success) return { isPro: false, expiresAt: null };
          return { isPro: !!data.is_pro, expiresAt: data.pro_expires_at || null };
        } catch (e) { return { isPro: false, expiresAt: null }; }
      },
      async getSession() {
        const { session, user, email } = await M.account._user();
        if (!session || !user) return { success: true, loggedIn: false, session: null };
        let username = email;
        try { const p = await M.account._user(); username = (p.profile && p.profile.username) || email; } catch (e) { /* 忽略 */ }
        return {
          success: true, loggedIn: true,
          session: { userId: user.id, email: email, username, expiresAt: session.expires_at || null },
        };
      },
      async getInfo() {
        const { session, user, profile, email } = await M.account._user();
        if (!session || !user) return { success: false, loggedIn: false, error: '未登录' };
        const pro = await M.account._pro();
        return {
          success: true, loggedIn: true,
          user: { id: user.id, email: email, username: (profile && profile.username) || email },
          profile: profile || null,
          isPro: pro.isPro, proExpiresAt: pro.expiresAt,
        };
      },
      async checkPro() {
        const { session } = await M.account._user();
        if (!session) return { success: true, loggedIn: false, isPro: false, expiresAt: null };
        const pro = await M.account._pro();
        return { success: true, loggedIn: true, isPro: pro.isPro, expiresAt: pro.expiresAt };
      },
      // 网页版无多设备授权体系，返回空列表（区别于桌面端）
      async getDevices() {
        const { session } = await M.account._user();
        return { success: true, loggedIn: !!session, devices: [] };
      },
    },
    i18n: {
      getMessage: getMessage,
      getCurrentLanguage: lang,
    },
    theme: {
      get: function () {
        try { return ZM.localStorage.getItem('myzone-theme') === 'light' ? 'light' : 'dark'; }
        catch (e) { return 'dark'; }
      },
      onChange: function (fn) {
        if (typeof fn !== 'function') return;
        ZM.addEventListener('storage', function (e) {
          if (e.key === 'myzone-theme') fn(M.theme.get());
        });
      },
    },
    toast: {
      _host: null,
      _ensure: function () {
        if (M.toast._host && M.toast._host.isConnected) return M.toast._host;
        const h = ZM.document.createElement('div');
        h.setAttribute('id', 'zm-toast-host');
        h.style.cssText =
          'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;' +
          'display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
        ZM.document.body.appendChild(h);
        M.toast._host = h;
        return h;
      },
      _emit: function (msg, kind) {
        const el = ZM.document.createElement('div');
        el.textContent = String(msg == null ? '' : msg);
        el.style.cssText =
          'max-width:min(86vw,560px);padding:9px 16px;border-radius:var(--radius,10px);' +
          'background:var(--assistant-bubble, #262a33);color:var(--text,#e7e9ee);' +
          'border:1px solid var(--border,#3a4049);box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.28));' +
          (kind === 'warning' ? 'border-color:var(--warning,#e0a63d);' : '') +
          (kind === 'success' ? 'border-color:var(--success,#34c77b);' : '') +
          (kind === 'error' ? 'border-color:var(--danger,#e25555);' : '');
        const host = M.toast._ensure();
        host.appendChild(el);
        ZM.setTimeout(function () { el.remove(); }, 2600);
      },
      show: function (msg) { M.toast._emit(msg, ''); },
      info: function (msg) { M.toast._emit(msg, ''); },
      warning: function (msg) { M.toast._emit(msg, 'warning'); },
      success: function (msg) { M.toast._emit(msg, 'success'); },
      error: function (msg) { M.toast._emit(msg, 'error'); },
    },
    storage: {
      async get(key) {
        try {
          const v = ZM.localStorage.getItem('zonemind_' + key);
          return v == null ? null : JSON.parse(v);
        } catch (e) { return null; }
      },
      async set(key, val) {
        try { ZM.localStorage.setItem('zonemind_' + key, JSON.stringify(val)); } catch (e) { /* 存储不可用则忽略 */ }
        return null;
      },
      async getAll() {
        const out = {};
        try {
          for (let i = 0; i < ZM.localStorage.length; i++) {
            const k = ZM.localStorage.key(i);
            if (!k || k.indexOf('zonemind_') !== 0) continue;
            const name = k.slice('zonemind_'.length);
            try { out[name] = JSON.parse(ZM.localStorage.getItem(k)); } catch (e) { out[name] = null; }
          }
        } catch (e) { /* 忽略 */ }
        return out;
      },
    },
    dialog: {
      confirm: function (message, opts) {
        const text = String(message == null ? '' : message);
        try { return Promise.resolve(ZM.confirm(text)); }
        catch (e) { return Promise.resolve(false); }
      },
    },
    mcp: {
      list: function () { return Promise.resolve({ success: true, tools: [] }); },
      call: function () { return Promise.reject(notSupported('MCP 跨扩展工具')); },
      register: function () { return Promise.resolve({ success: true }); },
      unregister: function () { return Promise.resolve({ success: true }); },
    },
    fetch: function () { return ZM.fetch.apply(ZM, arguments); },
    // 本机选文件（供「从本机选择」附件）：返回与桌面 pickAndRead 一致的结构
    external: {
      async pickAndRead(opts) {
        const accept = {};
        (opts && opts.filters || []).forEach(function (f) {
          (f.extensions || []).forEach(function (e) { accept[e] = true; });
        });
        const content = await readFileFromInput(Object.keys(accept));
        if (!content) return { success: false, error: null };
        return { success: true, data: content };
      },
    },
  };

  // 用 <input type=file> 读取一个文件为 base64（不含 data: 前缀），与桌面返回结构一致
  function readFileFromInput(exts) {
    return new Promise(function (resolve) {
      const input = ZM.document.createElement('input');
      input.type = 'file';
      if (exts && exts.length) {
        const acc = exts.map(function (e) { return e.indexOf('.') === 0 ? e : '.' + e; });
        input.accept = acc.join(',');
      }
      input.style.display = 'none';
      ZM.document.body.appendChild(input);
      input.addEventListener('change', function () {
        const f = input.files && input.files[0];
        if (!f) { input.remove(); resolve(null); return; }
        const reader = new ZM.FileReader();
        reader.onload = function () {
          input.remove();
          const url = String(reader.result || '');
          const comma = url.indexOf(',');
          const base64 = comma >= 0 ? url.slice(comma + 1) : url;
          resolve({ content: base64, fileName: f.name || '', size: f.size || 0 });
        };
        reader.onerror = function () { input.remove(); resolve(null); };
        reader.readAsDataURL(f);
      }, { once: true });
      input.click();
    });
  }

  ZM.myzone = M;

  // ---------- 网页专属裁剪：隐藏当前不支持的桌面 UI（元素保留，仅不可见，避免解绑监听器） ----------
  function hideEl(id) {
    const el = ZM.document && ZM.document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  hideEl('work-folder');         // 工作目录依赖桌面文件系统
  hideEl('attach-from-myzone');  // MyZone 空间选文件依赖桌面 filesystem

  // ---------- 替换静态 __MSG_xxx__（原地改文本与属性值，不重建 DOM，避免解绑监听器） ----------
  function walk(root, cb) {
    for (const node of root.childNodes) {
      cb(node);
      if (node.nodeType === 1 && node.childNodes.length) walk(node, cb);
    }
  }
  function replaceMsgs() {
    const doc = ZM.document;
    if (!doc) return;
    if (doc.title && doc.title.indexOf('__MSG_') >= 0) {
      doc.title = doc.title.replace(/__MSG_([\w]+)__/g, function (_, k) { return getMessage(k); });
    }
    walk(doc.body || doc, function (node) {
      if (node.nodeType === 3 && node.nodeValue && node.nodeValue.indexOf('__MSG_') >= 0) {
        node.nodeValue = node.nodeValue.replace(/__MSG_([\w]+)__/g, function (_, k) { return getMessage(k); });
      } else if (node.nodeType === 1) {
        ['title', 'placeholder'].forEach(function (attr) {
          if (node.hasAttribute && node.hasAttribute(attr) && node.getAttribute(attr).indexOf('__MSG_') >= 0) {
            node.setAttribute(attr, node.getAttribute(attr).replace(/__MSG_([\w]+)__/g, function (_, k) { return getMessage(k); }));
          }
        });
      }
    });
  }
  replaceMsgs();

  // 桌面版由 MyZone 宿主填充 [data-i18n] 元素的本地化文本；浏览器版无宿主，这里补上。
  // 只填充「空文本或仍为原始 key」的元素，避免覆盖已渲染的结构内容。
  function fillDataI18n(root) {
    const els = root && root.querySelectorAll ? root.querySelectorAll('[data-i18n]') : [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const key = el.getAttribute && el.getAttribute('data-i18n');
      if (!key) continue;
      const cur = (el.textContent || '').trim();
      if (cur && cur !== key) continue;
      el.textContent = getMessage(key);
    }
  }
  function fillDataI18nNode(n) {
    if (n.nodeType !== 1) return;
    if (!n.getAttribute('data-i18n')) {
      fillDataI18n(n); // 处理新增子树内的元素
      return;
    }
    const key = n.getAttribute('data-i18n');
    const cur = (n.textContent || '').trim();
    if (!(cur && cur !== key)) n.textContent = getMessage(key);
  }
  if (ZM.document && ZM.document.body) fillDataI18n(ZM.document);
  // 覆盖运行时动态新增的元素（设置面板/智能体编辑器/技能列表等）
  if (typeof ZM.MutationObserver === 'function' && ZM.document && ZM.document.body) {
    const mo = new ZM.MutationObserver(function (muts) {
      for (const m of muts) {
        for (const n of m.addedNodes) fillDataI18nNode(n);
      }
    });
    mo.observe(ZM.document.body, { childList: true, subtree: true });
  }
})();