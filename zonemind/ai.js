// myzone.ai-assistant / ai.js
// AI 对话循环与流式渲染。生成绑定到「发起时的会话」，切换会话不会打断生成。

'use strict';

// ========== 流式渲染 ==========
// streamState 保存原始文本累积（thinkingRaw / contentRaw）+ DOM 引用。
// 生成期间无论用户切换到哪个会话，原始文本都会持续累积；仅当正在查看生成会话时才更新 DOM。
function getStreamState() {
  if (!state.streamState) {
    state.streamState = { thinkingRaw: '', contentRaw: '', usage: null, thinking: null, content: null, raf: 0, thinkDone: false };
  }
  return state.streamState;
}

function handleStreamEvent(evt) {
  const s = getStreamState();
  if (evt.type === 'reasoning' && evt.text) {
    s.thinkingRaw += evt.text;
    scheduleStreamRender();
  } else if (evt.type === 'content' && evt.text) {
    s.contentRaw += evt.text;
    // 思考过程结束：模型开始输出正文，立即折叠思考气泡（而不是等整轮结束）
    s.thinkDone = true;
    collapseFinishedThinking(s);
    scheduleStreamRender();
  } else if (evt.type === 'tool_calls' && Array.isArray(evt.toolCalls)) {
    // 思考结束、进入工具调用：同样立即折叠
    s.thinkDone = true;
    collapseFinishedThinking(s);
    scheduleStreamRender();
  } else if (evt.type === 'usage' && evt.usage) {
    // 模型返回真实用量时即时更新上下文圆环（实况数值，不做估算）
    setContextUsed(evt.usage.prompt_tokens || 0);
    s.usage = { ...evt.usage };
  } else if (evt.type === 'queue') {
    // 并发排队状态：排队中在打字指示气泡上显示「第 N 位」，轮到后恢复打字动画
    handleQueueEvent(evt);
  } else if (evt.type === 'done') {
    scheduleStreamRender();
    // 网关在流中检测到余额耗尽并中断：已生成部分已保留，提示用户补充额度
    if (evt.interrupted === 'insufficient_balance') {
      window.myzone.toast.warning(tSync('creditsInsufficient'));
    }
  }
}

// 并发排队状态展示：仅在查看正在生成的会话时更新打字指示气泡
function handleQueueEvent(evt) {
  if (!isViewingGenerating()) return;
  const el = state.thinkingEl;
  if (!el || !el.isConnected) return;
  const bubble = el.querySelector('.bubble');
  if (!bubble) return;
  if (evt.status === 'queued') {
    bubble.innerHTML = `<div class="queue-status">${escapeHtml(tSync('queueWaiting').replace('{{pos}}', String(evt.position)))}</div>`;
  } else if (evt.status === 'processing') {
    // 轮到处理：恢复打字动画，等思考/回答流接管
    bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  }
  scrollToBottomIfNearBottom();
}

// 思考过程（reasoning 流）结束即折叠成一行标题：正文隐藏，可点击展开。
// 仅当确有思考内容且思考已完成时才折叠。
function collapseFinishedThinking(s) {
  if (!s || !s.thinkDone || !s.thinking || !s.thinkingRaw) return;
  collapseThinking(s.thinking);
}

// 用 rAF 节流 markdown 重渲染，避免每个 token 都整块重排
function scheduleStreamRender() {
  const s = getStreamState();
  if (s.raf) return;
  s.raf = requestAnimationFrame(() => {
    const st = getStreamState();
    st.raf = 0;
    // 不在查看生成会话时跳过 DOM 更新（原始文本已累积）
    if (!isViewingGenerating()) return;
    if (st.thinkingRaw) {
      // 切换会话会清空 #chat，原有流式节点会被回收为游离节点；需按需重建并接回视图
      if (!st.thinking || !st.thinking.el.isConnected) st.thinking = ensureStreamThinking();
      st.thinking.body.innerHTML = renderMarkdown(st.thinkingRaw);
      if (st.thinkDone) collapseThinking(st.thinking);
    }
    if (st.contentRaw) {
      if (!st.content || !st.content.el.isConnected) st.content = ensureStreamContent();
      st.content.bubble.innerHTML = renderMarkdown(st.contentRaw);
    }
    scrollToBottomIfNearBottom();
  });
}

function ensureStreamThinking() {
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble thinking-bubble');
  const header = el('div', 'thinking-header');
  header.innerHTML = `<span class="thinking-icon">${SVG_BRAIN}</span><span class="thinking-title">${escapeHtml(tSync('thinkingProcess'))}</span><span class="thinking-toggle">${escapeHtml(tSync('hideThinking'))}</span>`;
  const body = el('div', 'thinking-body');
  bubble.appendChild(header);
  bubble.appendChild(body);
  msg.appendChild(bubble);
  header.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    header.querySelector('.thinking-toggle').textContent = collapsed ? tSync('hideThinking') : tSync('showThinking');
    // 用户手动展开后标记，避免未结束对话时又被流式渲染自动折叠回去
    if (collapsed) body._pinnedOpen = true;
  });
  insertBeforeThinking(msg);
  scrollToBottomIfNearBottom();
  return { raw: '', body, el: msg };
}

// 思考过程展示完成后自动折叠成一行标题（正文隐藏，可点击展开）。
// 只自动折叠一次：若用户已手动展开（_pinnedOpen），或已处于折叠态，均不再重复折叠。
function collapseThinking(th) {
  if (!th || !th.body) return;
  if (th.body._pinnedOpen) return;              // 已被用户手动展开，尊重用户不再自动折叠
  if (th.body.style.display === 'none') return; // 已折叠，无需重复
  th.body.style.display = 'none';
  const header = th.body.parentNode ? th.body.parentNode.querySelector('.thinking-header') : null;
  if (header) {
    const t = header.querySelector('.thinking-toggle');
    if (t) t.textContent = tSync('showThinking');
  }
}

function ensureStreamContent() {
  const msg = el('div', 'msg assistant');
  msg.appendChild(el('div', 'avatar assistant', SVG_AVATAR_ASSISTANT));
  const bubble = el('div', 'bubble markdown-body');
  msg.appendChild(bubble);
  insertBeforeThinking(msg);
  scrollToBottomIfNearBottom();
  return { raw: '', bubble, el: msg };
}

// 流结束后的最终定稿：补全 markdown 渲染并附上 token 用量。
// 数据已写入会话历史，因此无论是否正在查看都视为「已渲染」，避免重复输出。
function finalizeStreamBubble(text, usage, uid, creditsCost) {
  const s = getStreamState();
  // 仅当流式节点仍在视口内（未被切换会话清空）时复用其 DOM；否则重新渲染一条完整气泡，
  // 避免终稿写进已游离的旧节点导致回复「消失」。
  if (isViewingGenerating() && s && s.content && s.content.el.isConnected) {
    s.content.raw = text || '';
    s.content.bubble.innerHTML = renderMarkdown(s.content.raw);
    if (usage || creditsCost) s.content.bubble.appendChild(el('div', 'token-usage', formatUsageText(usage, creditsCost)));
    if (uid) {
      const msgEl = s.content.bubble.closest('.msg');
      if (msgEl && !msgEl.dataset.uid) attachMsgHover(msgEl, 'assistant', uid);
    }
    scrollToBottomIfNearBottom();
  } else if (isViewingGenerating() && text && text.trim()) {
    addAssistantBubble(text.trim(), usage || null, uid, creditsCost);
  }
  return true;
}

// 切换到正在生成的会话时，把已累积的流式内容渲染到当前视图
function renderLiveStreamToView() {
  if (state.currentConvId !== state.generatingConvId) return;
  const s = getStreamState();
  if (!s) return;
  if (s.thinkingRaw) {
    // 切换会话时 #chat 被清空，旧节点已游离；需重建并接回视图才能看到已累积的流式内容
    if (!s.thinking || !s.thinking.el.isConnected) s.thinking = ensureStreamThinking();
    s.thinking.body.innerHTML = renderMarkdown(s.thinkingRaw);
    if (s.thinkDone) collapseThinking(s.thinking);
  }
  if (s.contentRaw) {
    if (!s.content || !s.content.el.isConnected) s.content = ensureStreamContent();
    s.content.bubble.innerHTML = renderMarkdown(s.contentRaw);
  }
  if (!s.thinkingRaw && !s.contentRaw && (!state.thinkingEl || !state.thinkingEl.isConnected)) {
    ensureThinking();
  }
  scrollToBottom();
}

// ========== AI 对话循环 ==========
async function runChatLoop(targetHistory, realUsed) {
  let iterations = 0;
  let turnUsage = null; // 累计本轮各次请求的 token 用量
  let turnCreditsCost = 0; // 累计本轮内置 AI 消耗的 credits
  let lastPromptTokens = 0; // 最近一次请求的 prompt 用量（即当前上下文大小）
  let devSnapshot = null; // 开发者模式：最近一次「将实际发送」的有效视图快照
  const activeModel = state.models.find(m => m.id === state.activeModelId);
  // 发送前超限拦截（每轮只做一次）：本地模型上下文有硬性上限。估算即将发送的 prompt
  // （系统提示 + 历史 + 工具 schema），超过 contextLimit 时拒绝发送并给出明确提示，
  // 而不是把注定报错或被截断的请求发给模型。工具执行轮次不回退，因此只在开头拦截一次。
  const limit = state.modelMeta.contextLimit;
  // 发送内容不再「全量原样塞入」：由 context.js 统一做 L0~L3 加工（预算/窗口/摘要/引用），
  // 这里只对「将实际发送」的有效视图做硬性超限拦截。工具执行轮次不回退，因此只在开头拦一次。
  const headPrep = prepareMessages(targetHistory, limit, realUsed);
  if (headPrep.overflow) {
    throw new Error(tSync('contextOverflow').replace('{{used}}', formatTokenCount(headPrep.est)).replace('{{total}}', formatTokenCount(limit)));
  }
  while (iterations++ < 25) {
    if (state.stopRequested) break;
    let res;
    try {
      // 每轮基于最新历史重新加工（含新写入的 tool 结果），保证窗口/摘要始终反映当前状态
      const prep = prepareMessages(targetHistory, limit, realUsed);
      if (prep.overflow) {
        throw new Error(tSync('contextOverflow').replace('{{used}}', formatTokenCount(prep.est)).replace('{{total}}', formatTokenCount(limit)));
      }
      // 触发 L2 压缩时，用「综合倍率最低的内置聊天模型」把规则提炼摘要升级为语义摘要；
      // 无内置模型/调用失败保留规则摘要（压缩绝不能阻塞发送）。同批被压轮次已缓存，不会重复调模型。
      await upgradeSummaryToLLM(prep.messages);
      // 压缩真正生效（摘要已生成、消息即将用压缩视图发送）后才落持久化标记并在压缩块末位提示，
      // 而不是「判断出要压缩」就立刻提示。markCompression 按位置去重，重复迭代只会标记一次；
      // 仅在正在查看生成会话时即时插入 DOM，否则靠历史里的 ctx_compressed 事件在重渲染时显示。
      if (prep.compressed) {
        const compIdx = markCompression(targetHistory);
        if (compIdx != null && isViewingGenerating()) noticeAfterCompression(targetHistory, compIdx);
      }
      if (state.settings.devMode) devSnapshot = { messages: prep.messages, est: prep.est, limit, tools: getEnabledToolDefs().map(d => d.function.name) };
      const aiMessages = prep.messages;
      const aiOpts = {
        messages: aiMessages,
        tools: getEnabledToolDefs(),
        toolChoice: 'auto',
        requestId: state.currentRequestId,
        stream: true,
        onEvent: handleStreamEvent,
      };
      if (state.activeModelId) {
        if (activeModel && activeModel.builtin) {
          // 内置模型：经 ai-gateway 网关中转（backend: 'built-in'），传真实模型 UUID
          aiOpts.backend = 'built-in';
          aiOpts.modelId = activeModel.builtinModelId;
        } else {
          aiOpts.modelId = state.activeModelId;
        }
      }
      state.streamState = null; // 新一轮流式渲染，重置现场
      res = await window.myzone.ai.chat(aiOpts);
    } catch (e) {
      if (state.stopRequested) break; // 用户主动终止，不算错误
      const err = new Error(tSync('aiCallFailed') + (activeModel ? `（${activeModel.name}）` : '') + (e && e.message ? `：${e.message}` : ''));
      // 透传底层错误详情（HTTP 状态 + 完整响应体），供前端查看失败原因
      if (e) { err.status = e.status; err.detail = e.detail; }
      throw err;
    }
    if (!res || !res.success) {
      if (state.stopRequested || (res && res.aborted)) break; // 被终止
      const err = new Error(tSync('aiCallFailed') + (activeModel ? `（${activeModel.name}）` : '') + (res && res.error ? `：${res.error}` : ''));
      if (res) { err.status = res.status; err.detail = res.errorDetail; }
      throw err;
    }

    // 累计 token 用量（含缓存命中：优先网关归一化的 cached_prompt_tokens，兼容常见模型嵌套字段）
    if (res.usage) {
      if (res.usage.prompt_tokens) lastPromptTokens = res.usage.prompt_tokens;
      turnUsage = turnUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_prompt_tokens: 0 };
      turnUsage.prompt_tokens += res.usage.prompt_tokens || 0;
      turnUsage.completion_tokens += res.usage.completion_tokens || 0;
      turnUsage.total_tokens += res.usage.total_tokens || ((res.usage.prompt_tokens || 0) + (res.usage.completion_tokens || 0));
      turnUsage.cached_prompt_tokens += extractCachedTokens(res.usage);
      // 记录真实（模型报告的）prompt 用量，不估算
      setContextUsed(res.usage.prompt_tokens || 0);
      // 同步真实用量到压缩触发口径：多轮工具调用中实时放大（max），让后续轮次的窗口/压缩跟随模型实况
      const _rt = Number(res.usage.prompt_tokens);
      if (Number.isFinite(_rt) && _rt > 0) realUsed = Math.max(realUsed || 0, _rt);
    }
    // 累计内置 AI 消耗的 credits（网关在流尾结算）
    if (Number.isFinite(Number(res.credits_cost))) turnCreditsCost += Number(res.credits_cost);

    // 文生图结果：渲染图片并写入历史，整轮结束（不再继续工具调用）
    if (Array.isArray(res.images) && res.images.length) {
      const imgUrls = res.images
        .map(i => (i && typeof i === 'object') ? (i.url || i.b64_json || '') : (typeof i === 'string' ? i : ''))
        .filter(Boolean);
      if (imgUrls.length) {
        const imageMarkdown = imgUrls.map(u => `![${tSync('generatedImage')}](${u})`).join('\n\n');
        const imgMsg = { role: 'assistant', content: imageMarkdown, images: imgUrls, uid: generateId(), ts: Date.now(), turnId: state.turnId, usage: turnUsage ? { ...turnUsage } : null, creditsCost: turnCreditsCost };
        targetHistory.push(imgMsg);
        finalizeStreamBubble(imageMarkdown, turnUsage ? { ...turnUsage } : null, imgMsg.uid, turnCreditsCost);
        return { text: imageMarkdown, usage: turnUsage, rendered: true, lastPromptTokens, images: imgUrls };
      }
    }

    // 思考过程：实时已渲染；此处定稿并记录到历史（仅展示，不进 AI 记忆）
    if (res.reasoning && res.reasoning.trim()) {
      const st = getStreamState();
      if (st.thinking) {
        st.thinking.raw = res.reasoning;
        st.thinking.body.innerHTML = renderMarkdown(res.reasoning);
      } else if (isViewingGenerating()) {
        addThinkingProcess(res.reasoning);
      }
      pushEvent({ role: 'event', type: 'thinking', text: res.reasoning, turnId: state.turnId });
    }

    // 网关在流中检测到余额耗尽并中断：保留已生成的部分内容并终止本轮，不再继续工具调用
    if (res.interrupted === 'insufficient_balance') {
      if (res.content && res.content.trim()) {
        const partialMsg = { role: 'assistant', content: res.content, uid: generateId(), ts: Date.now(), turnId: state.turnId, usage: turnUsage ? { ...turnUsage } : null, creditsCost: turnCreditsCost };
        targetHistory.push(partialMsg);
        finalizeStreamBubble(res.content, turnUsage ? { ...turnUsage } : null, partialMsg.uid, turnCreditsCost);
      }
      return { text: (res.content || '').trim(), usage: turnUsage, rendered: true, lastPromptTokens, interrupted: true };
    }

    const toolCalls = res.toolCalls || [];
    if (toolCalls.length) {
      if (res.content && res.content.trim()) {
        finalizeStreamBubble(res.content, turnUsage ? { ...turnUsage } : null, generateId(), turnCreditsCost);
      }
      const toolIndex = targetHistory.length; // 记录工具轮次开始前的位置
      targetHistory.push({ role: 'assistant', content: res.content || null, tool_calls: toolCalls, turnId: state.turnId, usage: turnUsage ? { ...turnUsage } : null });
      for (const tc of toolCalls) {
        if (state.stopRequested) break;
        const resultText = await runTool(tc);
        targetHistory.push({ role: 'tool', tool_call_id: tc.id, content: resultText, turnId: state.turnId });
      }
      // 工具级 credits（如图像生成）归入本轮总消耗，随最终 assistant 消息 footer 一并展示
      if (state.toolCredits) { turnCreditsCost += state.toolCredits; state.toolCredits = 0; }
      if (state.stopRequested) {
        // 回滚不完整的工具调用轮次，避免留下未配对的 tool_calls 破坏上下文
        targetHistory.length = toolIndex;
        break;
      }
      continue;
    }

    const finalMsg = { role: 'assistant', content: res.content || '', uid: generateId(), ts: Date.now(), turnId: state.turnId, usage: turnUsage ? { ...turnUsage } : null, creditsCost: turnCreditsCost };
    targetHistory.push(finalMsg);
    finalizeStreamBubble(res.content || '', turnUsage ? { ...turnUsage } : null, finalMsg.uid, turnCreditsCost);
    return { text: (res.content || '').trim(), usage: turnUsage, rendered: true, lastPromptTokens, dev: devSnapshot };
  }
  if (state.stopRequested) return { text: '', usage: turnUsage, lastPromptTokens };
  return { text: tSync('operationDone'), usage: turnUsage, lastPromptTokens };
}

// 构造「将实际发送给模型」的请求详情快照，供发送时立即展示（不必等整轮生成结束）。
// 与 runChatLoop 内发送前计算使用同一 prepareMessages，且同样透传 realPeak（压缩粘性口径），
// 保证所见即所发：压缩触发后这里展示的也是压缩视图，而不是全量历史。
function buildDevSnapshot() {
  const limit = state.modelMeta.contextLimit;
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  const prep = prepareMessages(state.history, limit, (conv && (conv.realPeak || conv.contextUsed)) || 0);
  return {
    messages: prep.messages,
    est: prep.est,
    limit,
    tools: getEnabledToolDefs().map(d => d.function.name),
  };
}

// 发起一轮生成。生成绑定到发起时的会话（genConv），切换会话不会打断。
async function processTurn() {
  const genConvId = state.currentConvId;
  const genConv = state.conversations.find(c => c.id === genConvId);
  if (!genConv) return;
  state.generatingConvId = genConvId;
  state.history = genConv.messages; // 绑定工作数组到生成会话
  setActiveHistory(genConv.messages);

  state.stopRequested = false;
  state.currentRequestId = generateId();
  state.turnId = generateId();
  setBusy(true);
  // 回合开始即标记「输出中」，供会话列表状态徽标使用；同时预置「中断」标记，
  // 待整轮成功结束后再清除——这样手动停止或页面中途关闭（finally 不执行）都能留下中断标记。
  state.genPhase = 'streaming';
  genConv.interrupted = true;
  genConv.completedTurn = false;
  await saveConversations(); // 预写「中断」标记：页面中途关闭时 finally 不执行，标记仍被持久化
  ensureThinking();
  renderConversationList();
  state.turnPromise = (async () => {
    try {
      // 压缩/窗口触发以该会话历史峰值用量（realPeak）为口径：压缩是「粘性」的，
      // 一旦触发就持续压缩，避免压缩后一次发送把历史又撑满、圆环来回跳动。
      const result = await runChatLoop(genConv.messages, genConv.realPeak || genConv.contextUsed);
      if (!state.stopRequested && result && result.text && !result.interrupted) {
        // 整轮正常结束（未被停止、未因余额耗尽中断）：清除中断标记，并打上一次性「输出完成」
        genConv.interrupted = false;
        genConv.completedTurn = true;
      }
      removeThinking();
      if (result && result.text && !result.rendered && state.currentConvId === genConvId) {
        addAssistantBubble(result.text, result.usage || null, undefined);
      }
      return (result && result.dev) || null;
    } catch (err) {
      removeThinking();
      // 若因超出上下文窗口而失败，用模型报告的真实 token 数更新圆环
      markContextOverflow(err.message);
      if (state.currentConvId === genConvId) {
        addErrorBubble(err);
      }
      return null;
    } finally {
      // 思考过程展示完成后自动折叠
      const _st = state.streamState;
      if (_st) {
        if (_st.thinking) collapseThinking(_st.thinking);
        state.streamState = null;
      }
      setBusy(false);
      state.currentRequestId = null;
      state.stopRequested = false;
      state.generatingConvId = null;
      state.genPhase = null;
      state.turnId = null;
      setActiveHistory(null);
      // 保存生成会话（消息已实时写入 genConv.messages，此处补标题与更新时间）
      if (genConv) {
        genConv.title = getConvTitle(genConv.messages);
        genConv.updatedAt = Date.now();
      }
      await saveConversations();
      renderConversationList();
      updateConvTitle();
      state.turnPromise = null;
      // 每轮结束后刷新额度/上下文元信息，让「剩余额度」反映最近的消耗
      if (state.aiReady) refreshModelMeta();
    }
  })();
  return await state.turnPromise;
}

// ========== 停止 / 等待轮次结束 ==========
async function onStop() {
  // 媒体停止按会话隔离：只关心「正在查看的会话」是否有后台媒体任务。
  // 否则停止某个会话的生成（或切换会话时其它代码路径触发停止）会连其它会话的后台生成一起终止。
  const mediaActive = state.mediaActiveConvs.has(state.currentConvId);
  if (!state.busy && !mediaActive) return;
  // 后台媒体生成：仅置当前会话的停止标记，由 skillbar 的视频轮询自行检查并终止（不占 state.busy，对话不卡）
  if (mediaActive) state.mediaStopConvs.add(state.currentConvId);
  if (!state.busy) return;
  state.stopRequested = true;
  try {
    if (state.currentRequestId) {
      await window.myzone.ai.abort(state.currentRequestId);
    }
  } catch (e) {
    /* 忽略 abort 失败，标志位已足够阻止后续迭代 */
  }
}

// 仅在需要中断当前生成（如清空/删除正在生成的会话）时使用
async function waitForTurnEnd() {
  if (!state.busy && !state.turnPromise) return;
  await onStop();
  if (state.turnPromise) {
    try { await state.turnPromise; } catch (e) { /* 已由 processTurn 内部处理 */ }
  }
}

// ========== AI 状态检测 ==========
async function checkAiStatus() {
  setStatus('', 'statusTesting');
  // 拉取状态时不因单接口异常而误判：任何取数失败都不应让本地已配置或内置可用被吞掉
  let localConfigured = false;
  let builtin = null; // { available, loggedIn, configured, models, balance, error }
  let builtinError = null;
  try {
    const [localRes, builtinRes] = await Promise.all([
      window.myzone.ai.isConfigured(),
      window.myzone.ai.checkBuiltin(),
    ]);
    localConfigured = !!(localRes && localRes.success && localRes.configured);
    builtin = (builtinRes && builtinRes.success) ? builtinRes : null;
    builtinError = (builtin && builtin.error) || null;
  } catch (e) {
    /* 取数失败按「未就绪」处理，交由下方按状态分流 */
  }
  const builtinAvailable = !!(builtin && builtin.available);
  state.aiReady = localConfigured || builtinAvailable;
  state.aiNeedLogin = false;
  if (state.aiReady) {
    // 本地密钥与内置 AI 任一可用即可对话；内置可用但无本地密钥时给出对应状态提示
    setStatus('ok', localConfigured ? 'statusConfigured' : 'statusBuiltin');
    hideNotice();
    try { await loadModels(); } catch (e) { /* 模型列表失败不阻断状态 */ }
    return;
  }
  state.aiReady = false;
  // 内置网关已登录，但模型列表取值出错：把真实原因透出，便于定位，而非笼统「尚未配置」
  if (builtin && builtin.configured && builtin.loggedIn && builtinError) {
    setStatus('err', 'statusNotConfigured');
    showTextNotice('notConfiguredTitle', builtinError);
    return;
  }
  // 已登录但内置网关没有可用模型：属于「站长未开放模型」/模型列表为空，不是「未登录」。
  // 不能笼统看 configured 就提示登录，否则会误报「请先登录」。
  if (builtin && builtin.configured && builtin.loggedIn) {
    setStatus('err', 'statusNotConfigured');
    showTextNotice('notConfiguredTitle', tSync('builtinNoModelsDesc'));
    return;
  }
  // 内置网关已配置但尚未登录：引导登录即可用内置 AI，
  // 而不是误导用户去「设置 → AI 设置 配置本地后端」。
  if (builtin && builtin.configured) {
    state.aiNeedLogin = true;
    setStatus('err', 'statusNeedLogin');
    showLoginNotice();
    return;
  }
  setStatus('err', 'statusNotConfigured');
  showNotice();
}
