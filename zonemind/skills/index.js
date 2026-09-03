// myzone.ai-assistant / skills/index.js —— 注册表框架
//
// 架构分层（对齐主流做法，agent/skill 各是一个目录，MCP 独立）：
//   - tools/<name>.js        工具实现（JS）：真实可调用函数，registerTool() 注册
//   - skills/<name>/skill.md 技能：纯提示词（front-matter 元信息 + markdown 正文），无脚本
//   - agents/<name>/agent.md 智能体：纯提示词（front-matter 元信息 + markdown 正文），无脚本
//   - mcp.js                 MCP 服务器/工具：其它扩展暴露的工具，运行时合入工具表（独立分区展示）
//
// 工具的上下文占用由「真实 schema 文本序列化」后估算（estimateTokens），不再人工声明。
// 工具按「所属技能」分组：技能总开关控制其下工具是否进系统提示与工具表。

'use strict';

// ========== 注册表 ==========
const SKILL_REGISTRY = [];   // 技能：{ id, nameKey, descKey, buildin, prompt|buildPrompt }
const TOOL_REGISTRY = [];    // 工具：{ name, skillId, description, parameters, handler, write, destructive, isSensitive, isOutsideWorkDir, confirmLines, resultLines, labelKey }
const AGENT_REGISTRY = [];   // 智能体：{ id, nameKey, descKey, prompt }

function registerSkill(def) { SKILL_REGISTRY.push(def); }
function registerTool(def) { TOOL_REGISTRY.push(def); resetToolIndex(); }
function registerAgent(def) { AGENT_REGISTRY.push(def); }
const AGENTS = AGENT_REGISTRY;

function findSkill(id) { return SKILL_REGISTRY.find(s => s.id === id); }
function getAgent(id) {
  if (!id) return null;
  return AGENT_REGISTRY.find(a => a.id === id) || state.customAgents.find(a => a.id === id) || null;
}
function getActiveAgent() { return getAgent(state.activeAgentId); }
function isBuiltinAgent(agent) {
  return !!agent && AGENT_REGISTRY.some(a => a.id === agent.id);
}
function getAllAgents() { return [...AGENT_REGISTRY, ...state.customAgents]; }

// ========== 展示名 / 描述（智能体 & 技能，兼容内置 nameKey 与自定义 name） ==========
function getAgentName(agent) {
  if (!agent) return '';
  return agent.name || tSync(agent.nameKey) || agent.id;
}
function getAgentDesc(agent) {
  if (!agent) return '';
  return agent.desc || tSync(agent.descKey) || '';
}
function getSkillName(skill) {
  if (!skill) return '';
  return skill.name || (skill.nameKey ? tSync(skill.nameKey) : '') || skill.id;
}

// ========== 自定义技能（用户自建，纯提示词） ==========
function registerCustomSkill({ id, name, prompt }) {
  // nameKey 为空 -> 直接以 name 作为展示名（getSkillName 兜底）
  registerSkill({ id, name: name || id, descKey: '', buildin: false, custom: true, prompt });
}
function unregisterCustomSkill(id) {
  const i = SKILL_REGISTRY.findIndex(s => s.id === id);
  if (i >= 0) SKILL_REGISTRY.splice(i, 1);
  resetToolIndex();
  // 若内置/自定义智能体曾启用该技能，从各自配置里移除，避免解析到不存在的技能
  for (const over of Object.values(state.agentOverrides)) {
    if (over.addSkills) over.addSkills = over.addSkills.filter(s => s !== id);
  }
  for (const agent of state.customAgents) {
    if (agent.skills) agent.skills = agent.skills.filter(s => s !== id);
  }
}

// ========== 智能体配置解析 ==========
// 内置智能体：锁定「固定默认技能集」（不可关闭），用户只能追加技能/MCP 服务器（只增不减）。
// 自定义智能体：skills/tools/mcpServers 完全自由。
// ZoneMind 网页版：仅保留网页可用的基础技能（core + network）。桌面专属技能不复制、不注册，故不会出现在工具表/系统提示/设置面板。
const BUILTIN_AGENT_BASE = {
  default: {
    skills: ['core', 'network'],
    defaultEnabled: [],
    mcpServers: [], // 显式启用列表；空 = 未启用任何 MCP 服务器
  },
  organizer: {
    skills: ['core', 'network'],
    defaultEnabled: [],
    mcpServers: [], // MCP 服务器不作为锁定基础技能；与自定义智能体一致，可自由开启/关闭
  },
};

// 计算某个智能体的「有效配置」：{ skills, tools, mcpServers, lockedSkills }
function resolveAgentConfig(agent) {
  if (!agent) return null;
  if (!isBuiltinAgent(agent)) {
    return {
      skills: [...(agent.skills || [])],
      tools: [...(agent.tools || [])],
      mcpServers: [...(agent.mcpServers || [])],
      lockedSkills: [],
    };
  }
  const base = BUILTIN_AGENT_BASE[agent.id] || { skills: [], mcpServers: [] };
  const ov = state.agentOverrides[agent.id] || {};
  // 默认启用集 = 锁定基础技能 + 默认启用但不锁定的技能（如 generative）——受 disabledSkills 关闭记录影响
  const defaults = [...base.skills, ...(base.defaultEnabled || [])]
    .filter(s => !(ov.disabledSkills || []).includes(s));
  return {
    skills: [...new Set([...defaults, ...(ov.addSkills || [])])],
    tools: [...(ov.addTools || [])], // 空 = 该技能下全部工具启用；有值 = 显式工具集（用于按需关闭 MCP 等非锁定工具）
    mcpServers: [...new Set([...base.mcpServers, ...(ov.addMcpServers || [])])],
    lockedSkills: [...base.skills],
  };
}

// 将当前激活智能体的配置物化到全局 enabledSkills/enabledTools/enabledMcpServers。
// 所有下游读取（工具表/系统提示/上下文预算）继续读这些全局字段，迁移成本最低。
function materializeActiveAgent() {
  const cfg = resolveAgentConfig(getActiveAgent());
  if (!cfg) return;
  if (!cfg.skills.includes('core')) cfg.skills.push('core'); // core 恒启用
  state.enabledSkills = cfg.skills;
  state.enabledTools = cfg.tools;
  state.enabledMcpServers = cfg.mcpServers;
  // 记录当前智能体锁定的技能集，供工具级判断「锁定技能的恒定工具」使用
  state.lockedSkillSet = new Set((cfg.lockedSkills || []).concat('core'));
  refreshContextBudget();
  rebuildSystemPrompt();
}

// MCP 服务器是否在本智能体启用列表内（显式列表，空 = 未启用任何服务器）
function isMcpServerEnabled(serverId) {
  if (!state.enabledSkills.includes('__mcp__')) return false;
  return state.enabledMcpServers.includes(serverId);
}

// 技能下挂的工具名（按 skillId 分组）
function toolsOfSkill(skillId) {
  return TOOL_REGISTRY.filter(t => t.skillId === skillId).map(t => t.name);
}
function getToolByName(name) { return TOOL_REGISTRY.find(t => t.name === name); }

// 丢弃惰性索引缓存：运行时动态注册技能/工具后需调用，否则新工具不可见
let _toolIdx = null;
function resetToolIndex() { _toolIdx = null; }

// 工具名 -> 其所属 skill 与完整工具定义（惰性构建缓存）
function buildToolIndex() {
  if (_toolIdx) return _toolIdx;
  _toolIdx = { byTool: new Map(), skills: [] };
  for (const tool of TOOL_REGISTRY) {
    _toolIdx.byTool.set(tool.name, tool);
    let group = _toolIdx.skills.find(s => s.id === tool.skillId);
    if (!group) { group = { id: tool.skillId, toolNames: [] }; _toolIdx.skills.push(group); }
    group.toolNames.push(tool.name);
  }
  // 技能下没有工具的也保留（如纯提示词技能），便于按其 enabledSkills 状态做启用/禁用
  for (const skill of SKILL_REGISTRY) {
    if (!_toolIdx.skills.some(s => s.id === skill.id)) {
      _toolIdx.skills.push({ id: skill.id, toolNames: [] });
    }
  }
  return _toolIdx;
}

// 单个工具是否启用：所属技能启用 && （未做工具级限制 或 该工具在 enabledTools 中）；
// MCP 工具还需所属服务器在本智能体启用列表内；锁定技能的（或 core）工具恒定可用。
function isToolEnabled(name) {
  const tool = getToolByName(name);
  if (!tool) return true; // 未知工具默认放行由 runTool 兜底拒绝
  if (tool.serverId && !isMcpServerEnabled(tool.serverId)) return false;
  const forced = isLockedSkill(tool.skillId);
  if (!forced && !state.enabledSkills.includes(tool.skillId)) return false;
  if (forced) return true;
  if (!state.enabledTools.length) return true; // 空数组 = 技能下全部工具启用
  return state.enabledTools.includes(name);
}

function getEnabledToolDefs() {
  return buildToolIndex().skills.reduce((acc, skill) => {
    const forced = isLockedSkill(skill.id);
    // 手动添加的非生成技能（暂态标签）：本回合临时纳入其工具，不永久改动 agent 的启用集，
    // 移除标签（state.transientSkills）后即自动还原。
    const manual = (state.transientSkills || []).includes(skill.id);
    if (!forced && !manual && !state.enabledSkills.includes(skill.id)) return acc;
    for (const name of skill.toolNames) {
      const t = getToolByName(name);
      if (t && t.serverId && !isMcpServerEnabled(t.serverId)) continue;
      // 手动技能或强制启用技能的工具不参与 enabledTools 过滤，恒定下发
      if (!forced && !manual && state.enabledTools.length && !state.enabledTools.includes(name)) continue;
      acc.push({
        type: 'function',
        function: {
          name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      });
    }
    return acc;
  }, []);
}

// 已启用工具占用的上下文预算（token）总和。
// 对「实际下发给模型」的工具 schema（getEnabledToolDefs）做真实文本序列化后估算，
// 与拦截/展示口径一致；已无人工声明的 contextCost 兜底。
function getEnabledToolCost() {
  const defs = getEnabledToolDefs();
  let sum = 0;
  for (const d of defs) sum += estimateTokens(JSON.stringify(d.function || d));
  return sum;
}

function refreshContextBudget() {
  state.contextBudget = getEnabledToolCost();
}

// ========== 目录技能 / 智能体加载（skills/*/skill.md、agents/*/agent.md） ==========
// 新加技能：建 skills/<name>/skill.md，并把 { id, path } 追加进 SKILL_MD。
// 新加智能体：建 agents/<name>/agent.md，并把 { id, path } 追加进 AGENT_MD。
// md 内容：开头 `---` 间是 front-matter（id/name/desc/builtin），其余为 markdown 正文（作为系统提示片段）。
// ZoneMind 网页版：不复制桌面专属技能的 skill.md（filesystem/search/system/script/browser/cloud/cookies/account/notifications/archive/external/cache/temp/generative）。
const SKILL_MD = [
  { id: 'core', path: 'skills/core/skill.md' },
  { id: 'network', path: 'skills/network/skill.md' },
];
const AGENT_MD = [
  { id: 'default', path: 'agents/default/agent.md' },
  { id: 'organizer', path: 'agents/organizer/agent.md' },
];

function fetchPackagedText(relPath) {
  const url = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
    ? chrome.runtime.getURL(relPath)
    : relPath;
  return fetch(url).then(res => {
    if (!res.ok) throw new Error(`加载失败: ${relPath}`);
    return res.text();
  });
}

// 解析 `---\n...\n---\n正文` 的 md：返回 { meta, body }
function parseMd(raw) {
  const meta = {};
  let body = raw;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      let k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      meta[k] = v;
    }
  }
  return { meta, body: body.trim() };
}

// 加载 skills/*/skill.md 到注册表（须在本扩展初始化早期 await，供 buildSystemPrompt/loadSkills 使用）
async function loadSkillMds() {
  await Promise.all(SKILL_MD.map(async ({ id, path }) => {
    try {
      const { meta, body } = parseMd(await fetchPackagedText(path));
      registerSkill({
        id: id || meta.id || path,
        nameKey: meta.name,
        descKey: meta.desc,
        buildin: meta.builtin !== false,
        prompt: body,
      });
    } catch (e) {
      console.warn(`技能加载失败 ${path}：`, e && e.message);
    }
  }));
}

// 加载 agents/*/agent.md 到注册表
async function loadAgentMds() {
  await Promise.all(AGENT_MD.map(async ({ id, path }) => {
    try {
      const { meta, body } = parseMd(await fetchPackagedText(path));
      registerAgent({
        id: id || meta.id || path,
        nameKey: meta.name,
        descKey: meta.desc,
        prompt: body,
      });
    } catch (e) {
      console.warn(`智能体加载失败 ${path}：`, e && e.message);
    }
  }));
}

// ========== 技能 / 工具启用（写入当前激活智能体的配置） ==========
function isForceEnabledSkill(skillId) {
  return skillId === 'core';
}
// 是否「锁定」：core 永远锁定；当前激活智能体锁定的技能集（内置智能体的基础技能）也锁定。
function isLockedSkill(skillId) {
  return state.lockedSkillSet ? state.lockedSkillSet.has(skillId) : false;
}

// 指定智能体的可变配置引用。内置智能体 -> agentOverrides[id].add{Skills,Tools,McpServers}；
// 自定义智能体 -> agent.{skills,tools,mcpServers}。返回一个「读写该配置」的抽象对象。
function getAgentConfigRef(agent) {
  if (!agent) return null;
  if (isBuiltinAgent(agent)) {
    const ov = state.agentOverrides[agent.id] || (state.agentOverrides[agent.id] = { addSkills: [], addTools: [], addMcpServers: [] });
    return {
      skills: ov.addSkills,
      tools: ov.addTools,
      mcpServers: ov.addMcpServers,
      builtin: true,
    };
  }
  return {
    skills: agent.skills || (agent.skills = []),
    tools: agent.tools || (agent.tools = []),
    mcpServers: agent.mcpServers || (agent.mcpServers = []),
    builtin: false,
  };
}
function getActiveAgentConfigRef() { return getAgentConfigRef(getActiveAgent()); }

async function persistActiveAgentConfig() {
  await window.myzone.storage.set('aiAgentOverrides', state.agentOverrides);
  await window.myzone.storage.set('aiCustomAgents', state.customAgents);
}

// 技能级开关：开启/关闭指定智能体的整个技能（连带其工具）。缺省作用于当前激活智能体。
async function setSkillEnabled(skillId, enabled, agentId) {
  const agent = agentId ? getAgent(agentId) : getActiveAgent();
  if (!agent) return;
  // 锁定技能（含 core）不可关闭
  const cfg = resolveAgentConfig(agent) || { lockedSkills: [] };
  if (!enabled && ((cfg.lockedSkills || []).includes(skillId) || isForceEnabledSkill(skillId))) {
    renderSettingsPanel();
    return;
  }
  const ref = getAgentConfigRef(agent);
  if (!ref) return;
  // 注意：ref.skills/ref.tools 是底层数组的共享引用，必须「原地修改」，
  // 否则 ref.x = ref.x.filter(...) 只重定向临时对象、写不回 agent 配置，导致关闭不生效。
  const effSkills = cfg.skills;
  const skillsArr = Array.isArray(ref.skills) ? ref.skills : (ref.skills = []);
  const baseDef = isBuiltinAgent(agent) ? (BUILTIN_AGENT_BASE[agent.id] || {}) : {};
  if (enabled) {
    if ((baseDef.defaultEnabled || []).includes(skillId)) {
      // 默认启用集：解除「已关闭」记录即可恢复默认，无需写入 addSkills（解析时默认集已含）
      const ov = state.agentOverrides[agent.id];
      if (ov && Array.isArray(ov.disabledSkills)) {
        const d = ov.disabledSkills.indexOf(skillId);
        if (d >= 0) ov.disabledSkills.splice(d, 1);
      }
    } else if (!effSkills.includes(skillId)) {
      if (!skillsArr.includes(skillId)) skillsArr.push(skillId);
      // 默认新增技能的关联工具一并启用
      if (Array.isArray(ref.tools) && ref.tools.length) {
        const names = toolsOfSkill(skillId);
        for (const n of names) {
          if (!ref.tools.includes(n)) ref.tools.push(n);
        }
      }
    }
  } else {
    const i = skillsArr.indexOf(skillId);
    if (i >= 0) skillsArr.splice(i, 1);
    // 关闭「默认启用但不锁定」的技能（如 generative）：记录到 override，阻止它被默认集还原
    if (isBuiltinAgent(agent) && !cfg.lockedSkills.includes(skillId) && (baseDef.defaultEnabled || []).includes(skillId)) {
      const ov = state.agentOverrides[agent.id] || (state.agentOverrides[agent.id] = { addSkills: [], addTools: [], addMcpServers: [] });
      const dis = Array.isArray(ov.disabledSkills) ? ov.disabledSkills : (ov.disabledSkills = []);
      if (!dis.includes(skillId)) dis.push(skillId);
    }
    const names = new Set(toolsOfSkill(skillId));
    if (Array.isArray(ref.tools) && ref.tools.length) {
      for (let k = ref.tools.length - 1; k >= 0; k--) {
        if (names.has(ref.tools[k])) ref.tools.splice(k, 1);
      }
    }
  }
  await finalizeAgentConfigChange();
}

// 工具级开关（按需启用）
async function setToolEnabled(name, on, agentId) {
  const tool = getToolByName(name);
  if (!tool) return;
  const agent = agentId ? getAgent(agentId) : getActiveAgent();
  if (!agent) return;
  // 锁定技能（含 core）的工具不可单独关闭
  const cfg = resolveAgentConfig(agent) || { lockedSkills: [] };
  const isLocked = isForceEnabledSkill(tool.skillId) || (cfg.lockedSkills || []).includes(tool.skillId);
  if (!on && isLocked) {
    renderSettingsPanel();
    return;
  }
  const ref = getAgentConfigRef(agent);
  if (!ref) return;
  const skillsArr = Array.isArray(ref.skills) ? ref.skills : (ref.skills = []);
  const toolsArr = Array.isArray(ref.tools) ? ref.tools : (ref.tools = []);
  if (on) {
    // MCP 工具：开启单个工具时确保其所属服务器 + __mcp__ 技能一并启用
    if (tool.serverId) {
      if (!cfg.skills.includes('__mcp__') && !skillsArr.includes('__mcp__')) skillsArr.push('__mcp__');
      const serversArr = Array.isArray(ref.mcpServers) ? ref.mcpServers : (ref.mcpServers = []);
      if (!(cfg.mcpServers || []).includes(tool.serverId) && !serversArr.includes(tool.serverId)) serversArr.push(tool.serverId);
    }
    if (!toolsArr.includes(name)) toolsArr.push(name);
  } else {
    // 空列表 = 全部启用；关闭单个工具需先物化为「全量减目标」，否则会变成「仅该工具启用」
    if (!toolsArr.length) {
      for (const n of TOOL_REGISTRY.map(t => t.name)) {
        if (n !== name) toolsArr.push(n);
      }
    } else {
      const i = toolsArr.indexOf(name);
      if (i >= 0) toolsArr.splice(i, 1);
    }
  }
  await finalizeAgentConfigChange();
}

// MCP 服务器级开关：开启某服务器 = 确保 __mcp__ 技能启用 + 把 serverId 加进启用列表；
// 关闭某服务器 = 从启用列表移除；若关停最后一台则同时下线 __mcp__ 技能。
// 启用列表为显式集合（空 = 未启用任何服务器），不做「空 = 全部」的隐式语义。
// 内置/自定义智能体一致：不再区分锁定，都可自由开启/关闭。
async function setMcpServerEnabled(serverId, on, agentId) {
  const agent = agentId ? getAgent(agentId) : getActiveAgent();
  if (!agent) return;
  const cfg = resolveAgentConfig(agent) || { skills: [], mcpServers: [] };
  const ref = getAgentConfigRef(agent);
  if (!ref) return;
  const skillsArr = Array.isArray(ref.skills) ? ref.skills : (ref.skills = []);
  const serversArr = Array.isArray(ref.mcpServers) ? ref.mcpServers : (ref.mcpServers = []);
  if (on) {
    // 开启服务器前确保 __mcp__ 技能已启用（自定义智能体可能尚未勾选过）
    if (!cfg.skills.includes('__mcp__') && !skillsArr.includes('__mcp__')) skillsArr.push('__mcp__');
    if (!serversArr.includes(serverId)) serversArr.push(serverId);
  } else {
    const i = serversArr.indexOf(serverId);
    if (i >= 0) serversArr.splice(i, 1);
    // 已无任何启用的服务器：关掉 __mcp__ 技能，避免留下空技能挂载
    if (!serversArr.length) {
      const j = skillsArr.indexOf('__mcp__');
      if (j >= 0) skillsArr.splice(j, 1);
    }
  }
  await finalizeAgentConfigChange();
}

// 智能体配置变更后的收尾：持久化 + 若为新激活/编辑对象则物化系统提示与 UI
async function finalizeAgentConfigChange() {
  await persistActiveAgentConfig();
  materializeActiveAgent();
  refreshContextBudget();
  rebuildSystemPrompt();
  renderSettingsPanel();
  renderTokenGauges();
}

// ========== 自定义智能体 CRUD ==========
function createCustomAgent({ name, desc, prompt, skills, tools, mcpServers }) {
  const agent = {
    id: 'custom_' + generateId(),
    name: name || tSync('customAgentDefaultName'),
    desc: desc || '',
    prompt: prompt || '',
    skills: Array.isArray(skills) ? skills : [],
    tools: Array.isArray(tools) ? tools : [],
    mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
  };
  state.customAgents.push(agent);
  return agent;
}
async function saveCustomAgents() {
  await window.myzone.storage.set('aiCustomAgents', state.customAgents);
  materializeActiveAgent();
  renderSettingsPanel();
  renderAgentSelector();
}
async function deleteCustomAgent(agentId) {
  const i = state.customAgents.findIndex(a => a.id === agentId);
  if (i < 0) return;
  const ok = await window.myzone.dialog.confirm(tSync('deleteAgentConfirm'), {
    title: tSync('deleteAgent'), confirmText: tSync('delete'), cancelText: tSync('cancel'),
  });
  if (!ok) return;
  state.customAgents.splice(i, 1);
  // 若删的是当前激活智能体，回落到内置 default
  if (state.activeAgentId === agentId) state.activeAgentId = AGENT_REGISTRY.length ? AGENT_REGISTRY[0].id : 'default';
  await saveCustomAgents();
  await persistActiveAgentConfig();
  // 若删除的正是当前激活智能体，需重写会话 system 提示
  materializeActiveAgent();
  refreshContextBudget();
  rebuildSystemPrompt();
  window.myzone.toast.success(tSync('agentDeleted'));
}

// ========== 自定义技能 CRUD ==========
async function saveCustomSkillsAll() {
  await window.myzone.storage.set('aiCustomSkills', state.customSkills);
  // 全量重建注册表：移除旧自定义，按当前数组重注册
  for (const s of SKILL_REGISTRY) if (s.custom) unregisterCustomSkill(s.id);
  for (const s of state.customSkills) {
    if (s && s.id && !findSkill(s.id)) registerCustomSkill(s);
  }
  materializeActiveAgent();
  refreshContextBudget();
  renderSettingsPanel();
  renderAgentSelector();
}
function createCustomSkill({ name, prompt }) {
  const skill = { id: 'cskill_' + generateId(), name: name || tSync('customSkillDefaultName'), prompt: prompt || '' };
  state.customSkills.push(skill);
  registerCustomSkill(skill);
  return skill;
}
async function deleteCustomSkill(skillId) {
  const i = state.customSkills.findIndex(s => s.id === skillId);
  if (i < 0) return;
  const ok = await window.myzone.dialog.confirm(tSync('deleteSkillConfirm'), {
    title: tSync('deleteSkill'), confirmText: tSync('delete'), cancelText: tSync('cancel'),
  });
  if (!ok) return;
  state.customSkills.splice(i, 1);
  unregisterCustomSkill(skillId);
  await saveCustomSkillsAll();
}

// 重建当前会话首条 system 提示并持久化。
// 技能/工具开关属于系统提示的一部分：改动后即时重建 history[0]（buildSystemPrompt 依据最新
// enabledSkills/enabledTools + agent + 技能提示片段），无需新建对话即可生效。
function rebuildSystemPrompt() {
  if (state.history && state.history.length > 0 && state.history[0] && state.history[0].role === 'system') {
    state.history[0].content = buildSystemPrompt();
  }
  saveConversations();
}

// 估算一次完整请求（系统提示 + 历史消息 + 已启用工具 schema）的 prompt token 数。
// 工具 schema 占用由 getEnabledToolCost 序列化估算后并入 contextBudget，
// 该值同时驱动「发送前超限拦截」与顶部圆环，保证展示的正是实际会发送的量。
function estimatePromptTokens(messages) {
  let sum = 0;
  for (const m of messages || []) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'event') continue; // 展示型事件不进入 AI 上下文
    let text = '';
    if (typeof m.content === 'string') text += m.content;
    else if (Array.isArray(m.content)) {
      // OpenAI 多模态 content：累加文本 part，每张图片按固定占用估算（base64 体积不应按文本计入上下文）
      for (const p of m.content) {
        if (p && p.type === 'text' && p.text != null) text += p.text;
        else if (p && p.type === 'image_url' && p.image_url && p.image_url.url) sum += 1000;
      }
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        text += ` ${tc.function && tc.function.name || ''} ${tc.function && tc.function.arguments || ''}`;
      }
    }
    if (text) sum += estimateTokens(text);
    sum += 4; // 每条消息的角色/结构开销
  }
  sum += state.contextBudget || 0; // 已启用工具 schema 的估算占用
  return sum;
}

// 供 UI 渲染： [{ id, label, descLabel, buildin, locked, enabled, tools:[{name,labelKey,enabled}] }]
function getAllSkillConfig() {
  return SKILL_REGISTRY.map(s => ({
    id: s.id,
    label: getSkillName(s),
    descLabel: s.descKey ? tSync(s.descKey) : '',
    buildin: s.buildin,
    locked: isLockedSkill(s.id),
    enabled: state.enabledSkills.includes(s.id),
    tools: toolsOfSkill(s.id).map(name => {
      const t = getToolByName(name);
      return {
        name,
        labelKey: t.labelKey || name,
        locked: isLockedSkill(t.skillId),
        enabled: isToolEnabled(name),
      };
    }),
  }));
}

// 针对「指定智能体」的有效技能视图（用于设置面板编辑任意智能体，而非仅激活的）。
// cfg 由 resolveAgentConfig(agent) 得出；locked = 内置基础技能或 core。
function getAgentSkillConfig(agentId) {
  const agent = getAgent(agentId) || getActiveAgent();
  const cfg = resolveAgentConfig(agent) || { skills: [], tools: [], mcpServers: [], lockedSkills: [] };
  const enabledSkills = new Set(cfg.skills);
  const lockedSet = new Set((cfg.lockedSkills || []).concat('core'));
  const enabledTools = new Set(cfg.tools);
  return SKILL_REGISTRY.map(s => {
    const locked = lockedSet.has(s.id);
    // 锁定的技能恒为启用（内置基础技能 / core）；其余按该智能体自身的技能集计算
    const enabled = locked || enabledSkills.has(s.id);
    return {
      id: s.id,
      label: getSkillName(s),
      descLabel: s.descKey ? tSync(s.descKey) : '',
      buildin: s.buildin,
      locked,
      enabled,
      tools: toolsOfSkill(s.id).map(name => {
        const t = getToolByName(name);
        const toolOn = enabled && (locked || !enabledTools.size || enabledTools.has(name)) &&
          (!t.serverId || (enabledMcpFor(agent) || []).includes(t.serverId));
        return {
          name,
          labelKey: t.label || t.labelKey || name,
          locked: isForceEnabledSkill(t.skillId) || locked,
          enabled: toolOn,
        };
      }),
    };
  });
}

// MCP 服务器是否在指定智能体的启用列表内（显式列表，空 = 未启用任何服务器）
function enabledMcpFor(agent) {
  const cfg = resolveAgentConfig(agent) || { mcpServers: [] };
  return (cfg.mcpServers || []);
}

// 系统提示 = agent 基础提示 + 各启用技能的提示片段 + 当前工作目录 + 语言行
function buildSystemPrompt() {
  const parts = [];
  const agent = getActiveAgent();
  if (agent && agent.prompt) parts.push(agent.prompt.trim());
  for (const skill of SKILL_REGISTRY) {
    if (!state.enabledSkills.includes(skill.id)) continue;
    const fragment = typeof skill.buildPrompt === 'function' ? skill.buildPrompt() : skill.prompt;
    if (fragment) parts.push(String(fragment).trim());
  }
  if (state.workFolderPath && state.workFolderPath !== '/Root') {
    parts.push(`当前工作目录：${state.workFolderPath}。除非用户另有要求，请在该范围内操作文件。`);
  }
  // 显式告知模型当前可用技能与工具（对应 API 下发的 tools 数组），避免模型误以为只能做文件操作。
  // 只列名称，一行一组，开销极小且前缀稳定（不破坏 L4 KV 缓存纪律）；详细参数由 tools schema 提供。
  const capability = buildToolIndex().skills
    .filter((s) => isLockedSkill(s.id) || state.enabledSkills.includes(s.id) || (state.transientSkills || []).includes(s.id))
    .filter((s) => s.id !== '__mcp__')
    .map((s) => `- ${s.id}：${s.toolNames.join('、')}`)
    .join('\n');
  if (capability) parts.push(`你目前可用的技能与工具：\n${capability}`);
  parts.push(state.appLang === 'en' ? 'Respond in English.' : '请用中文回复。');
  return parts.join('\n\n');
}

// 估算「指定智能体」一次请求占用的静态上下文（提示词 + 工具 schema，不含历史消息），
// 供设置面板 skill 卡片展示。自定义技能（SKILL_REGISTRY 的 prompt）同样计入。
// 工具占用用「真实 schema 文本序列化」后估算（estimateTokens）。
// 返回 { agentTokens, skillTokens, toolTokens, total, skillBreakdown:[{id,label,promptTokens,toolTokens,total}] }
function estimateAgentContext(agent) {
  const config = agent ? getAgentSkillConfig(agent.id) : [];
  const byId = {};
  for (const s of SKILL_REGISTRY) byId[s.id] = s;

  const agentTokens = estimateTokens((agent && agent.prompt) || '');

  const skillBreakdown = [];
  let skillTokens = 0;
  let toolTokens = 0;
  for (const sk of config) {
    if (!sk.enabled) continue;
    const s = byId[sk.id];
    const fragment = s ? (typeof s.buildPrompt === 'function' ? s.buildPrompt() : s.prompt) : '';
    const promptTokens = fragment ? estimateTokens(String(fragment)) : 0;
    // 该技能下启用工具的真实 schema token 和
    let tt = 0;
    for (const t of sk.tools || []) {
      if (!t.enabled) continue;
      const def = getToolByName(t.name);
      if (!def) continue;
      const schemaObj = {
        type: 'function',
        function: { name: def.name, description: def.description || '', parameters: def.parameters || { type: 'object', properties: {} } },
      };
      tt += estimateTokens(JSON.stringify(schemaObj));
    }
    skillBreakdown.push({ id: sk.id, label: sk.label, promptTokens, toolTokens: tt, total: promptTokens + tt });
    skillTokens += promptTokens;
    toolTokens += tt;
  }

  return {
    agentTokens,
    skillTokens,
    toolTokens,
    total: agentTokens + skillTokens + toolTokens,
    skillBreakdown,
  };
}