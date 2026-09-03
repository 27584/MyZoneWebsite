// myzone.ai-assistant / ui.js
// DOM 渲染与交互：消息气泡、思考过程、工具卡片、对话列表、模型/审批下拉、技能设置。

'use strict';

// ========== DOM 工具 ==========
const $ = (id) => document.getElementById(id);
const chatEl = () => $('chat');
const inputEl = () => $('input');
const sendBtnEl = () => $('send-btn');
const workFolderNameEl = () => $('work-folder-name');
const statusDotEl = () => $('status-dot');
const statusTextEl = () => $('status-text');
const noticeEl = () => $('not-configured');

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str) { return escapeHtml(str).replace(/'/g, '&#39;'); }

// 粘性底部：记录「用户当前是否停留在底部」。内容追加时只在该标志为真时吸附到底部。
// 主流聊天产品（ChatGPT/Claude 等）均采用此方案：由 scroll 事件持续刷新该标志，
// 而非在每次追加时用「此刻距底部不足 N px」来判断——那样会在单次流式内容长高超过
// 阈值时（如长思考过程）被误判为用户已上翻，从而停止跟随。
let stickToBottom = true;

function setStickToBottomFromScroll() {
  const chat = chatEl();
  if (!chat) return;
  stickToBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 32;
}

// 只给 #chat 绑定一次滚动监听，持续维护粘性标志。
function ensureStickyScrollListener() {
  const chat = chatEl();
  if (!chat || chat._stickyBound) return;
  chat._stickyBound = true;
  chat.addEventListener('scroll', setStickToBottomFromScroll, { passive: true });
}

function scrollToBottom() {
  const chat = chatEl();
  if (chat) {
    chat.scrollTop = chat.scrollHeight;
    stickToBottom = true;
  }
}

// 仅在用户停留在底部时才自动下滑（供流式输出等处使用）。
// 向上滚动翻阅历史时标志为 false，则不打断其阅读位置。
function scrollToBottomIfNearBottom() {
  const chat = chatEl();
  if (!chat) return;
  ensureStickyScrollListener();
  if (!stickToBottom) return;
  chat.scrollTop = chat.scrollHeight;
  requestAnimationFrame(() => {
    if (chat.isConnected) chat.scrollTop = chat.scrollHeight;
  });
}

function insertBeforeThinking(node) {
  const chat = chatEl();
  // 仅当 typing 指示仍属于当前 #chat（切换会话后可能已游离）才插到它之前，否则直接追加
  if (state.thinkingEl && state.thinkingEl.parentNode === chat) chat.insertBefore(node, state.thinkingEl);
  else chat.appendChild(node);
}

// ========== SVG 图标 ==========
const SVG_AVATAR_ASSISTANT =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.6 15.4l.65 1.75 1.75.65-1.75.65-.65 1.75-.65-1.75-1.75-.65 1.75-.65z"/><path d="M5.8 15.9l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55z"/></svg>';
const SVG_AVATAR_USER =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const SVG_WRITE =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
const SVG_DELETE =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';
const SVG_WARN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>';
const SVG_BRAIN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>';
const SVG_COPY =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const SVG_RETRY =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 4 21 8 17 8"/></svg>';
const SVG_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const SVG_TIME =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
const SVG_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
const SVG_CONV_ICON =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

// 技能/MCP 卡片折叠状态保持：记录用户手动展开过的卡片 key，
// 避免切换勾选触发 renderCfgEditor 重建 DOM 时折叠状态被重置。
const cfgExpanded = new Set();

// ========== Markdown 渲染 ==========
function renderMarkdown(text) {
  const raw = String(text || '');
  const lines = raw.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].startsWith('|')) {
      const tableLines = [line];
      i++;
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^(#{1,6})/)[1].length;
      blocks.push(`<h${level}>${renderInline(line.slice(level).trim())}</h${level}>`);
      i++;
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      blocks.push('<ul>' + items.map(it => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push('<ol>' + items.map(it => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }
    if (/^>\s/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s/, ''));
        i++;
      }
      blocks.push(`<blockquote>${quoteLines.map(l => renderInline(l)).join('<br>')}</blockquote>`);
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}|- |\* |\d+\.|> |```|\|)/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
  }
  return blocks.join('');
}

// 内联强调 / 代码（仅作用在纯文本上；URL 已被 renderInline 先行保护，见下）
function renderEmphasis(text) {
  let h = String(text || '');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  h = h.replace(/_([^_]+)_/g, '<em>$1</em>');
  h = h.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return h;
}

function renderInline(text) {
  let html = escapeHtml(text);
  // 先保护媒体/链接（以及其中 URL），再应用强调规则。
  // 若先做强调，URL 里的下划线会被 _..._ 误判成强调：如 agnes 直链 task_xxx/output_yyy.png
  // 会被改写成 task<em>xxx/output</em>yyy.png，请求 CDN/S3 时报 NoSuchKey，导致图片/视频显示失败。
  const PROTECTED = [];
  const protect = (tag) => { PROTECTED.push(tag); return `\u0001IMG${PROTECTED.length - 1}\u0001`; };
  // http→https 升级：生成的图片/video 直链若是 http，会被 webview 的混合内容策略拦截而加载失败，
  // 这类 CDN 大多同时支持 https，升级后即可正常加载；data URI（base64）不受影响。
  const upgradeMediaUrl = (u) => {
    const s = String(u || '');
    if (/^https?:\/\//i.test(s) && !s.toLowerCase().includes('localhost')) {
      return s.replace(/^http:/i, 'https:');
    }
    return s;
  };
  // 图片/视频：视频地址（mp4/webm/mov 等）渲染为可播放的 <video>，其余渲染为 <img>。
  // 必须先于普通链接替换执行，否则 ![alt](url) 的 [alt](url) 会被先转成 <a>，留下孤立的 !
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
    const url = upgradeMediaUrl(String(src || '').split(' ')[0]);
    const tag = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
      ? `<video src="${url}" data-src="${url}" controls preload="metadata" playsinline></video>`
      : `<img src="${url}" data-src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`;
    return protect(tag);
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) =>
    protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${renderEmphasis(label)}</a>`)
  );
  // 裸 URL 同样保护，避免其中的下划线/星号被强调规则改写
  html = html.replace(/(https?:\/\/[^\s<>"']+)/g, (m, u) => protect(escapeHtml(u)));
  // 对剩余纯文本应用强调 / 代码
  html = renderEmphasis(html);
  // 还原受保护的媒体 / 链接
  html = html.replace(/\u0001IMG(\d+)\u0001/g, (m, i) => PROTECTED[Number(i)]);
  return html;
}

function renderTable(lines) {
  const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());
  const headerCells = parseRow(lines[0]);
  const bodyRows = lines.slice(2).map(parseRow);
  let html = '<table><thead><tr>';
  html += headerCells.map(c => `<th>${renderInline(c)}</th>`).join('');
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    html += '<tr>' + row.map(c => `<td>${renderInline(c)}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ========== 消息渲染 ==========
// content 可为纯文本字符串，或 OpenAI 多模态数组 [{type:'image_url',image_url:{url}},...（含文本 part）]
function addUserMessage(content, uid, dev) {
  const msg = el('div', 'msg user');
  msg.appendChild(el('div', 'avatar user', SVG_AVATAR_USER));
  const bubble = el('div', 'bubble');
  if (Array.isArray(content)) {
    const text = content.map(p => p && p.type === 'text' && p.text != null ? p.text : '').join('').trim();
    if (text) {
      const textEl = document.createElement('div');
      textEl.className = 'user-text';
      textEl.textContent = text;
      bubble.appendChild(textEl);
    }
    for (const p of content) {
      if (p && p.type === 'image_url' && p.image_url && p.image_url.url) {
        const img = document.createElement('img');
        img.className = 'user-img';
        img.src = p.image_url.url; // base64 dataURL，无注入风险
        bubble.appendChild(img);
      }
    }
  } else {
    bubble.textContent = String(content == null ? '' : content);
  }
  msg.appendChild(bubble);
  attachMsgHover(msg, 'user', uid);
  chatEl().appendChild(msg);
  // 开发者模式：把「本次请求的详情」附到发起该请求的用户消息下方
  if (dev) attachRequestDetail(bubble, dev);
  scrollToBottom();
  return msg;
}

// 添加思考过程显示（非流式，来自历史记录回放或最终定稿）
function addThinkingProcess(reasoning) {
  if (!reasoning || !reasoning.trim()) return;
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble thinking-bubble');
  const header = el('div', 'thinking-header');
  header.innerHTML = `<span class="thinking-icon">${SVG_BRAIN}</span><span class="thinking-title">${escapeHtml(tSync('thinkingProcess'))}</span><span class="thinking-toggle">${escapeHtml(tSync('hideThinking'))}</span>`;
  const body = el('div', 'thinking-body');
  body.innerHTML = renderMarkdown(reasoning.trim());
  bubble.appendChild(header);
  bubble.appendChild(body);
  msg.appendChild(bubble);
  // 思考过程属「已展示完」的内容，默认折叠成一行标题，点击可展开查看
  body.style.display = 'none';
  header.querySelector('.thinking-toggle').textContent = tSync('showThinking');
  header.addEventListener('click', () => {
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? '' : 'none';
    header.querySelector('.thinking-toggle').textContent = isCollapsed ? tSync('hideThinking') : tSync('showThinking');
  });
  insertBeforeThinking(msg);
  scrollToBottomIfNearBottom();
}

function addAssistantBubble(text, usage, uid, creditsCost) {
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble markdown-body');
  bubble.innerHTML = renderMarkdown(text);
  if (usage || creditsCost) {
    const foot = el('div', 'token-usage');
    foot.textContent = formatUsageText(usage, creditsCost);
    bubble.appendChild(foot);
  }
  msg.appendChild(bubble);
  attachMsgHover(msg, 'assistant', uid);
  insertBeforeThinking(msg);
  scrollToBottomIfNearBottom();
  return msg;
}

// 失败请求的气泡：摘要 + 可折叠的详细错误信息（HTTP 状态 + 完整响应体）。
function addErrorBubble(err) {
  const summary = `${tSync('chatError')}：${err && err.message ? err.message : ''}`;
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble markdown-body error-bubble');
  bubble.innerHTML = renderMarkdown(summary);
  // 仅在有详情（HTTP 状态或响应体）时展示可折叠的失败详情，避免无意义的空块
  let detailText = '';
  if (err && err.detail) detailText = (err.status != null ? `HTTP ${err.status}\n` : '') + err.detail;
  else if (err && err.status != null) detailText = `HTTP ${err.status}`;
  if (detailText.trim()) {
    const wrap = el('div', 'err-detail');
    const head = el('button', 'err-detail-head',
      `<svg class="ed-chev" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>` +
      `<span>${escapeHtml(tSync('errDetailTitle'))}</span>`);
    const body = el('pre', 'err-detail-body');
    body.textContent = detailText;
    head.addEventListener('click', () => wrap.classList.toggle('open'));
    wrap.appendChild(head);
    wrap.appendChild(body);
    bubble.appendChild(wrap);
  }
  msg.appendChild(bubble);
  insertBeforeThinking(msg);
  scrollToBottomIfNearBottom();
  return msg;
}

// 「历史对话已压缩」提示：小字居中，置于压缩块末位（被压缩历史之后）。
// afterUid 指定被压缩历史最后一条渲染消息，提示插在它之后；缺省插到消息流末尾。
// 已有提示（同位置）则不重复插入。
function addCompressionNotice(afterUid) {
  const chat = chatEl();
  const notice = el('div', 'ctx-compressed', escapeHtml(tSync('contextCompressed')));
  if (afterUid) {
    const target = chat.querySelector(`[data-uid="${CSS.escape(String(afterUid))}"]`);
    if (target && target.parentNode === chat) {
      const next = target.nextElementSibling;
      if (next && next.classList.contains('ctx-compressed')) return next;
      target.after(notice);
      scrollToBottomIfNearBottom();
      return notice;
    }
  }
  const last = chat.lastElementChild;
  if (last && last.classList.contains('ctx-compressed')) return last;
  insertBeforeThinking(notice);
  scrollToBottomIfNearBottom();
  return notice;
}

// 压缩生效后按历史定位提示：插到被压缩历史最后一条渲染消息（user/assistant）之后。
// idx 为 ctx_compressed 事件在 history 中的下标；找不到渲染消息时回退到末尾。
function noticeAfterCompression(history, idx) {
  if (Array.isArray(history) && idx != null) {
    for (let i = idx - 1; i >= 0; i--) {
      const m = history[i];
      if (!m || m.role === 'event') continue;
      if (m.role === 'user' || m.role === 'assistant') {
        if (m.uid) addCompressionNotice(m.uid);
        else addCompressionNotice();
        return;
      }
    }
  }
  addCompressionNotice();
}

// 开发者模式：把「将实际发送给模型」的消息详情（角色/占用/截断标记/引用/内容预览）渲染为可折叠面板
async function attachRequestDetail(bubble, dev) {
  if (!dev || !Array.isArray(dev.messages)) return;
  const tools = Array.isArray(dev.tools) ? dev.tools : [];
  const toolCount = tools.length ? String(tools.length) : '0';
  const est = Number.isFinite(dev.est) ? (Number.isFinite(dev.limit) && dev.limit > 0
    ? tSync('devReqEstLimit').replace('{{used}}', formatTokenCount(dev.est)).replace('{{total}}', formatTokenCount(dev.limit))
    : tSync('devReqEstUsed').replace('{{used}}', formatTokenCount(dev.est))) : '';
  const metaText = tSync('devReqMeta')
      .replace('{{msgCount}}', String(dev.messages.length)).replace('{{toolCount}}', toolCount)
      + (est ? ' · ' + est : '');
  const wrap = el('div', 'req-detail');
  const head = el('button', 'req-detail-head',
    `<svg class="rd-chev" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>` +
    `<span>${escapeHtml(tSync('devReqTitle'))}</span>`);
  head.title = metaText;
  const body = el('div', 'req-detail-body');
  body.appendChild(el('div', 'rd-meta', escapeHtml(metaText)));
  // 本条请求同时下发的已启用工具：即「模型是怎么知道能做什么」的答案来源
  if (tools.length) {
    body.appendChild(el('div', 'rd-tool-title', escapeHtml(tSync('devReqTools'))));
    const toolList = el('div', 'rd-tool-list');
    for (const n of tools) toolList.appendChild(el('span', 'rd-tool', escapeHtml(n)));
    body.appendChild(toolList);
  }
  dev.messages.forEach((m, i) => {
    const role = m.role || '?';
    const flags = [];
    if (m._ctxSummary) flags.push('摘要');
    if (m._ctxRef) flags.push(`引用:${m._ctxRef}`);
    if (m._truncatedOutput) flags.push('截断');
    // assistant 的 tool_calls（发起工具调用）也是发给模型的真实内容，须展示
    const calls = (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length)
      ? m.tool_calls.map(tc => `调用工具: ${tc.function && tc.function.name || '?'}(${String(tc.function && tc.function.arguments || '')})`) : [];
    const rawParts = [Array.isArray(m.content) ? JSON.stringify(m.content) : String(m.content || ''), ...calls]
      .map(s => s && s.trim() ? s.trim() : '').filter(Boolean);
    const raw = rawParts.join('\n');
    const tokens = estimateTokens(raw + '\n' + (calls.join('\n') || ''));
    const flagHtml = flags.length ? '&nbsp;' + flags.map(f => `<span class="rd-flag">[${escapeHtml(f)}]</span>`).join(' ') : '';
    const msgEl = el('div', 'rd-msg');
    msgEl.innerHTML = `<span class="rd-head">${escapeHtml(`${role} #${i} · ~${tokens}t`)}</span>${flagHtml}`;
    // 折叠态只显示前 300 字预览；长内容（尤其 system 里的技能提示词）可展开查看完整原文
    if (raw.length > 300) {
      const preview = el('div', 'rd-preview', escapeHtml(raw.slice(0, 300) + '…'));
      const full = el('div', 'rd-full', escapeHtml(raw));
      const toggle = el('button', 'rd-expand', escapeHtml(tSync('expandDetails')));
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        const open = msgEl.classList.toggle('open');
        toggle.textContent = tSync(open ? 'collapseDetails' : 'expandDetails');
      });
      msgEl.appendChild(preview);
      msgEl.appendChild(full);
      msgEl.appendChild(toggle);
    } else {
      msgEl.append('\n', escapeHtml(raw));
    }
    body.appendChild(msgEl);
  });
  head.addEventListener('click', () => wrap.classList.toggle('open'));
  wrap.appendChild(head);
  wrap.appendChild(body);
  bubble.appendChild(wrap);
}

// 历史记录回放时的工具事件卡片（静态展示操作与结果）
function addToolEventCard(ev) {
  const card = el('div', 'tool-card');
  const icon = ev.name === 'delete_items' ? SVG_DELETE : SVG_WRITE;
  const statusText = ev.status === 'executed' ? tSync('toolExecuted')
    : ev.status === 'failed' ? tSync('toolFailed')
    : tSync('toolDenied');
  const statusClass = ev.status === 'executed' ? 'done' : ev.status === 'failed' ? 'err' : 'denied';
  const head = el('div', 'tool-card-head',
    `<span class="tc-icon">${icon}</span><span class="tc-label">${escapeHtml(ev.label || '')}</span>` +
    `<span class="tc-status ${statusClass}"><span class="dot"></span><span class="tc-status-text">${escapeHtml(statusText)}</span></span>`);
  const toggle = el('button', 'tc-toggle', SVG_CHEVRON);
  toggle.title = tSync('collapseDetails');
  toggle.addEventListener('click', () => {
    const b = card.querySelector('.tool-card-body');
    if (!b) return;
    const collapsed = b.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', collapsed);
    toggle.title = collapsed ? tSync('expandDetails') : tSync('collapseDetails');
  });
  head.appendChild(toggle);
  card.appendChild(head);
  const body = el('div', 'tool-card-body');
  for (const { k, v } of (ev.lines || [])) {
    body.appendChild(el('div', 'tc-line', `<span class="k">${escapeHtml(k)}：</span><span class="v">${escapeHtml(v)}</span>`));
  }
  if (ev.error) {
    body.appendChild(el('div', 'tc-line', `<span class="k">${escapeHtml(tSync('toolFailed'))}：</span><span class="v">${escapeHtml(ev.error)}</span>`));
  }
  card.appendChild(body);
  // 已完成的工具操作默认折叠成一行标题，点击可展开查看详情
  collapseToolCard(card);
  chatEl().appendChild(card);
  scrollToBottomIfNearBottom();
}

function ensureThinking() {
  // 引用存在但已游离（切换会话清空 #chat 后旧节点被回收）时视为无 thinking，需重建
  if (state.thinkingEl && state.thinkingEl.isConnected) return state.thinkingEl;
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble');
  bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  msg.appendChild(bubble);
  chatEl().appendChild(msg);
  state.thinkingEl = msg;
  scrollToBottomIfNearBottom();
  return msg;
}

function removeThinking() {
  if (state.thinkingEl) {
    state.thinkingEl.remove();
    state.thinkingEl = null;
  }
}

// ========== 消息级悬停操作（时间 / 复制 / 删除）==========
// 将悬停操作附加到单条对话气泡上；uid 用于从会话历史中精确删除
function attachMsgHover(msgEl, role, uid) {
  if (uid) msgEl.dataset.uid = uid;
  const bar = el('div', 'msg-hover');
  // 时间（默认收起，悬停/聚焦时显示）
  const time = el('span', 'msg-time', tsNow(uid));
  const copyBtn = el('button', 'msg-hover-btn', SVG_COPY);
  copyBtn.title = tSync('copyMessage');
  copyBtn.addEventListener('click', () => copyMessageEl(msgEl));
  const delBtn = el('button', 'msg-hover-btn danger', SVG_DELETE);
  delBtn.title = tSync('deleteMessage');
  delBtn.addEventListener('click', () => deleteMessageEl(msgEl, role));
  bar.appendChild(time);
  bar.appendChild(copyBtn);
  // AI 回复：提供「重试」按钮，重新发送触发本次回复的用户输入
  if (role === 'assistant') {
    const retryBtn = el('button', 'msg-hover-btn', SVG_RETRY);
    retryBtn.title = tSync('retryMessage');
    retryBtn.addEventListener('click', () => retryMessageEl(msgEl));
    bar.appendChild(retryBtn);
  }
  bar.appendChild(delBtn);
  msgEl.appendChild(bar);
}

// 从历史记录中查找该消息的时间戳
function tsNow(uid) {
  if (!uid) return '';
  const idx = (state.history || []).findIndex(m => m.uid === uid);
  const ts = idx >= 0 ? state.history[idx].ts : 0;
  return formatFullTime(ts);
}

function msgTextOf(msgEl) {
  const bubble = msgEl.querySelector('.bubble');
  return bubble ? bubble.innerText || bubble.textContent || '' : '';
}

function copyMessageEl(msgEl) {
  copyTextToClipboard(msgTextOf(msgEl));
  window.myzone.toast.success(tSync('messageCopied'));
}

// 重试：把触发该条 AI 回复的那条用户输入重新发送一遍。
// 从本会话历史中，定位该回复之前的最近一条 user 消息并重新发起。
function retryMessageEl(msgEl) {
  const uid = msgEl.dataset.uid;
  const history = state.history || [];
  let idx = history.findIndex(m => m.uid === uid);
  if (idx < 0) idx = history.length;
  for (let i = idx - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === 'user' && m.content) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (text.trim()) {
        sendUserMessage(text.trim());
        return;
      }
    }
  }
  window.myzone.toast.show(tSync('noRetryTarget'));
}

// 删除单条对话：连同其「思考过程/工具操作」事件一并删除（不删除会话本身）。
// 生成轮次（turnId）内的思考/工具/同轮助手消息会被整轮删除。
async function deleteMessageEl(msgEl, role) {
  const uid = msgEl.dataset.uid;
  const text = msgTextOf(msgEl);
  if (state.history) {
    let idx = -1;
    if (uid) idx = state.history.findIndex(m => m.uid === uid);
    if (idx < 0) {
      idx = state.history.findIndex(m => m.role === role && !m.tool_calls && (m.content === text || m.content === text.trim()));
    }
    if (idx >= 0) {
      const turnId = state.history[idx].turnId;
      let from = idx, to = idx;
      if (turnId) {
        // 整轮删除：同 turnId 的最前与最后下标（含思考过程 / 工具消息 / 同轮助手消息）
        state.history.forEach((m, i) => {
          if (m.turnId === turnId) { if (i < from) from = i; if (i > to) to = i; }
        });
      } else {
        // 无轮次的普通消息：连同紧邻的展示型事件删除
        while (from - 1 >= 0 && state.history[from - 1].role === 'event') from--;
        while (to + 1 < state.history.length && state.history[to + 1].role === 'event') to++;
      }
      state.history.splice(from, to - from + 1);
    }
  }
  // 从历史移除后整体重渲染，确保思考/工具卡片等一并消失
  $('chat').innerHTML = '';
  renderHistory(state.history);
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (conv) {
    conv.updatedAt = Date.now();
    conv.title = getConvTitle(conv.messages || state.history);
  }
  await saveConversations();
  renderConversationList();
  updateConvTitle();
}

// ========== 工具卡片 ==========
function createToolCard(label, isDelete, isOutsideWorkDir, hidden) {
  const card = el('div', 'tool-card');
  const icon = isDelete ? SVG_DELETE : SVG_WRITE;
  const toggle = el('button', 'tc-toggle', SVG_CHEVRON);
  toggle.title = tSync('collapseDetails');
  toggle.addEventListener('click', () => {
    const body = card.querySelector('.tool-card-body');
    if (!body) return;
    const collapsed = body.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', collapsed);
    toggle.title = collapsed ? tSync('expandDetails') : tSync('collapseDetails');
  });
  card.appendChild(
    el('div', 'tool-card-head',
      `<span class="tc-icon">${icon}</span><span class="tc-label">${escapeHtml(label)}</span>` +
      `<span class="tc-status pending"><span class="dot"></span><span class="tc-status-text">${escapeHtml(tSync('toolPending'))}</span></span>`)
  );
  card.querySelector('.tool-card-head').appendChild(toggle);
  if (isOutsideWorkDir) {
    card.classList.add('outside-workdir');
    card.appendChild(el('div', 'tc-outside-warning', `${SVG_WARN}<span>${escapeHtml(tSync('outsideWorkDirWarning'))}</span>`));
  }
  card.appendChild(el('div', 'tool-card-body'));
  if (!hidden) {
    insertBeforeThinking(card);
    scrollToBottomIfNearBottom();
  }
  return card;
}

function setCardStatus(card, status, text) {
  const head = card.querySelector('.tc-status');
  if (!head) return;
  head.className = `tc-status ${status}`;
  const label = head.querySelector('.tc-status-text');
  if (label) label.textContent = text;
}

function addCardLines(card, lines) {
  const body = card.querySelector('.tool-card-body');
  if (body) {
    for (const { k, v } of lines) {
      body.appendChild(el('div', 'tc-line', `<span class="k">${escapeHtml(k)}：</span><span class="v">${escapeHtml(v)}</span>`));
    }
  }
}

function addCardBody(card, html) {
  const body = card.querySelector('.tool-card-body');
  if (body) body.innerHTML = html;
  else {
    const b = el('div', 'tool-card-body', html);
    card.appendChild(b);
  }
}

// ========== 待确认操作管理 ==========
// 记录尚未点击确认的内联确认框；切换会话时自动拒绝，避免生成流程悬挂
const pendingConfirmCancels = [];

function registerPendingConfirm(cancel) {
  pendingConfirmCancels.push(cancel);
}
function unregisterPendingConfirm(cancel) {
  const idx = pendingConfirmCancels.indexOf(cancel);
  if (idx >= 0) pendingConfirmCancels.splice(idx, 1);
}
function denyAllPendingConfirms() {
  while (pendingConfirmCancels.length) {
    const cancel = pendingConfirmCancels.shift();
    cancel();
  }
}

// 操作确认完成后自动折叠卡片正文（保留标题 + 状态，点击可展开查看详情）
function collapseToolCard(card) {
  const body = card.querySelector('.tool-card-body');
  if (body) body.classList.add('collapsed');
  const toggle = card.querySelector('.tc-toggle');
  if (toggle) {
    toggle.classList.add('collapsed');
    toggle.title = tSync('expandDetails');
  }
}

// 确认交互：返回 Promise<boolean>
function showConfirmOnCard(card, { lines, isDelete, isOutsideWorkDir, isPermanentDelete, risk }) {
  return new Promise((resolve) => {
    // 进入「操作确认」阶段，会话列表徽标同步刷新
    state.genPhase = 'confirming';
    renderConversationList();
    setCardStatus(card, 'pending', tSync('confirmNeeded'));
    addCardLines(card, lines);
    // 风险徽标：等级 + 悬停显示具体分数（自定义 tooltip，外观与上下文圆环一致）
    if (risk && risk.score > 0) {
      const badge = el('span', 'tc-risk-wrap', '');
      badge.appendChild(el('span', `tc-risk lv-${risk.level}`, escapeHtml(tSync(risk.levelKey))));
      badge.appendChild(el('span', 'tc-risk-tip', `${tSync('ctxRiskScore')} ${risk.score}/100`));
      const head = card.querySelector('.tool-card-head');
      if (head) head.appendChild(badge);
    }
    if (isDelete) {
      // 永久删除不走回收站且不可恢复，警告文案与「移入回收站，可随时恢复」不同
      const warnKey = isPermanentDelete ? 'permanentDeleteWarning' : 'deleteWarning';
      card.appendChild(el('div', 'tc-warning', `${SVG_WARN}<span>${escapeHtml(tSync(warnKey))}</span>`));
    }
    const actions = el('div', 'tc-actions');
    const denyBtn = el('button', 'btn', tSync('toolConfirmDeny'));
    const allowBtn = el('button', `btn ${isDelete ? 'danger' : 'primary'}`, tSync('toolConfirmAllow'));
    actions.appendChild(denyBtn);
    actions.appendChild(allowBtn);
    card.appendChild(actions);
    const done = (val) => {
      unregisterPendingConfirm(cancel);
      denyBtn.remove();
      allowBtn.remove();
      // 确认完继续生成，回到「输出中」阶段
      if (state.generatingConvId !== null) state.genPhase = 'streaming';
      renderConversationList();
      // 确认完后自动折叠，避免详情占满屏幕
      collapseToolCard(card);
      resolve(val);
    };
    const cancel = () => done(false);
    registerPendingConfirm(cancel);
    denyBtn.addEventListener('click', () => done(false));
    allowBtn.addEventListener('click', () => done(true));
    scrollToBottomIfNearBottom();
  });
}

// ========== 询问交互（ask_user 工具）==========
// 在需要时向用户提问：选项按钮 + 「其它」自定义输入；支持连续多轮，最后固定一步「补充说明」。
// 以页面级模态呈现（不依赖当前会话视图），用户选择/取消后 resolve。
// 需要用户逐轮回答的选择向导（类似 TRAE work 的多步 Wizard）。
// cfg = { steps: [{ question, options: string[], multiple?: bool }] }
// 头部显示「当前 / 总数」进度，总数 = 问题数 + 1（最后一步是固定的「补充说明」）。
// 连续作答、中间不插入对话；全部答完统一返回。
// resolve 值: { items: Array<{ value }>, note: string }，用户取消时为 null。
function askUserPrompt(cfg) {
  return new Promise((resolve) => {
    // 「其它/其他」等由界面内置提供，剔除模型误放进 preset 里的同类项，避免重复。
    const OTHER_LABELS = new Set(['其他', '其它', 'other', 'else', '别的', '自定义', '自行输入']);
    const isOtherLabel = (s) => OTHER_LABELS.has(String(s).trim().toLowerCase());

    const steps = (cfg && cfg.steps || [])
      .map(s => ({
        question: String((s && s.question) || '').trim(),
        options: (s && Array.isArray(s.options)) ? s.options.map(String).filter(o => o && !isOtherLabel(o)) : [],
        multiple: !!(s && s.multiple),
      }))
      .filter(s => s.question);
    if (!steps.length) {
      steps.push({ question: tSync('askTitle'), options: [], multiple: false });
    }
    // 总数 = 问题数 + 1（最后一步固定为「补充说明」）。
    const total = steps.length + 1;
    const isNoteStep = () => cur === steps.length;

    const composer = $('composer');
    const panel = $('ask-panel');
    const stage = $('ask-stage');
    const progressEl = $('ask-progress');
    const confirmBtn = $('ask-confirm');
    const prevBtn = $('ask-prev');
    if (!composer || !panel || !stage || !progressEl || !confirmBtn || !prevBtn) {
      resolve(null);
      return;
    }

    let settled = null;
    // 进入「询问」阶段（等待用户作答），会话列表徽标同步刷新
    state.genPhase = 'asking';
    renderConversationList();
    const cleanup = () => {
      composer.classList.remove('ask-active');
      panel.hidden = true;
      stage.innerHTML = '';
      stage.style.height = 'auto';
    };
    const finish = (answers) => {
      if (settled) return;
      settled = true;
      unregisterPendingConfirm(cancel);
      cleanup();
      // 问完继续生成，回到「输出中」阶段
      if (state.generatingConvId !== null) state.genPhase = 'streaming';
      renderConversationList();
      resolve(answers);
    };
    const cancel = () => finish(null);
    registerPendingConfirm(cancel);

    let cur = 0;
    let optBtns = [];
    let otherInput = null;
    let otherToggleBtn = null;
    const selections = new Array(steps.length).fill(null); // 每步已选答案，返回可回显
    let noteValue = '';

    // 当前步答案：单选返回单个 [value]；多选返回选中的预设集合并把「其它」输入追加到末尾。
    function currentValue() {
      if (isNoteStep()) return [];
      const step = steps[cur];
      const other = (otherInput && otherInput.value.trim()) || '';
      const parts = step.multiple ? optBtns.filter(b => b._picked).map(b => b._value) : [];
      if (step.multiple) return other ? [...parts, other] : parts;
      const single = optBtns.find(b => b._picked);
      return single ? [single._value] : (other ? [other] : []);
    }

    function updateControls() {
      confirmBtn.textContent = tSync(isNoteStep() ? 'askConfirm' : 'askNext');
      confirmBtn.disabled = isNoteStep() ? false : currentValue().length === 0;
      // 第一步显示「取消」（点击退出询问），其余步骤显示「上一步」
      const isFirst = cur === 0;
      prevBtn.textContent = tSync(isFirst ? 'cancel' : 'askPrev');
      prevBtn.disabled = false;
      progressEl.textContent = `${String(cur + 1)} / ${String(total)}`;
    }

    // 构建当前步的内容节点（问题 + 选项/其它/补充说明）
    function buildStepDOM() {
      const node = el('div', 'ask-step');
      if (isNoteStep()) {
        node.appendChild(el('div', 'ask-question', escapeHtml(tSync('askNoteLabel'))));
        const noteWrap = el('div', 'ask-note');
        const noteInput = el('textarea', 'ask-input');
        noteInput.placeholder = tSync('askNotePlaceholder');
        noteInput.value = noteValue;
        noteInput.addEventListener('input', () => { noteValue = noteInput.value; });
        noteWrap.appendChild(noteInput);
        node.appendChild(noteWrap);
        node._focus = noteInput;
        return node;
      }
      const step = steps[cur];
      node.appendChild(el('div', 'ask-question', escapeHtml(step.question) + (step.multiple ? escapeHtml(tSync('askMultiHint')) : '')));

      const optsWrap = el('div', 'ask-options');
      const optsList = el('div', 'ask-options-list');
      const otherWrap = el('div', 'ask-other');
      optBtns = [];
      for (const o of step.options) {
        const b = el('button', 'ask-option');
        b.type = 'button';
        // 超长选项以省略号截断，悬停显示完整文本 tooltip
        b.appendChild(el('span', 'ask-option-text', escapeHtml(o)));
        b.dataset.tip = o;
        b._value = o;
        b._picked = false;
        b.addEventListener('click', () => {
          if (step.multiple) {
            b._picked = !b._picked;
            b.classList.toggle('selected', b._picked);
          } else {
            optBtns.forEach(x => { x._picked = false; x.classList.remove('selected'); });
            b._picked = true;
            b.classList.add('selected');
            if (otherInput) otherInput.value = '';
            otherWrap.classList.remove('active');
            if (otherToggleBtn) otherToggleBtn.classList.remove('selected');
          }
          updateControls();
        });
        optBtns.push(b);
        optsList.appendChild(b);
      }
      if (step.options.length) optsWrap.appendChild(optsList);

      if (step.multiple) {
        // 多选：既有勾选预设，「其它」输入常驻并作为额外选项追加到答案末尾
        otherInput = el('input', 'ask-input ask-other-input');
        otherInput.placeholder = tSync('askOtherPlaceholder');
        otherInput.addEventListener('input', updateControls);
        otherWrap.appendChild(otherInput);
        otherWrap.classList.add('active');
        optsWrap.appendChild(otherWrap);
      } else {
        // 单选：预设选项 + 「其它」切换输入（无预设时直接作为答案）
        otherToggleBtn = el('button', 'ask-option ask-other-toggle', escapeHtml(tSync('askOther')));
        otherToggleBtn.type = 'button';
        otherInput = el('input', 'ask-input ask-other-input');
        otherInput.placeholder = tSync('askOtherPlaceholder');
        otherToggleBtn.addEventListener('click', () => {
          optBtns.forEach(x => { x._picked = false; x.classList.remove('selected'); });
          otherToggleBtn.classList.add('selected');
          otherWrap.classList.add('active');
          otherInput.focus();
          updateControls();
        });
        otherInput.addEventListener('input', updateControls);
        otherWrap.appendChild(otherToggleBtn);
        otherWrap.appendChild(otherInput);
        optsWrap.appendChild(otherWrap);
        if (!step.options.length) otherWrap.classList.add('active');
      }
      node.appendChild(optsWrap);

      // 回显该步已选结果（返回导航时保留用户已填内容）
      const sel = selections[cur];
      if (sel && sel.length) {
        const opts = step.options;
        const others = [];
        for (const v of sel) {
          if (opts.includes(v)) {
            const b = optBtns.find(x => x._value === v);
            if (b && step.multiple) { b._picked = true; b.classList.add('selected'); }
            else if (b) { b._picked = true; b.classList.add('selected'); }
          } else {
            others.push(v);
          }
        }
        if (others.length) {
          if (otherInput) otherInput.value = step.multiple ? others.join(' ') : others[0];
          otherWrap.classList.add('active');
          if (!step.multiple && otherToggleBtn) otherToggleBtn.classList.add('selected');
        } else if (!step.multiple && !opts.length && otherInput) {
          otherWrap.classList.add('active');
        }
      }
      node._focus = optBtns[0];
      return node;
    }

    // 左右滑动切换到新步骤（dir: 'next' | 'prev'）
    function showStep(dir) {
      const prev = stage.firstElementChild;
      if (!prev) {
        const node = buildStepDOM();
        stage.appendChild(node);
        // 步骤为绝对定位，不撑开父容器；显式给 stage 内容真实高度，否则被 overflow:hidden 裁掉
        stage.style.height = (node.offsetHeight || 0) + 'px';
        updateControls();
        focusStep(node);
        return;
      }
      const prevH = prev.offsetHeight;
      stage.style.height = (prevH || 0) + 'px';
      const next = buildStepDOM();
      next.style.transform = dir === 'next' ? 'translateX(40px)' : 'translateX(-40px)';
      next.style.opacity = '0';
      stage.appendChild(next);
      const newH = next.offsetHeight;
      stage.style.height = (Math.max(prevH, newH) || 0) + 'px';
      void next.offsetWidth; // 强制重排以启动过渡
      next.style.transition = 'transform 0.28s cubic-bezier(.2,.7,.3,1), opacity 0.28s ease';
      next.style.transform = 'translateX(0)';
      next.style.opacity = '1';
      prev.style.transition = 'transform 0.28s cubic-bezier(.2,.7,.3,1), opacity 0.28s ease';
      prev.style.transform = dir === 'next' ? 'translateX(-40px)' : 'translateX(40px)';
      prev.style.opacity = '0';
      window.setTimeout(() => {
        if (prev.parentNode === stage) prev.remove();
        // 定格为新步骤高度（步骤为绝对定位，保持显式高度，避免重置 auto 后被裁掉）
        stage.style.height = (newH || 0) + 'px';
      }, 290);
      updateControls();
      focusStep(next);
    }

    function focusStep(node) {
      const f = node && node._focus;
      if (f) {
        window.setTimeout(() => { try { f.focus(); } catch (e) { /* 忽略 */ } }, 30);
      }
    }

    const goNext = () => {
      if (isNoteStep()) return;
      if (!currentValue().length) return;
      selections[cur] = currentValue();
      cur += 1;
      showStep('next');
    };
    const goPrev = () => {
      if (cur === 0) return;
      if (!isNoteStep()) selections[cur] = currentValue();
      cur -= 1;
      showStep('prev');
    };
    const submit = () => {
      if (!isNoteStep()) { goNext(); return; }
      // 各步已强制非空才可「下一步」；此处按顺序汇总，避免得到空答案
      const items = [];
      for (let i = 0; i < steps.length; i++) {
        const sel = selections[i];
        items.push({ value: sel && sel.length ? sel.join(tSync('askMultiJoin')) : steps[i].question });
      }
      finish({ items, note: noteValue.trim() });
    };

    // 静态共享按钮用 onclick 赋值，避免多次调用时引用旧闭包的重复监听
    confirmBtn.onclick = submit;
    // 第一步点击即取消整个询问；后续步骤为「上一步」返回修改
    prevBtn.onclick = () => { if (cur === 0) cancel(); else goPrev(); };
    $('ask-close').onclick = cancel;

    composer.classList.add('ask-active');
    panel.hidden = false;
    showStep(null);
  });
}

// ========== 欢迎信息 ==========
async function renderWelcome() {
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble');
  bubble.appendChild(el('div', null, escapeHtml(`${tSync('welcomeTitle')}\n${tSync('welcomeDesc')}`)));
  const ex = el('div', 'examples');
  const examples = [await t('exampleOrganize'), await t('exampleCleanup'), await t('exampleSummarize')];
  for (const text of examples) {
    const chip = el('button', 'example-chip', escapeHtml(text));
    chip.addEventListener('click', () => {
      inputEl().value = text;
      inputEl().focus();
      autoGrow();
    });
    ex.appendChild(chip);
  }
  bubble.appendChild(ex);
  msg.appendChild(bubble);
  chatEl().appendChild(msg);
  scrollToBottom();
}

// ========== 状态 / 通知 ==========
async function setStatus(type, textKey) {
  const dot = statusDotEl();
  const text = statusTextEl();
  if (type === 'ok') dot.className = 'status-dot ok';
  else if (type === 'err') dot.className = 'status-dot err';
  else dot.className = 'status-dot';
  text.textContent = await t(textKey);
}

// 用原始文本改写通知条后展示（title 用 i18n key，desc 为动态文本，无需逐条加 i18n key）
function showTextNotice(titleKey, descText) {
  const n = noticeEl();
  if (!n) return;
  const title = n.querySelector('.notice-title');
  const desc = n.querySelector('.notice-desc');
  if (title) { title.setAttribute('data-i18n', titleKey); title.textContent = tSync(titleKey); }
  if (desc) { desc.textContent = descText; }
  n.classList.remove('hidden');
}
function showNotice() {
  const n = noticeEl();
  if (n) {
    const title = n.querySelector('.notice-title');
    const desc = n.querySelector('.notice-desc');
    if (title) title.setAttribute('data-i18n', 'notConfiguredTitle');
    if (desc) desc.setAttribute('data-i18n', 'notConfiguredDesc');
    n.classList.remove('hidden');
  }
}
// 内置 AI 已开放但尚未登录：改写提示文案后展示同一个通知条
function showLoginNotice() {
  const n = noticeEl();
  if (n) {
    const title = n.querySelector('.notice-title');
    const desc = n.querySelector('.notice-desc');
    if (title) { title.setAttribute('data-i18n', 'needLoginNoticeTitle'); title.textContent = tSync('needLoginNoticeTitle'); }
    if (desc) { desc.setAttribute('data-i18n', 'needLoginNoticeDesc'); desc.textContent = tSync('needLoginNoticeDesc'); }
    n.classList.remove('hidden');
  }
}
function hideNotice() {
  const n = noticeEl();
  if (n) n.classList.add('hidden');
}

// ========== 输入区 ==========
function autoGrow() {
  const ta = inputEl();
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

async function setBusy(val) {
  state.busy = val;
  updateComposerUI();
}

// 合成器状态：仅在「正在生成且正在查看生成会话」时显示「发送中」；
// 其它对话切到时显示正常「发送」，避免在别的对话里误显示发送中。
function updateComposerUI() {
  const sending = state.busy && isViewingGenerating();
  sendBtnEl().disabled = state.busy;
  inputEl().disabled = state.busy;
  sendBtnEl().querySelector('span').textContent = tSync(sending ? 'sending' : 'send');
  updateStopButton();
}

// 停止按钮只在「正在生成（文本回合或后台媒体生成）且正在查看对应会话」时显示
function updateStopButton() {
  const stopBtn = $('stop-btn');
  const showStop = (state.busy && isViewingGenerating()) || state.mediaActiveConvs.has(state.currentConvId);
  if (stopBtn) stopBtn.style.display = showStop ? 'flex' : 'none';
}

// ========== 工作目录 ==========
async function refreshWorkFolder() {
  try {
    if (!state.settings.workFolderId || state.settings.workFolderId === 'root') {
      state.workFolderPath = '/Root';
      workFolderNameEl().textContent = await t('workFolderRoot');
    } else {
      const pathRes = await window.myzone.filesystem.getPath(state.settings.workFolderId);
      if (pathRes.success) {
        state.workFolderPath = pathRes.pathString || '/Root';
        workFolderNameEl().textContent = state.settings.workFolderName || pathRes.pathString || (await t('workFolderRoot'));
      }
    }
  } catch (e) {
    state.workFolderPath = '/Root';
    workFolderNameEl().textContent = await t('workFolderRoot');
  }
}

async function chooseWorkFolder() {
  const res = await window.myzone.filesystem.pickFolder({ title: tSync('chooseFolder') });
  if (!res || !res.success || !res.data) return;
  const node = res.data;
  state.settings.workFolderId = node.nodeId;
  state.settings.workFolderName = node.name || '';
  await window.myzone.storage.set('workFolderId', node.nodeId);
  await window.myzone.storage.set('workFolderName', node.name || '');
  await refreshWorkFolder();
  window.myzone.toast.success(tSync('folderChanged'));
}

// ========== 会话列表 ==========
function renderHistory(records) {
  for (let i = 0; i < records.length; i++) {
    const msg = records[i];
    if (!msg || typeof msg !== 'object') continue;
    if (msg.role === 'event') {
      if (msg.type === 'thinking') addThinkingProcess(msg.text);
      else if (msg.type === 'tool') addToolEventCard(msg);
      else if (msg.type === 'ctx_compressed') noticeAfterCompression(records, i); // 提示渲染到会话末尾，而非消息流中间
      continue;
    }
    // 历史消息补齐唯一标识与时间戳（供消息级悬停操作定位）
    if (!msg.uid) msg.uid = generateId();
    if (!msg.ts) msg.ts = msg.updatedAt || Date.now();
    if (msg.role === 'user' && msg.content) {
      addUserMessage(msg.content, msg.uid);
    } else if (msg.role === 'assistant' && msg.content) {
      addAssistantBubble(msg.content, msg.usage || null, msg.uid, msg.creditsCost);
    }
    // tool / system 消息仅用于 AI 上下文，不渲染 UI
  }
  // 为当前会话仍在后台生成的媒体任务补渲染占位气泡（切换会话后切回时，任务未入历史但仍在轮询）
  if (Array.isArray(state.mediaTasks) && state.mediaTasks.length) {
    for (const t of state.mediaTasks) {
      // domEl 在切走时虽仍持有旧引用，但已随 #chat 清空而游离，需按 isConnected 判断重建
      if (t.convId === state.currentConvId && (!t.domEl || !t.domEl.isConnected)) {
        t.domEl = createGenPendingBubble(t);
      }
    }
  }
  // 手动技能（技能栏）生成的占位气泡不在会话消息里，切换后 DOM 已游离；切回时按存储信息重建
  const manualPending = state.manualPendingEls.get(state.currentConvId);
  if (manualPending && (!manualPending.el || !manualPending.el.isConnected)) {
    manualPending.el = buildManualPendingEl(manualPending.mode, manualPending.params);
  }
}

function updateConvTitle() {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  const title = conv ? (conv.customTitle || conv.title) : tSync('newConversation');
  $('conv-title').textContent = title || tSync('newConversation');
  $('conv-title').title = tSync('editTitle');
  document.title = `${title || tSync('title')} - ${tSync('title')}`;
}

// 设置当前会话的窗口/标签页标题（用户手动改或 AI 工具调用 set_window_title）
async function setCustomWindowTitle(title) {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (!conv) return;
  conv.customTitle = title;
  conv.updatedAt = Date.now();
  await saveConversations();
  updateConvTitle();
  renderConversationList();
}

// 让标题变为可编辑，回车/失焦保存
function editConvTitle() {
  const titleEl = $('conv-title');
  const current = titleEl.dataset.editing ? null : titleEl.textContent;
  if (titleEl.dataset.editing) return;
  titleEl.dataset.editing = '1';
  const input = document.createElement('input');
  input.className = 'title-input';
  input.value = current;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async (save) => {
    if (!save) { input.replaceWith(titleEl); delete titleEl.dataset.editing; return; }
    const v = input.value.trim();
    input.replaceWith(titleEl);
    delete titleEl.dataset.editing;
    if (v && v !== current) await setCustomWindowTitle(v);
    else updateConvTitle();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

function copyTextToClipboard(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function copyConversation(convId) {
  const conv = state.conversations.find(c => c.id === convId);
  if (!conv) return;
  const parts = [];
  for (const r of (conv.messages || [])) {
    if (r.role === 'event') continue;
    if (r.role === 'user' && r.content) parts.push(`用户：${typeof r.content === 'string' ? r.content : ''}`);
    else if (r.role === 'assistant' && r.content) parts.push(`AI：${typeof r.content === 'string' ? r.content : ''}`);
  }
  const text = parts.join('\n\n') || conv.title || '';
  copyTextToClipboard(text);
  window.myzone.toast.success(tSync('conversationCopied'));
}

// 计算会话在任务列表中的状态标记。
// 优先级：正在生成回合的实时阶段（输出中/操作确认/询问）> 已中断 > 输出完成。
function convStatusOf(conv) {
  if (state.generatingConvId === conv.id) {
    if (state.genPhase === 'confirming') return 'confirming';
    if (state.genPhase === 'asking') return 'asking';
    return 'streaming';
  }
  if (conv.interrupted) return 'interrupted';
  if (conv.completedTurn) return 'completed';
  return '';
}

function statusTextFor(status) {
  switch (status) {
    case 'streaming': return tSync('convStatusStreaming');
    case 'confirming': return tSync('convStatusConfirming');
    case 'asking': return tSync('convStatusAsking');
    case 'completed': return tSync('convStatusCompleted');
    case 'interrupted': return tSync('convStatusInterrupted');
    default: return '';
  }
}

function renderConversationList() {
  const list = $('conversation-list');
  list.innerHTML = '';
  for (const conv of state.conversations) {
    const item = el('div', 'conv-item' + (conv.id === state.currentConvId ? ' active' : ''));
    item.appendChild(el('div', 'conv-item-icon', SVG_CONV_ICON));
    const main = el('div', 'conv-item-main');
    main.appendChild(el('div', 'conv-item-text', escapeHtml(conv.customTitle || conv.title || tSync('newConversation'))));
    main.appendChild(el('div', 'conv-item-time', formatConvTime(conv.updatedAt || conv.createdAt)));
    item.appendChild(main);
    // 会话状态标记（输出中 / 操作确认 / 询问 / 输出完成 / 已中断）
    const status = convStatusOf(conv);
    if (status) {
      const badge = el('span', `conv-badge ${status}`, escapeHtml(statusTextFor(status)));
      badge.title = escapeHtml(statusTextFor(status));
      item.appendChild(badge);
    }
    const actions = el('div', 'conv-item-actions');
    const copyBtn = el('button', 'conv-item-action', SVG_COPY);
    copyBtn.title = tSync('copyConversation');
    copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyConversation(conv.id); });
    const delBtn = el('button', 'conv-item-action danger', SVG_DELETE);
    delBtn.title = tSync('deleteConversation');
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(conv.id); });
    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
    item.addEventListener('click', () => switchConversation(conv.id));
    list.appendChild(item);
  }
}

// ========== 模型选择器 ==========
function renderModelSelector() {
  const nameEl = $('current-model-name');
  if (!nameEl) return;
  const active = state.models.find(m => m.id === state.activeModelId);
  nameEl.textContent = active ? active.name : '--';

  const dropdown = $('model-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    // 聊天下拉只列「文本对话」模型；图片/视频模型在生成技能栏（豆包式底部技能）里单独选择
    const chatModels = state.models.filter(m => m.model_type !== 'image' && m.model_type !== 'video');
    const locals = chatModels.filter(m => !m.builtin);
    // 内置模型区里把 AUTO（自动选择）排到第一位，便于默认选中
    const builtins = chatModels.filter(m => m.builtin).sort((a, b) => ((b.is_auto ? 1 : 0) - (a.is_auto ? 1 : 0)));
    if (!chatModels.length) {
      const empty = el('div', 'model-dropdown-item', escapeHtml(tSync('noModels')));
      empty.style.cursor = 'default';
      dropdown.appendChild(empty);
    } else {
      // 本地模型区（用户在设置里配置的模型）
      for (const model of locals) {
        dropdown.appendChild(modelDropdownItem(model));
      }
      // 内置模型区（站长开放，经网关中转，按 credits 计费）
      if (builtins.length) {
        dropdown.appendChild(el('div', 'model-dropdown-group', escapeHtml(tSync('builtinModels'))));
        for (const model of builtins) {
          dropdown.appendChild(modelDropdownItem(model));
        }
      }
    }
  }
}

function modelDropdownItem(model) {
  const item = el('div', 'model-dropdown-item' + (model.builtin ? ' builtin' : '') + (model.id === state.activeModelId ? ' active' : ''));
  let rateBadge = null;
  let discountBadge = null;
  if (model.builtin) {
    // 综合消耗速率倍率（如 0.44x）+ 悬停显示输入/输出/缓存三档费率明细
    if (model.effectiveRate != null && Number.isFinite(model.effectiveRate)) {
      const fmtR = (v) => (v == null ? '--' : String(v));
      const r = model.rates || {};
      const ro = model.originalRates || {};
      const discounted = model.discount && model.discount > 0 && model.discount < 1;
      const unit = `<span class="tip-unit">${tSync('creditsRateUnit')}</span>`;
      // 悬停提示：折后费率（原价划掉），并标注单位 credits/百万tokens
      let tipHtml =
        `${tSync('creditsRateIn')} ${fmtR(r.input)} · ${tSync('creditsRateOut')} ${fmtR(r.output)} · ${tSync('creditsRateCached')} ${fmtR(r.cached)}`;
      if (discounted) {
        const oIn = fmtR(ro.input), oOut = fmtR(ro.output), oCached = fmtR(ro.cached);
        tipHtml += ` · ${tSync('rateOriginal')} <s>${oIn}/${oOut}/${oCached}</s>`;
      }
      tipHtml += ` · ${unit}`;
      rateBadge = document.createElement('span');
      rateBadge.className = 'rate-badge';
      // 折扣时同时展示折后倍率 + 原价倍率（原价划线且字色变浅）
      const isDisc = discounted && model.originalRate != null && Number.isFinite(model.originalRate) && model.originalRate !== model.effectiveRate;
      rateBadge.innerHTML = `${model.effectiveRate.toFixed(2)}x` +
        (isDisc ? ` <s class="rate-orig">${model.originalRate.toFixed(2)}x</s>` : '');
      if (tipHtml) bindModelTip(rateBadge, tipHtml);
    }
    // 折扣徽标：后台设了折扣（0<discount<1）时展示，如“8折”/“20% off”
    if (model.discount && model.discount > 0 && model.discount < 1) {
      const factor = (model.discount * 10) % 1 === 0 ? String(model.discount * 10) : String(Number((model.discount * 10).toFixed(1)));
      const pct = String(Math.round((1 - model.discount) * 100));
      const label = tSync('discountOff').replace('{{f}}', factor).replace('{{pct}}', pct);
      discountBadge = document.createElement('span');
      discountBadge.className = 'discount-badge';
      discountBadge.textContent = label;
      // 折扣徽标 tooltip：credits消耗XX折/XXoff
      const tipText = tSync('discountConsume').replace('{{f}}', factor).replace('{{pct}}', pct);
      bindModelTip(discountBadge, tipText);
    }
  }
  item.innerHTML = `<span>${escapeHtml(model.name)}</span>`;
  if (discountBadge) item.appendChild(discountBadge);
  if (rateBadge) item.appendChild(rateBadge);
  // AUTO 自动选择模型徽标：后台配置的 is_auto 标记，选择后网关按上下文/优先级/性价比自动路由
  if (model.is_auto) item.appendChild(el('span', 'auto-badge', escapeHtml(tSync('autoBadge'))));
  if (model.builtin) item.appendChild(el('span', 'builtin-badge', escapeHtml(tSync('builtinBadge'))));
  if (model.id === state.activeModelId) {
    item.insertAdjacentHTML('beforeend',
      '<svg class="check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>');
  }
  item.addEventListener('click', () => {
    modelTipHide();
    selectModel(model.id);
    hideModelDropdown();
  });
  return item;
}

// ========== 上下文圆环 tooltip（fixed + body 定位，避免被工具栏高 z-index 控件遮挡） ==========
function contextTipShow() {
  const tip = $('context-tooltip');
  const wrap = $('context-ring-wrap');
  if (!tip || !wrap || !tip.textContent.trim()) return;
  const r = wrap.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  // 向下展开、右对齐（与用户偏好一致），贴近圆环下方
  let left = r.right - tr.width;
  if (left < 8) left = 8;
  if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
  let top = r.bottom + 8;
  if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.classList.add('show');
}
function contextTipInit() {
  const wrap = $('context-ring-wrap');
  if (!wrap) return;
  wrap.addEventListener('mouseenter', contextTipShow);
  wrap.addEventListener('mouseleave', () => {
    const tip = $('context-tooltip');
    if (tip) tip.classList.remove('show');
  });
  // 视图缩放/滚动时跟随重定位，避免 tooltip 悬空
  window.addEventListener('resize', () => {
    const tip = $('context-tooltip');
    if (tip && tip.classList.contains('show')) contextTipShow();
  });
}

// 手动压缩按钮：点击立即压缩当前会话（与自动压缩同源，只作用于发送副本，绝不改写可见历史）。
// 压缩期间按钮进入加载态（禁用 + 旋转加载圈，防止重复触发），摘要生成完成后恢复。
function ctxCompressInit() {
  const btn = $('ctx-compress-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (state.busy) {
      window.myzone.toast.warning(tSync('manualCompressBusy'));
      return;
    }
    btn.disabled = true;
    btn.classList.add('compressing');
    btn.title = tSync('manualCompressing');
    try {
      await compressConversationNow();
    } finally {
      btn.disabled = false;
      btn.classList.remove('compressing');
      btn.title = tSync('manualCompress');
    }
  });
}

// ========== 模型徽标自定义 tooltip（支持划线等 HTML） ==========
let _modelTipEl = null;
function modelTipHide() {
  if (_modelTipEl) {
    _modelTipEl.remove();
    _modelTipEl = null;
  }
}
function bindModelTip(anchor, html) {
  if (!html) return;
  anchor.addEventListener('mouseenter', (e) => {
    e.stopPropagation();
    modelTipHide();
    const tip = document.createElement('div');
    tip.className = 'model-badge-tip';
    tip.innerHTML = html;
    document.body.appendChild(tip);
    _modelTipEl = tip;
    const r = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.right + 8;
    if (left + tr.width > window.innerWidth - 8) left = r.left - tr.width - 8;
    let top = r.top + r.height / 2 - tr.height / 2;
    if (top < 8) top = 8;
    if (top + tr.height > window.innerHeight - 8) top = window.innerHeight - tr.height - 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });
  anchor.addEventListener('mouseleave', () => modelTipHide());
}
document.addEventListener('scroll', modelTipHide, true);
document.addEventListener('mousedown', () => modelTipHide(), true);

// 图片/视频加载失败：全局 error 事件委托（捕获阶段，error 事件不冒泡），
// 把破碎图标替换成可点击的外链。这是 UI 反馈兜底，不改变原始渲染逻辑。
(function installMediaFallbackListener() {
  function onError(ev) {
    const t = ev && ev.target;
    if (!t || t.dataset && t.dataset.__f) return;
    const tag = t && t.tagName;
    let kind = null;
    if (tag === 'IMG') kind = 'image';
    else if (tag === 'VIDEO') kind = 'video';
    if (!kind || !t.closest('.bubble')) return;
    const src = (t.dataset && t.dataset.src) || t.src || '';
    t.dataset.__f = '1';
    const fb = document.createElement('span');
    fb.className = 'media-fallback';
    const title = kind === 'image' ? '图片加载失败' : '视频加载失败';
    const linkText = kind === 'image' ? '在新窗口打开源链接' : '在新窗口播放/下载';
    fb.innerHTML = `<span class="mf-icon">${kind === 'image' ? '🖼️' : '🎞️'}</span>`
      + `<span class="mf-title">${title}</span>`
      + `<a class="mf-link" href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    const p = t.parentNode;
    if (p) p.replaceChild(fb, t);
  }
  document.addEventListener('error', onError, true);
})();

// 点击助手气泡内的生成图片 → 弹窗放大预览（生成视频自带 controls 可直接播放）
document.addEventListener('click', (e) => {
  const img = e.target.closest && e.target.closest('img');
  if (!img || !img.src || !img.closest('.bubble')) return;
  e.preventDefault();
  modelTipHide();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '400';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '24px';
  const big = document.createElement('img');
  big.src = img.src;
  big.style.maxWidth = '92%';
  big.style.maxHeight = '88%';
  big.style.borderRadius = '8px';
  big.style.objectFit = 'contain';
  big.style.background = '#000';
  overlay.style.cursor = 'zoom-out';
  overlay.appendChild(big);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
});

async function showModelDropdown() {
  await loadModels();
  const dropdown = $('model-dropdown');
  if (dropdown) dropdown.classList.add('visible');
}

function hideModelDropdown() {
  const dropdown = $('model-dropdown');
  if (dropdown) dropdown.classList.remove('visible');
}

// ========== 审批模式下拉 ==========
const APPROVAL_OPTIONS = [
  { mode: 'manual', key: 'approvalManual' },
  { mode: 'auto', key: 'approvalAuto' },
  { mode: 'full', key: 'approvalFull' },
];

function renderApprovalMode() {
  const nameEl = $('approval-mode-name');
  if (nameEl) {
    const opt = APPROVAL_OPTIONS.find(o => o.mode === state.approvalMode);
    nameEl.textContent = opt ? tSync(opt.key) : '--';
  }
  const dropdown = $('approval-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    for (const opt of APPROVAL_OPTIONS) {
      const item = el('div', 'approval-dropdown-item' + (opt.mode === state.approvalMode ? ' active' : ''));
      item.innerHTML = `<span>${escapeHtml(tSync(opt.key))}</span>` +
        (opt.mode === state.approvalMode ? '<svg class="check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '');
      item.addEventListener('click', () => {
        setApprovalMode(opt.mode);
        hideApprovalDropdown();
      });
      dropdown.appendChild(item);
    }
  }
  // 完全放行（full）模式：常驻黄色警示横幅 + 下拉标黄
  const warn = $('approval-warning');
  if (warn) warn.classList.toggle('hidden', state.approvalMode !== 'full');
  const sel = $('approval-selector');
  if (sel) sel.classList.toggle('warn', state.approvalMode === 'full');
}

function toggleApprovalDropdown() {
  const dropdown = $('approval-dropdown');
  if (!dropdown) return;
  if (dropdown.classList.contains('visible')) dropdown.classList.remove('visible');
  else dropdown.classList.add('visible');
}

function hideApprovalDropdown() {
  const dropdown = $('approval-dropdown');
  if (dropdown) dropdown.classList.remove('visible');
}

// ========== 设置面板：智能体 + 自定义技能 ==========
// 技能/工具/MCP 配置收拢到「智能体」维度：内置智能体锁定基础配置（只增不减），
// 自定义智能体完全自由；用户还可在设置中自建纯提示词技能。
let _editAgentId = null;  // 正在设置面板编辑的智能体 id
let _editSkillId = null;  // 正在编辑的自定义技能 id（'__new__' 表示新建）

// 整体渲染设置面板中的「智能体 + 自定义技能」区块。
// 被 openSettings 及 skills/index.js 各类配置变更后统一调用。
function renderSettingsPanel() {
  if (_editAgentId === null) {
    let first = getAllAgents()[0];
    _editAgentId = state.activeAgentId && getAgent(state.activeAgentId) ? state.activeAgentId : (first && first.id);
  }
  renderAgentTabs();
  renderAgentEditor();
  renderCustomSkillList();
}

// 智能体标签页：内置 + 自定义，点击切换编辑目标
function renderAgentTabs() {
  const box = $('agent-tabs');
  if (!box) return;
  box.innerHTML = '';
  // 编辑目标已不存在（被删除）时回落
  if (_editAgentId && _editAgentId !== '__new__' && !getAgent(_editAgentId)) _editAgentId = null;
  for (const agent of getAllAgents()) {
    const tab = el('button', 'agent-tab' + (agent.id === _editAgentId ? ' active' : ''));
    tab.type = 'button';
    tab.textContent = getAgentName(agent);
    tab.addEventListener('click', () => {
      _editAgentId = agent.id;
      renderAgentTabs();
      renderAgentEditor();
    });
    box.appendChild(tab);
  }
}

// 渲染当前编辑智能体的详情：基础信息 + 技能/工具/MCP 配置矩阵
function renderAgentEditor() {
  const box = $('agent-editor');
  if (!box) return;
  box.innerHTML = '';
  const agent = getAgent(_editAgentId);
  if (!agent) {
    box.appendChild(el('div', 'settings-model-hint', escapeHtml(tSync('agentSelectHint'))));
    return;
  }
  renderAgentDetail(box, agent);
}

function renderAgentDetail(box, agent) {
  const builtin = isBuiltinAgent(agent);
  const head = el('div', 'agent-editor-head');
  const titleWrap = el('span', 'agent-editor-title-wrap');
  titleWrap.appendChild(el('span', 'agent-editor-title', escapeHtml(getAgentName(agent))));
  // 内置/自定义标签：与 skill 卡片上的 badge 同款样式
  titleWrap.appendChild(el('span', 'skill-item-badge', escapeHtml(builtin ? tSync('agentBuiltin') : tSync('agentCustom'))));
  head.appendChild(titleWrap);
  // 上下文占用总计（agent 提示词 + 各启用技能提示词 + 工具 schema）放在名称行最右
  head.appendChild(el('span', 'agent-editor-meta',
    `${escapeHtml(tSync('ctxTotalLabel'))} ${escapeHtml(formatTokenCount(estimateAgentContext(agent).total))} tokens`));
  box.appendChild(head);
  if (builtin) {
    const desc = getAgentDesc(agent);
    if (desc) box.appendChild(el('div', 'settings-model-hint', escapeHtml(desc)));
  }

  // 名称 / 描述 / 系统提示（仅自定义可编辑）
  if (!builtin) {
    const f1 = el('div', 'agent-field');
    f1.appendChild(el('label', '', escapeHtml(tSync('agentName'))));
    const n = document.createElement('input');
    n.value = agent.name || '';
    f1.appendChild(n);
    const f2 = el('div', 'agent-field');
    f2.appendChild(el('label', '', escapeHtml(tSync('agentDesc'))));
    const d = document.createElement('input');
    d.value = agent.desc || '';
    f2.appendChild(d);
    const f3 = el('div', 'agent-field');
    f3.appendChild(el('label', '', escapeHtml(tSync('agentPrompt'))));
    const p = document.createElement('textarea');
    p.value = agent.prompt || '';
    f3.appendChild(p);
    box.appendChild(f1);
    box.appendChild(f2);
    box.appendChild(f3);
    const actions = el('div', 'agent-editor-head');
    const save = el('button', 'settings-btn', escapeHtml(tSync('save')));
    save.type = 'button';
    save.addEventListener('click', async () => {
      if (!n.value.trim()) { window.myzone.toast.warning(tSync('agentNameRequired')); return; }
      agent.name = n.value.trim();
      agent.desc = d.value.trim();
      agent.prompt = p.value;
      await saveCustomAgents();
      window.myzone.toast.success(tSync('saved'));
    });
    const del = el('button', 'settings-btn danger', escapeHtml(tSync('delete')));
    del.type = 'button';
    del.addEventListener('click', async () => {
      const id = agent.id;
      await deleteCustomAgent(id);
      if (_editAgentId === id) { _editAgentId = null; renderSettingsPanel(); }
    });
    actions.appendChild(save);
    actions.appendChild(del);
    box.appendChild(actions);
  }

  // 技能 / 工具 / MCP 配置矩阵（立即持久化）
  const cfg = buildAgentEditorCfg(agent);
  renderCfgEditor(box, cfg, {
    onSkill: (id, on) => setSkillEnabled(id, on, agent.id),
    onTool: (name, on) => setToolEnabled(name, on, agent.id),
    onServer: (id, on) => setMcpServerEnabled(id, on, agent.id),
  });
}

// 智能体详情里的上下文占用汇总：已被每张 skill 卡片头（真实估算）+ 顶部总计条取代，不再单独列表展示
function buildAgentEditorCfg(agent) {
  // 真实文本估算：为每个启用 skill 注入其「提示词 + 工具 schema」占用，供卡片头展示
  const ctx = estimateAgentContext(agent);
  const ctxBySkill = new Map(ctx.skillBreakdown.map(s => [s.id, s.total]));
  const skills = getAgentSkillConfig(agent.id)
    .filter(s => s.id !== '__mcp__') // MCP 工具只走下方 MCP 分区展示，避免与 __mcp__ 技能重复
    .map(s => ({
    id: s.id,
    label: s.label,
    descLabel: s.descLabel,
    buildin: s.buildin,
    locked: s.locked,
    enabled: s.enabled,
    ctxTotal: ctxBySkill.get(s.id) || 0,
    tools: (s.tools || []).map(t => {
      const def = getToolByName(t.name);
      return {
        name: t.name,
        label: tSync(t.labelKey),
        tokens: def ? estimateTokens(JSON.stringify(def.function || def)) : 0,
        locked: t.locked,
        enabled: t.enabled,
      };
    }),
  }));
  const groups = getMcpServerGroups(agent.id);
  const mcp = {
    servers: groups.map(g => {
      const tools = g.tools.map(t => {
        const def = getToolByName(t.toolName);
        return {
          toolName: t.toolName,
          label: t.label,
          tokens: def ? estimateTokens(JSON.stringify(def.function || def)) : 0,
          enabled: t.enabled,
          locked: false, // MCP 工具可单独开关，不受内置智能体锁定
        };
      });
      // MCP 服务器卡片的上下文徽记：与其「已启用工具」的真实 schema 占用一致
      const ctxTotal = tools.reduce((s, t) => s + (t.enabled ? t.tokens : 0), 0);
      return {
        serverId: g.serverId,
        name: g.name,
        extId: g.extId || '',
        online: g.online !== false, // 扩展窗口是否在线（离线服务仍展示，让模型认知其存在）
        enabled: g.enabled,
        locked: false, // MCP 服务器不随内置智能体锁定，可自由开启/关闭
        tools,
        ctxTotal,
      };
    }),
  };
  return { skills, mcp };
}

// 通用技能/工具/MCP 配置矩阵渲染。cfg：{ skills, mcp }；handlers：{ onSkill, onTool, onServer }
function renderCfgEditor(container, cfg, handlers) {
  // 卡片折叠按钮：挂在卡片 head 右侧，默认折叠（收起描述/工具明细），点击展开。
  // 折叠状态以 key 记录在 cfgExpanded，跨 renderCfgEditor 重建保持。
  function appendCardToggle(head, card, key) {
    const toggle = el('button', 'cfg-toggle', SVG_CHEVRON);
    const collapsed = !cfgExpanded.has(key);
    card.classList.toggle('collapsed', collapsed);
    toggle.classList.toggle('collapsed', collapsed);
    toggle.title = collapsed ? tSync('expandDetails') : tSync('collapseDetails');
    toggle.addEventListener('click', () => {
      const nowCollapsed = card.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed', nowCollapsed);
      toggle.title = nowCollapsed ? tSync('expandDetails') : tSync('collapseDetails');
      if (nowCollapsed) cfgExpanded.delete(key);
      else cfgExpanded.add(key);
    });
    head.appendChild(toggle);
  }

  const skillTitle = el('div', 'settings-section-title', escapeHtml(tSync('skillsSection')));
  container.appendChild(skillTitle);
  for (const sk of cfg.skills) {
    const group = el('div', 'skill-item' + (sk.enabled ? '' : ' disabled'));
    const head = el('div', 'skill-item-head');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sk.enabled;
    cb.disabled = sk.locked;
    cb.addEventListener('change', () => handlers.onSkill && handlers.onSkill(sk.id, cb.checked));
    head.appendChild(cb);
    head.appendChild(el('span', 'skill-item-title',
      escapeHtml(sk.label) + (sk.buildin ? `<span class="skill-item-badge">${escapeHtml(tSync('skillBadge'))}</span>` : '')));
    if (sk.ctxTotal) head.appendChild(el('span', 'skill-item-cost', `${escapeHtml(tSync('toolBudget'))} ${formatTokenCount(sk.ctxTotal)}`));
    appendCardToggle(head, group, 'skill:' + sk.id);
    group.appendChild(head);
    if (sk.descLabel) group.appendChild(el('div', 'skill-item-desc', escapeHtml(sk.descLabel)));
    if (sk.enabled && sk.tools && sk.tools.length) {
      const tools = el('div', 'skill-item-tools');
      for (const t of sk.tools) {
        const row = el('label', 'tool-item');
        const tb = document.createElement('input');
        tb.type = 'checkbox';
        tb.checked = t.enabled;
        tb.disabled = t.locked;
        tb.addEventListener('change', () => handlers.onTool && handlers.onTool(t.name, tb.checked));
        row.appendChild(tb);
        row.appendChild(el('span', 'tool-item-name', escapeHtml(t.label)));
        if (t.tokens) row.appendChild(el('span', 'tool-item-cost', formatTokenCount(t.tokens)));
        tools.appendChild(row);
      }
      group.appendChild(tools);
    }
    container.appendChild(group);
  }

  // MCP 服务器分组
  if (cfg.mcp && cfg.mcp.servers && cfg.mcp.servers.length) {
    container.appendChild(el('div', 'settings-section-title', escapeHtml(tSync('mcpSection'))));
    for (const sv of cfg.mcp.servers) {
      const mbox = el('div', 'mcp-server' + (sv.enabled ? '' : ' disabled'));
      const mhead = el('div', 'mcp-server-head');
      const scb = document.createElement('input');
      scb.type = 'checkbox';
      scb.checked = sv.enabled;
      scb.disabled = sv.locked;
      scb.addEventListener('change', () => handlers.onServer && handlers.onServer(sv.serverId, scb.checked));
      mhead.appendChild(scb);
      const nameEl = el('span', 'mcp-server-name', escapeHtml(sv.name));
      if (sv.extId) nameEl.title = tSync('mcpFromExt').replace('{{ext}}', sv.extId); // 扩展ID 不入名称，仅作 tooltip
      mhead.appendChild(nameEl);
      if (sv.online === false) {
        // 扩展窗口未打开：服务仍展示（让模型认知其存在），标记离线待用户打开再调用
        mhead.appendChild(el('span', 'mcp-server-offline', escapeHtml(tSync('mcpServerOffline'))));
      }
      if (sv.ctxTotal) mhead.appendChild(el('span', 'skill-item-cost', `${escapeHtml(tSync('toolBudget'))} ${formatTokenCount(sv.ctxTotal)}`));
      appendCardToggle(mhead, mbox, 'mcp:' + sv.serverId);
      mbox.appendChild(mhead);
      const tools = el('div', 'mcp-server-tools');
      for (const t of sv.tools) {
        const row = el('label', 'tool-item');
        const tb = document.createElement('input');
        tb.type = 'checkbox';
        tb.checked = t.enabled; // 每个 MCP 工具独立开关
        tb.disabled = t.locked;
        tb.addEventListener('change', () => handlers.onTool && handlers.onTool(t.toolName, tb.checked));
        row.appendChild(tb);
        row.appendChild(el('span', 'tool-item-name', escapeHtml(t.label)));
        if (t.tokens) row.appendChild(el('span', 'tool-item-cost', formatTokenCount(t.tokens)));
        tools.appendChild(row);
      }
      mbox.appendChild(tools);
      container.appendChild(mbox);
    }
  }
}

// ========== 自定义技能列表 ==========
function renderCustomSkillList() {
  const box = $('custom-skill-list');
  if (!box) return;
  box.innerHTML = '';
  const skills = state.customSkills || [];
  if (!skills.length) {
    box.appendChild(el('div', 'settings-model-hint', escapeHtml(tSync('customSkillsEmpty'))));
  }
  for (const s of skills) {
    const row = el('div', 'skill-item');
    const head = el('div', 'skill-item-head');
    head.appendChild(el('span', 'skill-item-title', escapeHtml(s.name || s.id)));
    const btns = el('div', 'skill-actions');
    const editBtn = el('button', 'settings-btn', escapeHtml(tSync('edit')));
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => { _editSkillId = s.id; renderCustomSkillList(); });
    const delBtn = el('button', 'settings-btn danger', escapeHtml(tSync('delete')));
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteCustomSkill(s.id));
    btns.appendChild(editBtn);
    btns.appendChild(delBtn);
    head.appendChild(btns);
    row.appendChild(head);
    box.appendChild(row);
  }
  if (_editSkillId !== null) renderCustomSkillForm(box);
}

function renderCustomSkillForm(box) {
  const editing = state.customSkills.find(s => s.id === _editSkillId) || null;
  const wrap = el('div', 'agent-editor');
  const f1 = el('div', 'agent-field');
  f1.appendChild(el('label', '', escapeHtml(tSync('skillName'))));
  const nameInput = document.createElement('input');
  nameInput.value = editing ? (editing.name || '') : '';
  f1.appendChild(nameInput);
  const f2 = el('div', 'agent-field');
  f2.appendChild(el('label', '', escapeHtml(tSync('skillPrompt'))));
  const promptArea = document.createElement('textarea');
  promptArea.value = editing ? (editing.prompt || '') : '';
  f2.appendChild(promptArea);
  wrap.appendChild(f1);
  wrap.appendChild(f2);
  const actions = el('div', 'agent-editor-head');
  const save = el('button', 'settings-btn', escapeHtml(tSync('save')));
  save.type = 'button';
  save.addEventListener('click', async () => {
    if (!nameInput.value.trim()) { window.myzone.toast.warning(tSync('skillNameRequired')); return; }
    if (editing) {
      editing.name = nameInput.value.trim();
      editing.prompt = promptArea.value;
    } else {
      createCustomSkill({ name: nameInput.value.trim(), prompt: promptArea.value });
    }
    _editSkillId = null;
    await saveCustomSkillsAll();
  });
  const cancel = el('button', 'settings-btn', escapeHtml(tSync('cancel')));
  cancel.type = 'button';
  cancel.addEventListener('click', () => { _editSkillId = null; renderCustomSkillList(); });
  actions.appendChild(cancel);
  actions.appendChild(save);
  wrap.appendChild(actions);
  box.appendChild(wrap);
}

// ========== Agent 选择（输入区下拉） ==========
// agent 在输入框工具栏用下拉选择（类似模型选择器），设置面板不再单独陈列。
function renderAgentSelector() {
  const nameEl = $('agent-name');
  if (nameEl) {
    const agent = getActiveAgent();
    nameEl.textContent = agent ? getAgentName(agent) : '--';
  }
  const dropdown = $('agent-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  for (const agent of getAllAgents()) {
    const item = el('div', 'approval-dropdown-item' + (agent.id === state.activeAgentId ? ' active' : ''));
    item.innerHTML = `<span>${escapeHtml(getAgentName(agent))}</span>` +
      (agent.id === state.activeAgentId ? '<svg class="check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '');
    item.title = getAgentDesc(agent);
    item.addEventListener('click', () => {
      setActiveAgent(agent.id);
      hideAgentDropdown();
    });
    dropdown.appendChild(item);
  }
}

function toggleAgentDropdown() {
  const dropdown = $('agent-dropdown');
  if (!dropdown) return;
  if (dropdown.classList.contains('visible')) dropdown.classList.remove('visible');
  else dropdown.classList.add('visible');
}

function hideAgentDropdown() {
  const dropdown = $('agent-dropdown');
  if (dropdown) dropdown.classList.remove('visible');
}

// 切换当前会话的 agent：改写会话首条 system 提示并持久化
async function setActiveAgent(agentId) {
  if (!getAllAgents().some(a => a.id === agentId)) return;
  state.activeAgentId = agentId;
  await window.myzone.storage.set('activeAgentId', agentId);
  // 切换到新智能体后，把其配置物化到全局（enabledSkills/enabledTools/enabledMcpServers）
  materializeActiveAgent();
  refreshContextBudget();
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (conv) {
    conv.agentId = agentId;
    if (state.history.length && state.history[0]?.role === 'system') {
      state.history[0].content = buildSystemPrompt();
    }
    conv.updatedAt = Date.now();
    await saveConversations();
  }
  renderAgentSelector();
  window.myzone.toast.success(tSync('agentChanged'));
  renderConversationList();
  updateConvTitle();
}

// ========== 设置面板 ==========
function openSettings() {
  const panel = $('settings-panel');
  const overlay = $('settings-overlay');
  if (panel) panel.classList.add('open');
  if (overlay) overlay.classList.add('visible');
  if (_editAgentId === null) {
    const first = getAllAgents()[0];
    _editAgentId = state.activeAgentId && getAgent(state.activeAgentId) ? state.activeAgentId : (first && first.id);
  }
  // 每次打开设置都重新发现一次 MCP 服务，刷新「扩展工具（MCP）」分区，
  // 实时反映其它扩展最新注册/注销的工具，无需重启页面。
  syncMcpTools()
    .then(() => { refreshContextBudget(); renderSettingsPanel(); })
    .catch(() => { renderSettingsPanel(); });
}

function closeSettings() {
  const panel = $('settings-panel');
  const overlay = $('settings-overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
}

// ========== 侧边栏 ==========
function toggleSidebar() {
  const sidebar = $('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

// ========== 上下文圆环 / 额度显示 ==========
// 探测当前激活模型（或默认模型）的上下文窗口上限与 API 额度，并刷新圆环。
// 内置模型无本地额度：改为读取 credits 余额（经网关 RPC，仅返回当前登录用户自己的余额）。
async function refreshModelMeta() {
  const ring = $('context-ring');
  if (!ring) return;
  const active = state.models.find(m => m.id === state.activeModelId);
  state.modelMeta.probing = true;
  renderTokenGauges();
  // credits 余额与内置/本地模型无关，始终读取并随徽标展示
  let creditsBalance = null;
  try {
    const res = await window.myzone.ai.getCreditsBalance();
    if (res && res.success && res.balance) creditsBalance = Number(res.balance.balance) || 0;
  } catch (e) { creditsBalance = null; }
  state.modelMeta.creditsBalance = creditsBalance;
  let meta = null;
  if (active && active.builtin) {
    // 内置模型无本地探测：上下文窗口取自后台配置的 context_length（未知时保持 null）
    state.modelMeta.contextLimit = Number(active.context_length) > 0 ? Number(active.context_length) : null;
    state.modelMeta.quota = null;
  } else {
    try {
      meta = await window.myzone.ai.getModelMeta();
    } catch (e) { meta = null; }
    if (meta && meta.success) {
      state.modelMeta.contextLimit = meta.contextLimit || null;
      state.modelMeta.quota = meta.quota || null;
    }
  }
  state.modelMeta.probing = false;
  renderTokenGauges();
}

// 记录某次真实请求的 prompt token 数（模型报告的实况，非估算），更新圆环。
// 存到对应会话上，切换会话时各自回显实际已用上下文，互不影响。
// realPeak = 该会话历史峰值用量：压缩/窗口的触发判断以峰值为准（压缩是「粘性」的，
// 一旦触发就持续压缩），而圆环展示仍用最近一次实况 contextUsed（压缩后回落到小值）。
function setContextUsed(tokens) {
  const n = Number(tokens);
  state.contextUsed = Number.isFinite(n) && n >= 0 ? n : null;
  const convId = state.generatingConvId || state.currentConvId;
  const conv = state.conversations.find(c => c.id === convId);
  if (conv) {
    conv.contextUsed = state.contextUsed;
    if (Number.isFinite(n) && n > 0) conv.realPeak = Math.max(Number(conv.realPeak) || 0, n);
  }
  renderTokenGauges();
}

// 某次请求因「超出上下文窗口」而失败时，用模型报告的精确 token 数更新圆环，
// 让界面如实反映已打到上限，而不是停留在上一次成功的旧值（例如显示 13% 但实际已超限）。
function markContextOverflow(errMsg) {
  const s = String(errMsg || '');
  if (!/context|exceed|limit|token/i.test(s)) return;
  const m = /\((\d+)\s*tokens?\)/i.exec(s);
  let n = m ? Number(m[1]) : state.modelMeta.contextLimit;
  if (Number.isFinite(n) && n > 0) setContextUsed(n);
}

function fmtMoney(n) { return n == null || !Number.isFinite(n) ? '--' : n.toFixed(2); }
function currencySym(c) { return c === 'USD' ? '$' : '¥'; }
function formatBalance(q) {
  const sym = currencySym(q.currency);
  if (q.provider === 'moonshot') {
    return `${sym}${fmtMoney(q.available)}${q.voucher != null ? `（券${fmtMoney(q.voucher)}/现${fmtMoney(q.cash)}）` : ''}`;
  }
  if (q.provider === 'siliconflow') {
    return `${sym}${fmtMoney(q.total != null ? q.total : q.available)}${q.charge != null ? `（充${fmtMoney(q.charge)}）` : ''}`;
  }
  // DeepSeek / 默认：总余额 + 充值/赠金明细
  return `${sym}${fmtMoney(q.total != null ? q.total : q.available)}${q.granted != null ? `（充${fmtMoney(q.toppedUp)}/赠${fmtMoney(q.granted)}）` : ''}`;
}

// 渲染上下文圆环 + 额度文本
// 圆环口径 = 当前会话最近一次真实请求的 prompt 用量（模型实况，与消息底部「上下文使用量」一致）。
// 尚未有实况（模型未报量 / 全新会话）时才回落为发送前估算（estimateEffectiveTokens，内部即 prepareMessages）。
// switchConversation / createConversation / 每轮结束(refreshModelMeta) 都会触发本函数刷新。
function renderTokenGauges() {
  const ringEl = $('context-ring-wrap');
  if (!ringEl) return;
  const limit = state.modelMeta.contextLimit;
  // 优先取模型实况（conv.contextUsed，模型报告的 prompt token）；离开/切换会话也会各自回显对应会话的实况。
  // 仅在无实况时回落为估算，避免与消息底部的真实用量数字打架。
  // 仅当会话里已有 user/assistant 消息时才展示；全新会话（只有系统提示）显示为空。
  let used = 0;
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  const hasHistory = conv && Array.isArray(conv.messages) &&
    conv.messages.some(m => m.role === 'user' || m.role === 'assistant');
  if (hasHistory) {
    const real = Number(conv && conv.contextUsed);
    // 无模型实况时回落为发送前估算；透传 realPeak 让压缩的粘性同样体现在回落估算里，
    // 避免「压缩后模型未报量 → 回落成全量未压缩估算 → 圆环又跳回大值」的假象。
    const fallbackEst = Number(estimateEffectiveTokens(conv.messages, limit, Number(conv && conv.realPeak) || 0)) || 0;
    used = Number.isFinite(real) && real > 0 ? real : fallbackEst;
  }
  const hasAny = used > 0;
  const pct = (limit && hasAny) ? Math.min(1, used / limit) : (limit ? (hasAny ? 0 : null) : null);

  // 手动压缩按钮：仅当前会话有可压缩的历史时显示（全新会话隐藏）
  const ccBtn = $('ctx-compress-btn');
  if (ccBtn) ccBtn.hidden = !hasHistory;

  const cls = state.modelMeta.probing ? 'probing' : (pct == null ? 'na' : (pct >= 0.85 ? 'warn' : ''));
  ringEl.className = 'context-ring-wrap';
  if (cls) ringEl.classList.add(cls);

  // 进度弧：circumference ≈ 2π·15 ≈ 94.25；offset = 94.25 × (1 − 进度)
  // 空/未知（pct 为 null）时整环隐藏进度，仅保留背景灰圈。
  const fg = $('context-ring-fg');
  if (fg) {
    const CIRC = 94.25;
    const off = pct == null ? CIRC : CIRC * (1 - pct);
    fg.style.strokeDashoffset = off.toFixed(2);
    fg.classList.toggle('dim', !hasAny);
  }

  const pctText = $('context-pct');
  const subText = $('context-sub');
  const ctxTip = $('context-tooltip');
  if (ctxTip) {
    ctxTip.textContent = !hasAny ? tSync('contextUnused')
      : (limit ? tSync('contextTooltip').replace('{{used}}', formatTokenCount(used)).replace('{{total}}', formatTokenCount(limit))
               : tSync('contextTooltipNoLimit').replace('{{used}}', formatTokenCount(used)));
  }

  if (pctText) {
    pctText.textContent = pct == null ? (state.modelMeta.probing ? tSync('contextProbing') : '--') : Math.round(pct * 100) + '%';
  }
  if (subText) {
    subText.textContent = limit ? `${formatTokenCount(used)}/${formatTokenCount(limit)}` : (hasAny ? String(formatTokenCount(used)) : '');
  }

  // 额度文本：左上角 credits 徽标始终显示（内置/本地模型一致）；本地模型另在工具栏显示费率/余量
  const quota = $('quota-text');
  const badge = $('credits-badge');
  const ctext = $('credits-text');
  const activeModel = state.models.find(m => m.id === state.activeModelId);
  // credits 徽标：与模型类型无关，始终显示；无余额时显示占位符
  if (badge) {
    badge.style.display = 'flex';
    badge.classList.toggle('probing', !!state.modelMeta.probing);
    const hasBalance = state.modelMeta.creditsBalance != null && Number.isFinite(state.modelMeta.creditsBalance);
    if (ctext) ctext.textContent = state.modelMeta.probing ? tSync('contextProbing')
      : (hasBalance ? formatCredits(state.modelMeta.creditsBalance) : '--');
  }
  // 工具栏额度：内置模型无本地费率，显示为空；本地模型显示其 quota
  if (quota) {
    if (activeModel && activeModel.builtin) {
      quota.textContent = '';
    } else {
      let text = '';
      const q = state.modelMeta.quota;
      if (state.modelMeta.probing) text = tSync('quotaProbing');
      else if (!q) text = tSync('quotaUnavailable');
      else if (q.isBalance) text = formatBalance(q);
      else if (q.used != null && q.available != null)
        text = tSync('quotaUsedRemain').replace('{{used}}', formatTokenCount(q.used)).replace('{{avail}}', formatTokenCount(q.available));
      else if (q.available != null) text = tSync('quotaAvailable').replace('{{avail}}', formatTokenCount(q.available));
      else if (q.used != null) text = tSync('quotaUsed').replace('{{used}}', formatTokenCount(q.used));
      else text = tSync('quotaUnavailable');
      quota.textContent = `${tSync('quotaLabel')}${text}`;
    }
  }
}

// credits 余额格式化：最多 3 位小数，去掉多余的 0
function formatCredits(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v * 1000) / 1000);
}

// ========== credits 用量明细 ==========
// 点击左上角 credits 徽标时，拉取当前用户最近的用量记录并弹出明细。
async function openCreditsDetail() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '300';
  const box = document.createElement('div');
  box.className = 'modal';
  box.style.maxWidth = '720px';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = tSync('creditsDetailTitle');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cfg-toggle';
  closeBtn.style.marginLeft = 'auto';
  closeBtn.style.fontSize = '16px';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.maxHeight = '60vh';
  body.style.overflowY = 'auto';

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  box.append(header, body);
  overlay.append(box);
  document.body.appendChild(overlay);

  // —— credits 信息：余额总览 + 获得记录（备注/有效期/用量），参考 TRAE WORK 风格 ——
  const fmtDT = (s) => s ? String(s).replace('T', ' ').slice(0, 16) : '--';
  const fmtValidity = (s) => s ? tSync('creditsValidUntil').replace('{{date}}', fmtDT(s)) : tSync('creditsValidForever');
  let creds = null;
  try {
    const cres = await window.myzone.ai.getCreditsEntries();
    if (cres && cres.success) creds = cres;
  } catch (e) { creds = null; }

  if (creds) {
    const info = document.createElement('section');
    info.className = 'credits-info';
    const ov = document.createElement('div');
    ov.className = 'credits-info-overview';
    const balBig = document.createElement('div');
    balBig.className = 'credits-info-balance';
    balBig.innerHTML = `<span class="credits-info-balance-num">${formatCredits(creds.balance)}</span>`
      + `<span class="credits-info-balance-label">${tSync('creditsAvailable')}</span>`;
    const stats = document.createElement('div');
    stats.className = 'credits-info-stats';
    stats.innerHTML = `<div><span>${tSync('creditsGranted')}</span><b>${formatCredits(creds.total_granted)}</b></div>`
      + `<div><span>${tSync('creditsSpent')}</span><b>${formatCredits(creds.total_spent)}</b></div>`;
    ov.append(balBig, stats);
    info.appendChild(ov);

    const gHead = document.createElement('div');
    gHead.className = 'credits-info-heading';
    gHead.textContent = tSync('creditsGrantsTitle');
    info.appendChild(gHead);

    const glist = document.createElement('div');
    glist.className = 'credits-grants';
    const grants = Array.isArray(creds.grants) ? creds.grants : [];
    const buildGrantCard = (g) => {
      const gcard = document.createElement('div');
      gcard.className = 'credits-grant' + (g.expired ? ' expired' : '');
      const used = Number(g.used) || 0;
      const total = Number(g.amount) || 0;
      const main = document.createElement('div');
      main.className = 'credits-grant-main';
      main.innerHTML = `<span class="credits-grant-remark">${escapeHtml(g.remark || tSync('creditsRemarkDefault'))}</span>`
        + `<span class="credits-grant-amount">+${formatCredits(g.amount)}</span>`;
      const meta = document.createElement('div');
      meta.className = 'credits-grant-meta';
      meta.textContent = `${fmtDT(g.created_at)} · ${g.expired ? tSync('creditsExpired') : fmtValidity(g.expires_at)}`;
      const usage = document.createElement('div');
      usage.className = 'credits-grant-usage';
      usage.textContent = tSync('creditsGrantUsed').replace('{{used}}', formatCredits(used)).replace('{{total}}', formatCredits(total));
      gcard.append(main, meta, usage);
      return gcard;
    };
    if (grants.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'credits-info-empty';
      empty.textContent = tSync('creditsGrantsEmpty');
      glist.appendChild(empty);
    } else {
      // 未过期条目在前，已过期的折叠排列在后
      const active = grants.filter((g) => !g.expired);
      const expired = grants.filter((g) => !!g.expired);
      active.forEach((g) => glist.appendChild(buildGrantCard(g)));
      if (expired.length) {
        const wrap = document.createElement('div');
        wrap.className = 'credits-grants-collapse';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'credits-grants-collapse-toggle';
        toggle.innerHTML = `<span>${tSync('creditsExpiredGrants').replace('{{count}}', expired.length)}</span>`
          + `<svg class="credits-grants-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        const container = document.createElement('div');
        container.className = 'credits-grants-collapsed';
        container.hidden = true;
        expired.forEach((g) => container.appendChild(buildGrantCard(g)));
        toggle.addEventListener('click', () => {
          const willExpand = container.hidden;
          container.hidden = !willExpand;
          wrap.classList.toggle('expanded', willExpand);
        });
        wrap.append(toggle, container);
        glist.appendChild(wrap);
      }
    }
    info.appendChild(glist);
    body.appendChild(info);
  }

  // —— 分页：表格 + 「加载更多」——
  const table = document.createElement('table');
  table.className = 'credits-detail-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>${tSync('creditsDetailTime')}</th><th>${tSync('creditsDetailModel')}</th>`
    + `<th>${tSync('creditsDetailTokens')}</th><th>${tSync('creditsDetailCost')}</th></tr>`;
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  const usageHead = document.createElement('div');
  usageHead.className = 'credits-info-heading';
  usageHead.textContent = tSync('creditsUsageTitle');
  body.append(usageHead, table);

  const foot = document.createElement('div');
  foot.className = 'credits-detail-foot';
  const infoEl = document.createElement('span');
  infoEl.className = 'credits-detail-info';
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'btn credits-more-btn';
  moreBtn.textContent = tSync('creditsDetailMore');
  foot.append(infoEl, moreBtn);
  body.appendChild(foot);

  const PAGE = 50;
  let offset = 0;
  let first = true;

  async function loadMore() {
    if (moreBtn.disabled) return;
    moreBtn.disabled = true;
    try {
      const res = await window.myzone.ai.getCreditsUsage(PAGE, offset);
      if (!res || !res.success) {
        body.innerHTML = '';
        body.textContent = (res && res.error) ? res.error : tSync('creditsDetailFailed');
        return;
      }
      // 兼容契约错位：正常情况下 items 是数组；若接口返回了对象（如数据库函数/主进程未同步到新版），给出明确提示而非崩溃。
      if (!Array.isArray(res.items)) {
        body.innerHTML = '';
        body.textContent = tSync('creditsDetailInvalid');
        return;
      }
      const items = res.items;
      for (const it of items) {
        const row = document.createElement('tr');
        const ts = it.created_at ? String(it.created_at).replace('T', ' ').slice(0, 16) : '--';
        const cached = Number(it.cached_prompt_tokens) || 0;
        const prompt = Number(it.prompt_tokens) || 0;
        const tokens = tSync('creditsDetailTokenFormat')
          .replace('{{inCached}}', formatTokenCount(Math.min(cached, prompt)))
          .replace('{{inUncached}}', formatTokenCount(Math.max(0, prompt - cached)))
          .replace('{{out}}', formatTokenCount(it.completion_tokens || 0));
        row.innerHTML = `<td>${ts}</td><td>${escapeHtml(it.model_name || '--')}</td>`
          + `<td>${tokens}</td><td>${formatCredits(it.credits_cost)}</td>`;
        tbody.appendChild(row);
      }
      offset += items.length;
      const total = (typeof res.total === 'number' && res.total > 0) ? res.total : offset;
      infoEl.textContent = tSync('creditsDetailCount')
        .replace('{{loaded}}', String(offset))
        .replace('{{total}}', String(total));
      const hasMore = !!res.has_more && items.length > 0;
      moreBtn.style.display = hasMore ? '' : 'none';
      if (first && items.length === 0) {
        foot.style.display = 'none';
        body.innerHTML = '';
        body.textContent = tSync('creditsDetailEmpty');
      }
      first = false;
    } catch (e) {
      moreBtn.style.display = 'none';
      infoEl.textContent = e && e.message ? String(e.message) : tSync('creditsDetailFailed');
    } finally {
      moreBtn.disabled = false;
    }
  }
  moreBtn.addEventListener('click', loadMore);
  await loadMore();
}
