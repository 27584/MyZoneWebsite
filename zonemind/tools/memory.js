'use strict';

const MEMORY_KEY = 'ai_global_memory';
const MEMORY_LIMIT = 100;
function memoryScope(args) { return args.scope === 'conversation' ? 'conversation' : 'global'; }
function memoryText(value) { return String(value == null ? '' : value).trim(); }
async function readMemories(scope) {
  if (scope === 'conversation') { const conv = state.conversations.find(c => c.id === state.currentConvId); return conv && Array.isArray(conv.memory) ? conv.memory : []; }
  const result = await window.myzone.server.get('user', MEMORY_KEY);
  const value = result && (result.data !== undefined ? result.data : result.value);
  return result && result.success && Array.isArray(value) ? value : [];
}
async function writeMemories(scope, memories) {
  if (scope === 'conversation') { const conv = state.conversations.find(c => c.id === state.currentConvId); if (!conv) return { success: false, error: '当前没有对话' }; conv.memory = memories; await saveConversations(); return { success: true }; }
  return window.myzone.server.set('user', MEMORY_KEY, memories);
}
registerTool({
  skillId: 'core', name: 'memory', labelKey: 'toolMemory',
  description: 'Manage user memory. Use scope global for durable cross-conversation preferences and facts, or conversation for facts relevant only to the current conversation. Actions: add, list, search, update, delete.',
  parameters: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'list', 'search', 'update', 'delete'] }, scope: { type: 'string', enum: ['global', 'conversation'] }, id: { type: 'string', description: 'Memory id, required for update/delete.' }, content: { type: 'string', description: 'Memory text, required for add/update.' }, query: { type: 'string', description: 'Text to search for.' } }, required: ['action', 'scope'] },
  write: true,
  confirmLines: (args) => ['add', 'update', 'delete'].includes(args.action) ? [{ k: tSync('toolMemory'), v: `${args.scope}: ${args.action}` }] : [],
  async handler(args) {
    const scope = memoryScope(args); const action = String(args.action || 'list'); let memories = await readMemories(scope);
    if (action === 'list') return { success: true, memories };
    if (action === 'search') { const query = memoryText(args.query).toLowerCase(); return { success: true, memories: query ? memories.filter(m => m.content.toLowerCase().includes(query)) : memories }; }
    if (action === 'add') { const content = memoryText(args.content); if (!content) return { success: false, error: '记忆内容不能为空' }; if (memories.length >= MEMORY_LIMIT) return { success: false, error: '记忆数量已达上限' }; const item = { id: generateId(), content: content.slice(0, 20000), createdAt: Date.now(), updatedAt: Date.now() }; memories = memories.concat(item); return Object.assign(await writeMemories(scope, memories), { memory: item }); }
    const index = memories.findIndex(m => m.id === String(args.id || '')); if (index < 0) return { success: false, error: '未找到指定记忆' };
    if (action === 'update') { const content = memoryText(args.content); if (!content) return { success: false, error: '记忆内容不能为空' }; memories[index] = Object.assign({}, memories[index], { content: content.slice(0, 20000), updatedAt: Date.now() }); } else if (action === 'delete') memories.splice(index, 1); else return { success: false, error: '不支持的操作' };
    return Object.assign(await writeMemories(scope, memories), { memories });
  },
  resultLines: (args, result) => { if (!result || !result.success) return [{ k: tSync('toolMemory'), v: String((result && result.error) || tSync('toolFailed')) }]; const list = result.memories || (result.memory ? [result.memory] : []); return list.map(m => ({ k: m.id, v: m.content })); },
});