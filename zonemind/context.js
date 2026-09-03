// myzone.ai-assistant / context.js —— 上下文分层优化（由轻到重）
//
// 发送给模型的 messages 不再「全量原样塞入」，而是经本模块统一加工：
//   L0 源头节流：单个工具输出按 token 预算写入上下文；超长→存本地缓存 + 写摘要，模型需要细节再用 result_read 重读
//   L1 滑动窗口：System 永久保留 + 首个用户目标（里程碑）+ 最近 N 轮完整配对；更早普通消息丢弃
//   L2 摘要压缩：有效用量仍逼近上限时，把中间的旧轮压缩成一段任务摘要；无廉价小模型时用确定性提炼，预留小模型接缝
//   L3 外部记忆卸载：超长单条消息转成 [Reference id:xxx] 引用标记，完整内容存本地缓存，按需取回
//   L4 KV 缓存纪律：以上只从「头部/旧位」削减、绝不乱改新的尾部，杜绝缓存失效（见 SKILL-SYSTEM.md）
//
// 关键原则：
//   - 只作用于「将要发送的副本」，绝不改动持久化的会话历史（历史里的原始记录必须完整，便于回溯/回放）。
//   - 任意时刻都能在「全量原始/有效视图」之间切换，不丢失数据。

'use strict';

// ========== 可调参数（集中在此，便于给 UI 设置面板挂开关） ==========
const CTX_CFG = {
  toolOutputBudget: 2000,      // 单个工具结果写入上下文的 token 上限（L0）
  windowKeepRounds: 6,         // L1 保留的最近完整轮数
  windowThreshold: 0.6,        // 有效用量达到 contextLimit 的这点比例时才启用 L1 窗口
  compressThreshold: 0.75,     // 有效用量达到 contextLimit 的这点比例即触发 L2 摘要压缩（提前压缩，而非等撑满 100%）
  msgRefBudget: 1200,          // 单条消息内容 token 超过该值就转引用（L3）
  compressKeepRounds: 3,       // L2 压缩后仍完整保留的最近轮数（当前任务细节不压缩）
  summaryBudget: 800,          // 摘要文本的 token 预算
};

// ========== 本地缓存（外部记忆，会话内存：原始完整内容） ==========
const CTX_CACHE = new Map();   // refId -> { text, ts }
function ctxStore(text) {
  const refId = 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  CTX_CACHE.set(refId, { text: String(text == null ? '' : text), ts: Date.now() });
  // 简单防膨胀：超过 300 条只留最近 200 条，避免长期会话内存失控
  if (CTX_CACHE.size > 300) {
    const keys = [...CTX_CACHE.keys()];
    for (const k of keys.slice(0, CTX_CACHE.size - 200)) CTX_CACHE.delete(k);
  }
  return refId;
}
function ctxGet(refId) {
  const hit = CTX_CACHE.get(String(refId || '').trim());
  return hit ? hit.text : null;
}

// ========== L0/L3：单个较长文本 → 存缓存 + 紧凑预览 ==========
// 尽量保留原始返回值的「原始叶子字段」（数字/布尔/短字符串），对超长字段只留截断预览，
// 并在结果里带上 _truncatedOutput / _refId，让模型知道被截断、且可通过 result_read 取回完整内容。
function reduceLeaf(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  const t = typeof v;
  if (t === 'object' && Array.isArray(v)) {
    return Array.isArray(v) && v.length > 8 ? `[Array(${v.length}) 已省略，共 ${JSON.stringify(v).length} 字符]` : v;
  }
  return `[${t} 已省略]`;
}

// 把一个工具的完整返回字符串压到预算内；返回「发给模型的字符串 + 是否截断 + refId」
function capToolOutput(fn, tool, fullText, overrideBudget) {
  const full = String(fullText == null ? '' : fullText);
  // result_read 是「显式取回完整内容」：必须完整返回，否则读到又被截断成新 refId，导致永远读不满的死循环。
  if (fn === 'result_read') return { text: full, refId: null };
  const budget = Number.isFinite(overrideBudget) ? overrideBudget : (tool && tool.outputBudget) || CTX_CFG.toolOutputBudget;
  if (estimateTokens(full) <= budget) return { text: full, refId: null };

  // 超长：完整内容进缓存，上下文只留「可解析的紧凑对象」
  const refId = ctxStore(full);
  let preview;
  try {
    const obj = JSON.parse(full);
    const out = { success: obj && obj.success === true, _truncatedOutput: true, _refId: refId, _wasTool: fn };
    const omitted = [];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (k === 'success') continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object') { omitted.push(k); continue; }
        out[k] = reduceLeaf(v);
      }
    }
    if (omitted.length) out._omittedKeys = omitted.slice(0, 12);
    preview = out;
  } catch (e) {
    preview = { success: false, _truncatedOutput: true, _refId: refId, _wasTool: fn, _preview: full.slice(0, budget * 3) };
  }
  return { text: JSON.stringify(preview), refId, truncated: true };
}

// ========== L3：超长单条消息 → 引用标记（只改副本，不动历史） ==========
function toReferenceContent(m) {
  // m 为克隆后的 message；把超长 content 替换成引用标记
  const full = typeof m.content === 'string' ? m.content : '';
  const refId = ctxStore(full);
  const excerpt = full.slice(0, 240);
  m.content = `[Reference id:${refId}：该内容较长已卸载到本地缓存如需完整内容请调用 result_read]…${excerpt}`;
  m._ctxRef = refId;
}

// ========== L1：按 turnId 分组（保证 tool_call ⟷ tool_response 配对完整） ==========
// 同一轮的所有消息共享 turnId，整组一起保留或一起丢弃，绝不拆散配对。
function groupRounds(msgs) {
  const rounds = [];
  const map = new Map(); // key -> { key, msgs: [] }
  let noTurnSeq = 0;
  for (const m of msgs) {
    let key = m.turnId;
    if (!key) {
      // 老会话可能没有 turnId：聚成一个伪组整体保留，避免把 tool_response 从 tool_calls 里拆开
      key = '__noTurn__' + noTurnSeq++;
    }
    let g = map.get(key);
    if (!g) { g = { key, msgs: [] }; map.set(key, g); rounds.push(g); }
    g.msgs.push(m);
  }
  return rounds;
}

function isToolMsg(m) {
  return m && (m.role === 'tool' || (Array.isArray(m.tool_calls) && m.tool_calls.length));
}

// 取一条消息的完整文本。两类「已卸载」消息都要从本地缓存取回原样：
//  L3 引用（_ctxRef）：content 被替换成引用标记，完整内容在缓存里；
//  L0 截断的工具输出：history 里存的是带 _refId 的紧凑预览，完整内容同样在缓存里。
// 读摘要/提炼时必须取回，否则长消息/工具返回的文件内容会在压缩前就丢光。
function msgFullText(m) {
  if (!m) return '';
  if (m._ctxRef) {
    const full = ctxGet(m._ctxRef);
    if (full) return full;
  }
  let text = Array.isArray(m.content)
    ? m.content.filter(p => p && p.type === 'text' && p.text != null).map(p => p.text).join(' ') // 多模态：仅取文本 part，图片不进摘要
    : (typeof m.content === 'string' ? m.content : '');
  if (m.role === 'tool' && text && text.includes('_refId')) {
    try {
      const obj = JSON.parse(text);
      const full = obj && obj._refId ? ctxGet(obj._refId) : null;
      if (full) return full;
    } catch (e) { /* 非 JSON 内容，原样返回 */ }
  }
  return text;
}

// 判断该轮是否含可提炼的「结论/出错/目标」文本（供确定性摘要使用）
function roundText(round) {
  let goal = '', conclusion = '', errors = [];
  for (const m of round.msgs) {
    if (!m) continue;
    const txt = msgFullText(m);
    if (m.role === 'user' && txt && !goal) goal = txt;
    if (m.role === 'assistant' && txt && !Array.isArray(m.tool_calls) && txt.trim() && !conclusion) {
      conclusion = txt;
    }
    if (m.role === 'tool' && txt) {
      const ct = txt.toLowerCase();
      if (ct.includes('"success":false') || ct.includes('success:false')) errors.push(txt.slice(0, 160));
    }
  }
  return { goal, conclusion, errors };
}

// ========== L2：确定性摘要（无廉价小模型时的兜底；有则替换为 LLM 摘要） ==========
// 预留小模型接缝：将来配置了 state.summarizerModelId 后，可在这里换成调用迷你模型的异步摘要，
// 这里先保证「无模型也能压缩」，把目标/结论/出错提炼成结构化文本。
function summarizeRounds(rounds, budget) {
  const parts = [];
  for (const r of rounds) {
    const t = roundText(r);
    if (t.goal && !parts.some(p => p[0] === t.goal)) parts.push(['目标', t.goal]);
    if (t.conclusion) parts.push(['结论', t.conclusion]);
    for (const e of t.errors) parts.push(['出错', e]);
  }
  let text = '［此前对话进度摘要］';
  for (const [k, v] of parts) {
    text += `\n${k}：${String(v).replace(/\n+/g, ' ').slice(0, 300)}`;
    if (estimateTokens(text) > budget) break;
  }
  return text;
}

// ========== L2 增强：用「综合倍率最低的内置聊天模型」生成更高质量的摘要 ==========
// 规则提炼（summarizeRounds）只能抄原文片段；有可用内置模型时，把要压缩的中间轮原文交给
// 最低倍率聊天模型做语义归纳，质量高得多、成本可忽略（压缩非高频操作）。摘要升级是「增强」：
// 无内置模型 / 调用失败 / 超时一律保留规则提炼的摘要，压缩绝不能阻塞发送（唯一必要的回退点）。

const LLM_SUMMARY_SYSTEM =
  '你是会话压缩助手。请把下面这段对话历史压缩成一段信息完整、紧凑的连续性摘要，用于后续对话继续执行。必须精确保留：\n' +
  '1. 用户的核心目标与关键指令（尽量保留原意，不要概括丢失）\n' +
  '2. 已完成的关键动作及其结果/结论\n' +
  '3. 关键的文件路径、命令、数据、参数、决策（不要省略、改写或模糊化）\n' +
  '4. 出现过的错误与已采用的解决办法\n' +
  '5. 尚未完成的事项与下一步计划（务必保留，不要遗漏）\n' +
  '可以压缩寒暄、叙述性语言与已无用的旧细节，但关键信息一个都不能丢；信息量大时宁可精简措辞也要覆盖完整。\n' +
  '用简洁中文输出，可用简短分条但不要用 markdown 标题和列表符号；总长度控制在 800 tokens 以内。不要编造不存在的内容。';

// 选「聊天类」中综合消耗倍率（effectiveRate）最低的内置模型；无可用内置模型返回 null
function pickCheapestChatModel() {
  const pool = (state.builtinModels || []).filter(m =>
    ((m.model_type || 'chat') === 'chat') &&
    m.builtinModelId &&
    Number.isFinite(Number(m.effectiveRate)) && Number(m.effectiveRate) > 0
  );
  if (!pool.length) return null;
  pool.sort((a, b) => Number(a.effectiveRate) - Number(b.effectiveRate));
  return pool[0];
}

// 把待压缩轮次转成喂给摘要模型的纯文本（限量截断，避免摘要调用本身超限）。
// 从「最接近保留轮」的轮次倒序拼装：最近的压缩内容最相关，空间不够时先丢最早的（首轮里程碑已单独保留在发送视图里）。
function buildSummaryPrompt(rounds) {
  const lines = [];
  let total = 0;
  const MAX = 20000; // 上限（字符），摘要模型上下文一般远大于此
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i];
    if (total >= MAX) break;
    for (let j = r.msgs.length - 1; j >= 0; j--) {
      const m = r.msgs[j];
      if (total >= MAX) break;
      const role = m.role === 'assistant' ? '助手' : (m.role === 'user' ? '用户' : '工具');
      let text = msgFullText(m);
      if (!text && Array.isArray(m.tool_calls)) {
        text = m.tool_calls.map(tc => (tc.function && tc.function.name) || '').filter(Boolean).join(', ');
        if (text) text = '[调用工具] ' + text;
      }
      if (!text || !text.trim()) continue;
      const line = `${role}：${text.replace(/\n+/g, ' ').slice(0, 1000)}`;
      lines.unshift(line); // 逆序拼装后还原对话顺序
      total += line.length;
    }
  }
  return lines.join('\n');
}

// 把摘要文本压回 summaryBudget 预算内（按估算 token 比例截断，中文近似线性）。
// 摘要常把「结论/未完成事项」写在末尾，只留头部会切断关键收尾，因此超限时头尾各留一部分。
function capSummary(text, budget) {
  const s = String(text == null ? '' : text).trim();
  if (!s || estimateTokens(s) <= budget) return s;
  const keep = Math.ceil(s.length * (budget / estimateTokens(s)));
  if (keep >= s.length) return s;
  const head = s.slice(0, Math.ceil(keep * 0.6));
  const tail = s.slice(s.length - Math.floor(keep * 0.4));
  return head + '\n…\n' + tail;
}

// 对「将实际发送」的 messages 里的 _ctxSummary 消息做 LLM 摘要升级（替换规则提炼占位）。
// 同批被压缩轮次（按 turnId key 组合）缓存复用，本轮多轮工具调用不重复调模型。
// 失败/无模型时保留原有规则提炼摘要；_sourceRounds 只用于本次升级，不随消息发送。
const LLM_SUMMARY_CACHE = new Map(); // key(被压缩轮次的 turnId 组合) -> { text }
async function upgradeSummaryToLLM(messages) {
  if (!Array.isArray(messages)) return;
  const target = messages.find(m => m && m._ctxSummary && Array.isArray(m._sourceRounds) && m._sourceRounds.length);
  if (!target) return;
  const model = pickCheapestChatModel();
  const key = target._sourceRounds.map(r => r.key).join(',');
  if (model) {
    const cached = LLM_SUMMARY_CACHE.get(key);
    if (cached && cached.text) {
      target.content = cached.text;
      delete target._sourceRounds;
      delete target._ctxSummary;
      return;
    }
    let text = null;
    try {
      const res = await Promise.race([
        window.myzone.ai.chat({
          backend: 'built-in',
          modelId: model.builtinModelId,
          messages: [
            { role: 'system', content: LLM_SUMMARY_SYSTEM },
            { role: 'user', content: buildSummaryPrompt(target._sourceRounds) },
          ],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('summary timeout')), 20000)),
      ]);
      if (res && res.success && typeof res.content === 'string' && res.content.trim()) text = res.content.trim();
    } catch (e) {
      text = null;
    }
    if (text) {
      const capped = capSummary(text, CTX_CFG.summaryBudget);
      target.content = capped;
      LLM_SUMMARY_CACHE.set(key, { text: capped });
      if (LLM_SUMMARY_CACHE.size > 50) LLM_SUMMARY_CACHE.delete(LLM_SUMMARY_CACHE.keys().next().value);
    }
  }
  delete target._sourceRounds;
  delete target._ctxSummary;
}

// 在会话历史中记录「历史对话已压缩」事件（持久化，回放时可见）。
// 手动/自动压缩都不改写历史（原始记录完整保留），标记只是状态提示：追加到历史末尾，
// 回显时 noticeAfterCompression 会把它渲染在最后一条消息之后，避免浮在消息中间显得突兀。
// 压缩是粘性的（触发后每次发送都会重压），因此每个会话只标记一次，避免堆积多个事件。
// 返回事件在 history 中的下标；已存在压缩标记则返回 null。
function markCompression(history) {
  if (!Array.isArray(history)) return null;
  for (const m of history) {
    if (m && m.role === 'event' && m.type === 'ctx_compressed') return null;
  }
  history.push({ role: 'event', type: 'ctx_compressed' });
  return history.length - 1;
}

// ========== 主入口：把会话历史加工成「将实际发送」的 messages ==========
// 返回 { messages, est, overflow, compressed }；不修改传入 history。realUsed 为模型上报的真实 prompt token（可选）。
//
// 削减原则（保守：摘要优先、不直接丢）：
//   - 有效用量未越过窗口阈值：全量直发，一条内容都不削减。
//   - 越过窗口阈值：把「首轮里程碑 + 最近 N 轮」之外的中间旧轮浓缩成一段摘要，关键信息以摘要形式
//     完整保留，而不是像纯滑动窗口那样把中间轮无声删除（这正是「丢内容要保守」的落点）。
//   - 摘要后有效用量仍逼近上限才逐轮收紧「最近完整保留」的轮数；一旦压到底仍超限，属真实超限，
//     交给 overflow 由上层拦截提示，绝不继续丢弃近期内容。
function prepareMessages(history, limit, realUsed) {
  const finiteLimit = Number.isFinite(limit) && limit > 0;
  const all = (history || []).filter(m => m && m.role !== 'event').map(m => ({ ...m }));

  // 先按 round 分组（system 单独剥离），好判定哪几轮是「最近 N 轮」，保证本期细节不被卸载
  const rounds0 = groupRounds(all.filter(m => m.role !== 'system'));
  const recentKeys = new Set(rounds0.slice(Math.max(0, rounds0.length - CTX_CFG.windowKeepRounds)).map(r => r.key));
  const system = all.filter(m => m.role === 'system');

  // L3：老消息中超长单条转引用（克隆替换，历史不动）；最近 N 轮的细节原样保留（L4 纪律）
  const primary = [];
  for (const r of rounds0) {
    const recent = recentKeys.has(r.key);
    for (const m of r.msgs) {
      const text = typeof m.content === 'string' ? m.content : '';
      if (!recent && text && estimateTokens(text) > CTX_CFG.msgRefBudget) toReferenceContent(m);
      primary.push(m);
    }
  }
  // 保持原始顺序：系统提示在最前，其余消息紧随
  primary.unshift(...system);

  const est = estimatePromptTokens(primary);
  // 触发口径 = max(估算, 模型上报的真实用量)：顶部圆环优先显示模型实况，压缩/窗口触发也应跟随，
  // 避免「圆环已到 75% 而估算没到」导致压缩迟迟不触发（中文场景估算常偏低）。
  const fullUsed = finiteLimit ? Math.max(est, Number.isFinite(realUsed) && realUsed > 0 ? realUsed : 0) : est;
  // 未越过窗口阈值：全量直发（保守，内容一条不丢）
  if (!finiteLimit || fullUsed <= limit * CTX_CFG.windowThreshold) {
    return { messages: primary, est, overflow: finiteLimit && est >= limit, compressed: false };
  }

  // 越过窗口阈值：摘要压缩。从保留最近 compressKeepRounds 轮开始，把中间旧轮压缩成一段摘要；
  // 摘要后有效用量仍高于触发线才逐轮收紧保留轮数，绝不直接丢弃旧轮。
  const rounds = groupRounds(primary.filter(m => m.role !== 'system'));
  const triggerLine = limit * CTX_CFG.compressThreshold;
  let keptRounds = CTX_CFG.compressKeepRounds;
  let compressed = false;
  let result = { messages: primary, est, overflow: finiteLimit && est >= limit, compressed: false };
  while (finiteLimit && keptRounds > 1) {
    const compLast = rounds.slice(Math.max(0, rounds.length - keptRounds));
    const tailKeys = new Set(compLast.map(r => r.key));
    const firstKey = rounds[0] && rounds[0].key;
    const toCompress = rounds.filter(r => !(r.key === firstKey || tailKeys.has(r.key)));
    const summaryMsg = {
      role: 'user',
      content: '',
      _ctxSummary: true,
    };
    if (toCompress.length) {
      compressed = true;
      summaryMsg.content = summarizeRounds(toCompress, CTX_CFG.summaryBudget);
      // 记录被压缩的轮次，供发送前 upgradeSummaryToLLM 用最低倍率模型升级为语义摘要
      summaryMsg._sourceRounds = toCompress;
    }
    // 重组：system + 首轮里程碑 + 摘要 + 最近 keptRounds 轮（摘要位于尾部之前，头部不经常变，利于缓存）
    const out = [...system];
    if (rounds.length && firstKey && !tailKeys.has(firstKey)) out.push(...rounds[0].msgs);
    if (summaryMsg.content) out.push(summaryMsg);
    out.push(...compLast.flatMap(r => r.msgs));
    const wEst = estimatePromptTokens(out);
    result = { messages: out, est: wEst, overflow: finiteLimit && wEst >= limit, compressed };
    // 已回到触发线下方（或本轮没有可压的轮次）：一次到位则停，不继续收紧
    if (wEst < triggerLine) return result;
    keptRounds--;
  }
  return result;
}

// ========== 手动压缩 ==========
// 用户主动压缩当前会话。与自动压缩完全同源：只作用于「将实际发送」的副本（prepareMessages 在
// 发送时把中间旧轮压成摘要），绝不改写持久化会话历史——历史里的原始记录必须完整保留供用户回看。
// 手动压缩只是主动触发（不等阈值）：生成/升级语义摘要 → 落一条持久化「历史对话已压缩」标记事件 →
// 刷新上下文圆环。真实消息一字不动，仅当确实有内容被压缩时才落标记。
async function compressConversationNow() {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (!conv || !Array.isArray(conv.messages)) return false;
  const limit = state.modelMeta.contextLimit;
  const rounds = groupRounds(conv.messages.filter(m => m && m.role !== 'event' && m.role !== 'system'));
  // 会话太短（没有可压缩的中间旧轮）时不操作
  if (rounds.length <= CTX_CFG.compressKeepRounds + 1 || !(Number.isFinite(limit) && limit > 0)) {
    window.myzone.toast.show(tSync('ctxCompressNothing'), 'info');
    return false;
  }
  // 压缩进行中：toast 提示，配合按钮上的旋转加载圈给出过程反馈
  window.myzone.toast.show(tSync('ctxCompressing'), 'info');

  // 与自动压缩同一套逻辑（见 ai.js runChatLoop）：prepareMessages 产出发送副本并生成摘要，
  // upgradeSummaryToLLM 用最低倍率模型升级为语义摘要，markCompression 只插「已压缩」标记事件。
  // 三者都只动发送副本/追加事件，绝不改写 conv.messages 里的真实消息。
  const prep = prepareMessages(conv.messages, limit, Number(conv.realPeak) || 0);
  if (!prep.compressed) {
    window.myzone.toast.show(tSync('ctxCompressNothing'), 'info');
    return false;
  }
  await upgradeSummaryToLLM(prep.messages); // 失败保留规则摘要，压缩绝不阻塞
  markCompression(conv.messages);           // 只追加「历史对话已压缩」事件，真实消息一字不动
  conv.contextUsed = null; // 圆环回落到「压缩后有效视图」估算；保留 realPeak，保证回落口径与真实发送一致
  state.history = conv.messages;
  await saveConversations();
  // 压缩后整体重渲染，先清空再渲染，避免旧历史残留 + 新历史追加造成重复
  $('chat').innerHTML = '';
  renderHistory(conv.messages);
  renderConversationList();
  renderTokenGauges();
  window.myzone.toast.success(tSync('ctxCompressedDone'));
  return true;
}

// 有效视图的 token 估算（供 UI 圆环与发送前拦截共用，保证「所见即所发」）。
// realUsed 透传会话峰值（realPeak）：压缩是「粘性」的，圆环回落估算时也要按峰值口径压缩，
// 否则压缩后模型未报量 → 回落成全量未压缩估算 → 圆环跳回大值，与实际发送不一致。
function estimateEffectiveTokens(history, limit, realUsed) {
  try { return prepareMessages(history, limit, realUsed).est; } catch (e) { return estimatePromptTokens(history); }
}