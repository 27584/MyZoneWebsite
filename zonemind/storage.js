// myzone.ai-assistant / storage.js
// 持久化：设置、审批模式、技能启用、会话列表、模型选择。
// state.history 始终是「当前查看会话」消息数组的实时引用（非拷贝），
// 这样生成期间切换会话不会丢失或污染任何会话的数据。

'use strict';

// ========== 设置 ==========
async function loadSettings() {
  try {
    const all = await window.myzone.storage.getAll();
    if (all && typeof all === 'object') {
      if (all.workFolderId) state.settings.workFolderId = all.workFolderId;
      if (all.workFolderName) state.settings.workFolderName = all.workFolderName;
      if (typeof all.riskThreshold === 'number') state.settings.riskThreshold = all.riskThreshold;
      if (typeof all.devMode === 'boolean') state.settings.devMode = all.devMode;
    }
  } catch (e) { /* ignore */ }
  const th = $('risk-threshold');
  if (th) {
    th.value = state.settings.riskThreshold;
    const valEl = $('risk-threshold-value');
    if (valEl) valEl.textContent = tSync('riskThresholdValue').replace('{{value}}', String(state.settings.riskThreshold));
  }
  const dm = $('dev-mode-toggle');
  if (dm) dm.checked = !!state.settings.devMode;
  await refreshWorkFolder();
}

// ========== 审批模式 ==========
async function setApprovalMode(mode) {
  state.approvalMode = mode;
  await window.myzone.storage.set('approvalMode', mode);
  renderApprovalMode();
}

async function loadApprovalMode() {
  try {
    const stored = await window.myzone.storage.get('approvalMode');
    if (stored && ['manual', 'auto', 'full'].includes(stored)) {
      state.approvalMode = stored;
    }
  } catch (e) { /* ignore */ }
  renderApprovalMode();
}

// ========== 技能 / 工具 / Agent / MCP ==========
async function loadSkills() {
  try {
    // 自定义技能（纯提示词）先注册进 SKILL_REGISTRY，供各智能体勾选
    const customSkills = await window.myzone.storage.get('aiCustomSkills');
    if (Array.isArray(customSkills)) {
      for (const s of customSkills) {
        if (s && s.id && !findSkill(s.id)) registerCustomSkill(s);
      }
      state.customSkills = customSkills;
    }
  } catch (e) { /* ignore */ }
  try {
    // 自定义智能体
    const customAgents = await window.myzone.storage.get('aiCustomAgents');
    if (Array.isArray(customAgents)) state.customAgents = customAgents;
  } catch (e) { /* ignore */ }
  try {
    // 内置智能体的用户追加配置（只增不减）
    const overrides = await window.myzone.storage.get('aiAgentOverrides');
    if (overrides && typeof overrides === 'object') state.agentOverrides = overrides;
  } catch (e) { /* ignore */ }
  try {
    const agentId = await window.myzone.storage.get('activeAgentId');
    // 允许内置 + 自定义智能体；不存在则回落到默认内置 'default'
    if (agentId && getAgent(agentId)) state.activeAgentId = agentId;
  } catch (e) { /* ignore */ }
  if (!getAgent(state.activeAgentId)) state.activeAgentId = AGENT_REGISTRY.length ? AGENT_REGISTRY[0].id : 'default';
  // 物化当前智能体的有效配置到全局 enabledSkills/enabledTools/enabledMcpServers
  materializeActiveAgent();
  refreshContextBudget();
  renderAgentSelector();
}

// 保存用户自定义技能（新建/编辑后调用），并同步注册表
async function saveCustomSkills() {
  state.customSkills = state.customSkills || [];
  // 全量重建：先移除旧注册，再按当前数组重新注册，保证删除/改名立即生效
  const customIds = new Set(state.customSkills.map(s => s.id));
  for (const s of SKILL_REGISTRY) {
    if (s.custom) unregisterCustomSkill(s.id);
  }
  for (const s of state.customSkills) {
    if (s && s.id && !findSkill(s.id)) registerCustomSkill(s);
  }
  await window.myzone.storage.set('aiCustomSkills', state.customSkills);
  materializeActiveAgent();
  refreshContextBudget();
  renderAgentSelector();
  renderCustomSkillList();
}

// ========== 会话管理 ==========
async function saveConversations() {
  // 保护：conversations 尚未加载（currentConvId 为空且数组为空）时，不得把空数据覆盖写盘。
  // 否则 loadConversations 之前被 materializeActiveAgent→rebuildSystemPrompt 等链路触发的
  // saveConversations 会用初始空数组覆盖掉已有历史会话。
  if (!state.currentConvId && state.conversations.length === 0) return;
  await window.myzone.storage.set('conversations', state.conversations);
}

async function loadConversations() {
  try {
    const data = await window.myzone.storage.get('conversations');
    if (data && Array.isArray(data)) {
      state.conversations = data;
    }
  } catch (e) {
    state.conversations = [];
  }
  if (!state.conversations.length) {
    await createConversation();
  } else {
    state.currentConvId = state.conversations[0].id;
    const conv = state.conversations[0];
    conv.completedTurn = false; // 一次性「输出完成」标记：进入该会话后即消失
    state.activeAgentId = (conv.agentId && getAgent(conv.agentId)) ? conv.agentId : 'default';
    // 会话绑定自己的 agent：物化其配置到全局，再以其提示构造 system 提示
    materializeActiveAgent();
    refreshContextBudget();
    state.history = (conv.messages && conv.messages.length) ? conv.messages : [{ role: 'system', content: buildSystemPrompt() }];
    if (state.history[0]?.role !== 'system') {
      state.history.unshift({ role: 'system', content: buildSystemPrompt() });
    }
    renderConversationList();
    updateConvTitle();
    renderAgentSelector();
    renderHistory(state.history);
    // 启动即恢复当前会话持久化的手动技能（按注入标记重建标签）
    syncTransientSkillsFromHistory();
    scrollToBottom();
  }
}

async function createConversation() {
  // 取消待确认的操作；不打断正在进行的生成（生成仍会保存到其发起会话）
  denyAllPendingConfirms();
  if (state.currentConvId) {
    await saveCurrentConversation();
  }
  const conv = {
    id: generateId(),
    title: tSync('newConversation'),
    messages: [{ role: 'system', content: buildSystemPrompt() }],
    agentId: getAgent(state.activeAgentId) ? state.activeAgentId : 'default',
    contextUsed: null, // 该会话最近一次真实请求的 prompt token（模型报告值）
    realPeak: null,    // 该会话历史峰值用量（用于压缩/窗口的粘性触发判断）
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.conversations.unshift(conv);
  state.currentConvId = conv.id;
  state.history = conv.messages;
  // 全新会话无注入的手动技能标记，清空暂态技能标签
  state.transientSkills = [];
  renderSkillBar();
  $('chat').innerHTML = '';
  await saveConversations();
  renderConversationList();
  updateConvTitle();
  updateStopButton();
  renderTokenGauges();
  await renderWelcome();
  inputEl().focus();
  return conv;
}

async function switchConversation(convId) {
  if (convId === state.currentConvId) return;
  // 取消待确认的操作；不打断正在进行的生成
  denyAllPendingConfirms();
  await saveCurrentConversation();
  const conv = state.conversations.find(c => c.id === convId);
  if (!conv) return;
  state.currentConvId = convId;
  conv.completedTurn = false; // 一次性「输出完成」标记：进入该会话后即消失
  state.history = conv.messages;
  // 会话绑定其自身的 agent；应用对应系统提示
  state.activeAgentId = (conv.agentId && getAgent(conv.agentId)) ? conv.agentId : 'default';
  // 物化该会话 agent 的技能/工具/MCP 配置到全局（各会话 agent 可能不同）
  materializeActiveAgent();
  refreshContextBudget();
  // 回显该会话最近一次真实请求的占用（各会话独立）
  state.contextUsed = Number.isFinite(conv.contextUsed) && conv.contextUsed > 0 ? conv.contextUsed : null;
  if (!state.history.length || state.history[0]?.role !== 'system') {
    state.history.unshift({ role: 'system', content: buildSystemPrompt() });
  } else {
    // 若历史 system 已不同步，重写为新 agent 提示
    state.history[0].content = buildSystemPrompt();
  }
  $('chat').innerHTML = '';
  renderConversationList();
  updateConvTitle();
  renderHistory(state.history);
  renderAgentSelector();
  // 恢复该会话持久化的手动技能（按历史中的注入标记重建标签），切换会话互不串扰
  syncTransientSkillsFromHistory();
  updateComposerUI();
  updateStopButton();
  renderLiveStreamToView();
  renderTokenGauges();
  scrollToBottom();
}

async function deleteConversation(convId) {
  const conv = state.conversations.find(c => c.id === convId);
  if (!conv) return;
  const title = conv.title || tSync('newConversation');
  const ok = await window.myzone.dialog.confirm(
    `${tSync('deleteConversationConfirm')}\n（${title}）`,
    {
      title: tSync('deleteConversation'),
      confirmText: tSync('delete'),
      cancelText: tSync('cancel'),
    }
  );
  if (!ok) return;
  // 删除正在生成的会话时，先停止该轮生成
  if (state.generatingConvId === convId) await waitForTurnEnd();
  state.conversations = state.conversations.filter(c => c.id !== convId);
  if (convId === state.currentConvId) {
    if (state.conversations.length) {
      await switchConversation(state.conversations[0].id);
    } else {
      await createConversation();
    }
  }
  await saveConversations();
  renderConversationList();
}

async function saveCurrentConversation() {
  if (!state.currentConvId) return;
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (!conv) return;
  // state.history 为当前查看会话消息数组的实时引用
  conv.messages = state.history;
  conv.title = getConvTitle(conv.messages);
  conv.updatedAt = Date.now();
  await saveConversations();
  updateConvTitle();
}

async function clearConversation() {
  const ok = await window.myzone.dialog.confirm(tSync('clearConfirm'), {
    title: tSync('clearConversation'),
    confirmText: tSync('clearConfirmYes'),
    cancelText: tSync('clearConfirmNo'),
  });
  if (!ok) return;
  // 正在生成当前会话时，先停止并等待结束，避免清空后被重新写入
  if (state.generatingConvId === state.currentConvId) await waitForTurnEnd();
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (conv) state.history = conv.messages;
  state.history.length = 0;
  state.history.push({ role: 'system', content: buildSystemPrompt() });
  if (conv) {
    conv.title = tSync('newConversation');
    conv.updatedAt = Date.now();
  }
  $('chat').innerHTML = '';
  await renderWelcome();
  renderConversationList();
  updateConvTitle();
  await saveConversations();
  window.myzone.toast.success(tSync('conversationCleared'));
}

// ========== 模型管理 ==========
async function loadModels() {
  // 内置模型只记录在扩展端 aiBuiltinModelId，本地 getModels() 感知不到它的存在；
  // 若当前选中的正是内置模型，则不要用本地接口返回的 activeModelId 覆盖，避免被切回本地模型。
  const prevActive = state.activeModelId;
  const wasBuiltin = !!(prevActive && String(prevActive).startsWith('builtin::'));
  try {
    const res = await window.myzone.ai.getModels();
    if (res && res.success) {
      state.models = res.models || [];
      if (!wasBuiltin) state.activeModelId = res.activeModelId || null;
    }
  } catch (e) {
    state.models = [];
    if (!wasBuiltin) state.activeModelId = null;
  }
  await mergeBuiltinModels();
  renderModelSelector();
}

// ========== 内置模型列表缓存 ==========
// 内置模型来自 Supabase（ai_user_get_models），每次请求都较慢。为避免每次点模型下拉都卡在网络请求上，
// 先把列表缓存到内存 + 本地存储：打开下拉先用缓存渲染，再后台请求刷新覆盖。
const BUILTIN_CACHE_KEY = 'aiBuiltinModelCache'; // { models: [], base_rate, ts }
let _builtinCache = null;

function _builtinCacheSet(models, baseRate) {
  _builtinCache = { models: Array.isArray(models) ? models : [], base_rate: baseRate ?? null, ts: Date.now() };
  window.myzone.storage.set(BUILTIN_CACHE_KEY, _builtinCache).catch(() => {});
}

async function _builtinCacheSeed() {
  if (_builtinCache) return;
  try {
    const v = await window.myzone.storage.get(BUILTIN_CACHE_KEY);
    if (v && Array.isArray(v.models)) _builtinCache = v;
  } catch (e) { _builtinCache = null; }
}

// 把后台返回的原始模型列表映射成内置模型并合并进 state（纯状态更新，不负责渲染）
async function applyBuiltinModels(builtins, baseRateLocal) {
  const baseRate = baseRateLocal; // 1x 标准单位价（credits/千token，后台可配）
  // 综合消耗倍率 = 按输入/输出/缓存加权折算的等效单价 / base_rate（相对 1x 标准价），如 0.44x
  const W_IN = 0.6, W_OUT = 0.3, W_CACHED = 0.1;
  state.builtinModels = builtins.map(m => {
    const rin = Number(m.rate_input_tokens) || 0;
    const rout = Number(m.rate_output_tokens) || 0;
    const rc = Number(m.rate_cached_tokens) || 0;
    const equiv = W_IN * rin + W_OUT * rout + W_CACHED * rc;
    const effectiveRate = baseRate && equiv > 0 ? equiv / baseRate : null;
    // 后台折扣系数（0<d<=1，<1 表示打折）；服务端 ai_user_get_models 返回的 rate_* 已是折后费率
    const d = Number(m.discount) || 1;
    const discount = d > 0 && d <= 1 ? d : 1;
    const invD = discount > 0 ? 1 / discount : 1;
    return {
      id: 'builtin::' + m.id,             // 与本地模型 id 隔离，避免冲突
      builtin: true,
      builtinModelId: m.id,               // 真实模型 UUID，传给网关
      name: m.name || m.model || m.id,
      model: m.model,
      is_auto: m.is_auto === true,        // AUTO 自动选择（后台标记）：内置模型下拉里恒排第一
      model_type: m.model_type,           // chat | image | video，供 generate_* 工具选型
      multimodal: m.multimodal !== false, // 视觉模型可接收图片输入（后台可配置，默认启用）
      context_length: Number(m.context_length) > 0 ? Number(m.context_length) : null, // 上下文窗口上限（tokens），用于圆环/工具提示展示
      fixedCreditsPerCall: Number(m.fixed_credits_per_call) || 0,
      // 按次固定费率的折后/原价口径（0 = 免费）；折扣同样作用于按次计费模型
      effectiveFixed: (Number(m.fixed_credits_per_call) || 0) * discount,
      originalFixed: Number(m.fixed_credits_per_call) || 0,
      rates: { input: rin, output: rout, cached: rc },       // 折后费率（实际扣费口径）
      originalRates: { input: rin * invD, output: rout * invD, cached: rc * invD }, // 原价费率（用于划线对比）
      effectiveRate,                      // 综合消耗速率倍率（折后，相对后台 1x 标准价），null 表示无法折算
      originalRate: effectiveRate != null ? effectiveRate * invD : null, // 原价倍率（划线用）
      discount,                           // 实际折扣系数（<1 表示打折）
    };
  });
  // 合并前先剔除 state.models 中任何来源的内置项（防止 getModels() 已返回内置
  // 或 mergeBuiltinModels 被多次调用时重复拼接），再按 id 去重。
  const locals = (state.models || []).filter(m => !m.builtin);
  const seenIds = new Set();
  const dedup = locals.filter(m => seenIds.has(m.id) ? false : (seenIds.add(m.id), true));
  const localCount = dedup.length;
  state.models = dedup.concat(state.builtinModels);
  // 恢复内置聊天模型选择：优先还原扩展存储里记住的内置模型（若仍可用），
  // 否则仅在从未选中模型且本地无模型时才兜底为内置，绝不覆盖用户已选的本地模型。
  if (state.builtinModels.length) {
    // 默认聊天模型只可能是「文本对话」类型；图片/视频模型不出现在聊天下拉，绝不可作为聊天模型
    const chatBuiltin = state.builtinModels.find(m => (m.model_type || 'chat') === 'chat');
    // 优先恢复用户上次明确选择的内置聊天模型：只要它仍可用就恢复为当前选中，
    // 不再依赖「当前是否已是内置」作为前提（否则 loadModels 先用本地接口的
    // activeModelId 覆盖成自定义模型，导致此处判断为 false 而丢掉内置记忆）。
    let saved = null;
    try { saved = await window.myzone.storage.get('aiBuiltinModelId'); } catch (e) { saved = null; }
    const savedModel = saved && chatBuiltin ? state.builtinModels.find(m => m.id === saved && (m.model_type || 'chat') === 'chat') : null;
    if (savedModel) {
      state.activeModelId = savedModel.id;
    } else if (!state.activeModelId) {
      // 无内置记忆且从未选中模型：本地没有模型时才退回内置聊天模型，避免覆盖本地默认选择
      state.activeModelId = (localCount === 0 && chatBuiltin) ? chatBuiltin.id : (state.models[0] && state.models[0].id) || null;
    }
  } else if (state.activeModelId && state.activeModelId.startsWith('builtin::')) {
    // 内置模型已不可用（未登录 / 站长下线）：回落，避免请求携带失效的模型 id
    state.activeModelId = (state.models[0] && state.models[0].id) || null;
  }
}

// 合并站长开放的内置 AI 模型（经网关中转，无需本地密钥，按 credits 计费）
async function mergeBuiltinModels() {
  // 1) 先应用缓存的列表，让模型下拉立即有内容（读本地存储，不触网）
  await _builtinCacheSeed();
  if (_builtinCache) await applyBuiltinModels(_builtinCache.models || [], _builtinCache.base_rate ?? null);
  // 2) 后台请求 Supabase 刷新；成功后覆盖缓存，失败则保留已应用的内存缓存（不覆盖为「无内置模型」）
  try {
    const res = await window.myzone.ai.listBuiltinModels();
    if (!(res && res.success && Array.isArray(res.models))) return; // 响应异常：保留缓存
    const br = Number(res.base_rate);
    const baseRate = Number.isFinite(br) && br > 0 ? br : null;
    await applyBuiltinModels(res.models, baseRate);
    _builtinCacheSet(res.models, baseRate);
  } catch (e) { /* 网络失败：保留缓存 */ }
}

async function selectModel(modelId) {
  const model = state.models.find(m => m.id === modelId);
  // 内置模型：无本地配置，选择仅记录在扩展存储（登录不同用户时各自生效）
  if (model && model.builtin) {
    state.activeModelId = model.id;
    await window.myzone.storage.set('aiBuiltinModelId', model.id);
    renderModelSelector();
    state.modelMeta = { contextLimit: null, quota: null, creditsBalance: state.modelMeta.creditsBalance, probing: false, };
    refreshModelMeta();
    return;
  }
  const res = await window.myzone.ai.setActiveModel(modelId);
  if (res && res.success) {
    state.activeModelId = res.activeModelId;
    // 用户主动切回本地模型：清除内置模型记忆，避免下次启动又被 mergeBuiltinModels 切回内置
    await window.myzone.storage.set('aiBuiltinModelId', null);
    renderModelSelector();
    state.modelMeta = { contextLimit: null, quota: null, creditsBalance: state.modelMeta.creditsBalance, probing: false, };
    refreshModelMeta();
  }
}
