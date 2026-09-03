// myzone.ai-assistant / state.js
// 共享应用状态与纯工具函数。所有模块通过全局 `state` 读写状态。

'use strict';

// ========== 应用状态 ==========
const state = {
  // 设置
  settings: { workFolderId: 'root', workFolderName: '', riskThreshold: 70, devMode: false },
  workFolderPath: '/Root',
  appLang: 'zh',
  aiReady: false,
  aiNeedLogin: false, // 未登录但内置网关已配置：发送时应提示「请先登录」而非「尚未配置」
  busy: false,
  // 当前生成轮次内，工具执行（如生成图片/视频）累计消耗的 credits。
  // 由 tools.js 累加、ai.js 每轮结算并入 turnCreditsCost，最终随 assistant 消息 footer 展示。
  toolCredits: 0,
  // 图片/视频生成的后台状态：生成不占用 state.busy（不锁输入、不阻塞对话），
  // 仅在用户正在查看对应会话时显示「停止」按钮用于中断视频轮询。
  mediaActiveConvs: new Set(), // 正在后台生成的媒体任务所属会话 ID
  mediaStopConvs: new Set(),   // 用户请求停止媒体生成的会话 ID（仅停止对应会话的任务，不影响其它会话的后台生成）
  // 模型自主调用的异步生成任务队列（如生成视频）：{ convId, taskId, mode, modelName, prompt, domEl?, key? }
  // 由 runTool 入队，skillbar.js 的后台调度器轮询并在完成后回写会话
  mediaTasks: [],
  // 图片生成的在途 Promise：{ taskId -> Promise<generateImage 结果> }
  // 图片生成无独立轮询端点，由 generate_image 工具后台发起请求后把 Promise 挂到这里，
  // skillbar.js 入队时对图片任务直接挂完成回调（Promise 决议即回写会话）
  pendingMediaPromises: new Map(),
  // 手动技能（技能栏）生成的占位气泡：{ convId -> { el, mode, params } }
  // 占位不在会话消息里，切换会话后 DOM 会游离；切回时由 renderHistory 按此重建
  manualPendingEls: new Map(),

  // 会话
  conversations: [],
  currentConvId: null,
  // 当前会话记录（AI 消息 + 仅供展示的事件，如思考过程/工具确认）
  history: [],

  // 模型
  models: [],
  builtinModels: [],  // 站长开放的内置 AI 模型（经网关中转，按 credits 计费）
  activeModelId: null,
  // 豆包式底部技能栏：手动添加的生成技能 { skillId:'generative', mode:'image'|'video', modelId } | null
  manualSkill: null,
  // 暂态手动技能标签（非生成类技能）：选中的技能 id 列表，随消息发送注入该技能提示；仅作用于当前会话
  transientSkills: [],

  // 审批模式: 'manual' | 'auto' | 'full'
  approvalMode: 'manual',

  // 已启用的技能（技能级）——始终 = 当前激活智能体「物化后的有效集」，随时由 resolveAgentConfig() 重新生成。
  enabledSkills: ['filesystem', 'core', 'search', 'network', 'browser', 'cloud', 'cookies', 'account', 'notifications', 'archive', 'external'],
  // 已启用的工具（工具级；空数组表示该技能下的全部工具都启用）——同上，来自当前激活智能体。
  enabledTools: [],
  // 已启用的 MCP 服务器（服务器级；空数组表示全部启用）——来自当前激活智能体。
  enabledMcpServers: [],
  // 当前激活智能体锁定的技能集（core 恒锁定 + 内置智能体基础技能），由 materializeActiveAgent 维护
  lockedSkillSet: new Set(),

  // 当前会话/默认可选 agent（预设的技能组合 + 系统提示）
  activeAgentId: null,
  // 内置智能体的「用户追加」配置（只增不减）：{ [agentId]: { addSkills: [], addMcpServers: [] } }
  agentOverrides: {},
  // 用户自定义智能体：[{ id, name, desc, prompt, skills, tools, mcpServers }]
  customAgents: [],
  // 用户自定义技能（纯提示词）：[{ id, name, prompt }]
  customSkills: [],

  // 已启用工具占用的上下文预算（token），由 getEnabledToolCost() 刷新
  contextBudget: 0,

  // 生成相关
  generatingConvId: null,  // 正在生成回复的会话 ID（null 表示空闲）
  genPhase: null,          // 当前生成回合所处阶段：'streaming' | 'confirming' | 'asking'（用于会话列表状态标记）
  turnId: null,            // 当前生成轮次的 ID：同一轮的思考/工具/消息共享该 ID，便于按轮删除
  currentRequestId: null,  // 当前 AI 请求 ID（用于停止生成）
  streamState: null,       // 流式渲染状态（raw 文本 + DOM 引用）
  stopRequested: false,    // 用户是否已点击「停止」
  turnPromise: null,       // 当前生成轮次的 Promise
  thinkingEl: null,        // 「思考中」打字指示器元素

  // 模型探测元信息（尽力而为，取不到为 null）
  modelMeta: {
    contextLimit: null,    // 上下文窗口上限
    quota: null,           // { used, available } 额度
    creditsBalance: null,  // credits 余额（始终读取，随左上角徽标展示）
    probing: false,
  },
};

// ========== 通用工具 ==========
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 创建带唯一标识与时间戳的消息对象（供渲染/删除/复制定位）
function makeMsg(role, content, extra) {
  const msg = { role, content: content == null ? '' : content, uid: generateId(), ts: Date.now() };
  return Object.assign(msg, extra || {});
}

// 完整时间戳（含年月日时分）
function formatFullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return (val >= 100 ? Math.round(val) : val.toFixed(1)) + ' ' + units[i];
}

// token 数量紧凑格式化：1234 -> 1.2k
function formatTokenCount(n) {
  const num = Number(n) || 0;
  if (num < 1000) return String(num);
  return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

// 估算文本的 token 数（接口未提供 tokenizer 时的近似，用于发送前的上下文超限拦截）。
// 中日韩字符按 1 token，其余字符按 ~4 字符 1 token 估算。
function estimateTokens(text) {
  const s = String(text == null ? '' : text);
  let cjk = 0, other = 0;
  for (const ch of s) {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3]/.test(ch)) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / 4);
}

// 会话列表展示时间：今天只显示时分，昨天显示「昨天 HH:mm」，更早显示日期
function formatConvTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `${tSync('yesterday')} ${hm}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
}

// 从记录中提取会话标题（跳过仅供展示的事件记录）
function getConvTitle(records) {
  for (const msg of records) {
    if (msg && msg.role === 'user' && msg.content) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      const firstLine = text.split('\n')[0].trim();
      return firstLine.length > 20 ? firstLine.slice(0, 20) + '…' : firstLine || tSync('newConversation');
    }
  }
  return tSync('newConversation');
}

// 当前是否正在查看正在生成的会话
function isViewingGenerating() {
  return state.generatingConvId !== null && state.currentConvId === state.generatingConvId;
}
