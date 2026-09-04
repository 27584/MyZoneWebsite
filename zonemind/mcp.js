// ZoneMind 网页版：mcp.js
// 跨扩展 MCP 工具动态接入：把其它扩展（其它扩展可注册 MCP 服务）经 window.myzone.mcp 暴露的工具，
// 运行时合入本扩展的工具表与系统提示，让 AI 像调用本地工具一样调用它们。
// 每个 MCP 工具注册为技能 '__mcp__' 下的一个普通工具（registerTool, skillId:'__mcp__'），
// handler 走 myzone.mcp.call 路由回目标扩展执行。MCP 在设置里独立分区展示，与 agent/skill 分离。

'use strict';

const MCP_SKILL_ID = '__mcp__';

// 已合并的 MCP 工具定义（为在下轮同步时能精确移除旧工具，单独维护清单）
let _mcpToolDefs = [];
// 已发现的 MCP 服务器：{ serverId, extId, name }（供设置分区按服务器分组展示）
let _mcpServers = [];
// 上次同步是否成功；用于判断 mcp 是否可用
let _mcpAvailable = false;

// 惰性注册 '__mcp__' 技能（首次同步时创建一次）
// 页面加载即注册：让它在 loadSkills 读取 enabledSkills 之前就存在于 SKILL_REGISTRY，
// 这样 __mcp__ 的启用/禁用状态能被正确持久化，而不是每次都默认开启。
function ensureMcpSkill() {
  if (findSkill(MCP_SKILL_ID)) return;
  registerSkill({
    id: MCP_SKILL_ID,
    nameKey: 'skillMcpName',
    descKey: 'skillMcpDesc',
    buildin: true,
    // 仅当确有 MCP 工具注入时才在系统提示里说明，避免空技能污染提示
    buildPrompt: () => _mcpToolDefs.length ? '以下 mcp__ 开头的工具由其它扩展通过 MCP 机制暴露，你可以直接调用它们完成任务。' : '',
  });
}
ensureMcpSkill(); // 页面加载即注册（此时工具表为空，同步后再填充）

// 手写 schema 转 @type 要求的 parameters
function toToolSchema(meta) {
  if (meta && meta.parameters && typeof meta.parameters === 'object') return meta.parameters;
  // 未提供 schema 的扩展工具，给一个宽松对象形参，让模型可自由传参
  return { type: 'object', properties: {}, additionalProperties: true };
}

// 把 _mcpToolDefs 里最新一批工具写回工具表（先移除上一批，再注册新一批）
function applyMcpTools() {
  for (let i = TOOL_REGISTRY.length - 1; i >= 0; i--) {
    if (TOOL_REGISTRY[i]._mcpSource) TOOL_REGISTRY.splice(i, 1);
  }
  // 直接 splice 不会触发 resetToolIndex()；若不重置，_toolIdx 会残留已删除的 mcp__* 工具名，
  // 导致后续 getEnabledToolDefs() 里 getToolByName 返回 undefined 而抛错。这里显式失效缓存。
  resetToolIndex();
  for (const def of _mcpToolDefs) registerTool(def);
}

// 同步一次：发现并合并所有可见 MCP 服务工具。返回是否同步到任何工具。
async function syncMcpTools() {
  _mcpAvailable = false;
  if (!(window.myzone && window.myzone.mcp && typeof window.myzone.mcp.list === 'function')) {
    return false;
  }
  let servers = [];
  try {
    const res = await window.myzone.mcp.list();
    servers = Array.isArray(res) ? res : [];
    _mcpAvailable = true;
  } catch (e) {
    console.warn('MCP 工具同步失败：', e && e.message);
    _mcpServers = [];
    _mcpToolDefs = [];
    applyMcpTools();
    return false;
  }

  ensureMcpSkill();
  _mcpServers = servers.map(s => ({
    serverId: s.serverId,
    extId: s.extId || '',
    online: s.online !== false, // 主进程标记：扩展窗口是否打开（离线仍可被模型认知）
    name: s.name || s.serverName || s.serverId,
  }));
  const defs = [];
  for (const s of servers) {
    const serverId = s.serverId;
    const extId = s.extId || '';
    const list = Array.isArray(s.tools) ? s.tools : [];
    for (const raw of list) {
      const meta = raw && typeof raw === 'object' ? raw : { name: raw };
      const name = meta.name;
      if (!name) continue;
      const toolName = 'mcp__' + serverId + '__' + name; // 工具名带服务器前缀，避免不同扩展的同名工具互相覆盖
      defs.push({
        _mcpSource: true,
        skillId: MCP_SKILL_ID,
        serverId,
        label: name, // 原 MCP 工具名（设置分区里展示用）
        name: toolName,
        write: !!meta.write,
        description: meta.description || `调用扩展 ${extId} 通过 MCP 暴露的工具 ${name}`,
        parameters: toToolSchema(meta),
        async handler(args) {
          const res = await window.myzone.mcp.call({ serverId, tool: name, args: args || {} });
          return res;
        },
      });
    }
  }

  _mcpToolDefs = defs;
  applyMcpTools();
  // 是否启用由 state.enabledSkills（用户开关）决定，不在此强开
  return defs.length > 0;
}

// 是否成功接入过 MCP 能力（供 UI 展示）
function isMcpAvailable() { return _mcpAvailable; }

// 供设置分区分组展示：按 MCP 服务器返回「服务器 + 其下可开关注具」数据。
// 服务器启用态 = __mcp__ 技能开启 && serverId 在该智能体显式启用列表内；
// 各工具启用态 = 服务器启用 && （该智能体工具集为空 = 全部启用，或显式包含该工具名）。
// 可传 agentId 查看「指定智能体」的 MCP 配置，缺省为当前激活智能体（= 物化后的全局态）。
function getMcpServerGroups(agentId) {
  const agent = agentId ? getAgent(agentId) : getActiveAgent();
  const cfg = agent ? resolveAgentConfig(agent) : { skills: [], tools: [], mcpServers: [] };
  const mcpOn = cfg.skills.includes('__mcp__');
  const mcpList = (cfg.mcpServers || []);
  const toolSet = (cfg.tools || []);
  const serverOnById = (id) => mcpOn && mcpList.includes(id);
  return _mcpServers.map(srv => {
    const serverOn = serverOnById(srv.serverId);
    const tools = _mcpToolDefs
      .filter(def => def.serverId === srv.serverId)
      .map(def => {
        const t = getToolByName(def.name);
        return {
          toolName: def.name,
          label: def.label || def.name.replace(/^mcp__[^_]*__/, ''),
          write: !!(t && t.write),
          // 服务器启用 && （工具集为空 = 全部启用，或显式包含该工具）
          enabled: serverOn && (!toolSet.length || toolSet.includes(def.name)),
        };
      });
    return { serverId: srv.serverId, name: srv.name || srv.serverId, extId: srv.extId, online: srv.online, enabled: serverOn, tools };
  }).filter(g => g.tools.length > 0);
}

// 其它扩展注册/注销 MCP 后，主进程会广播 'extensions-mcp-changed'。
// 监听后实时重新发现工具并刷新技能面板，避免必须刷新 AI 助手页面才能看到新注册的 MCP 工具。
function subscribeMcpChanges() {
  if (!(window.electronAPI && typeof window.electronAPI.on === 'function')) return;
  window.electronAPI.on('extensions-mcp-changed', () => {
    syncMcpTools()
      .then(() => { refreshContextBudget(); renderSettingsPanel(); })
      .catch((e) => { console.warn('MCP 变更后重新同步失败：', e && e.message); });
  });
}
subscribeMcpChanges();