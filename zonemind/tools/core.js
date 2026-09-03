// myzone.ai-assistant / tools/core.js
// 工具实现（技能 'core' 下属的工具）。提示词在 skills/core/skill.md，这里只放可调用函数与 schema。
// ask_user：在必要时向用户提问（选项 + 其它 + 固定的补充说明）。
// 支持连续多轮：用 steps 一次给出要依次询问的问题，界面连续作答并显示「N/M」进度（M = 问题数 + 最后的补充说明），中间不插入对话；
// 每一步可 multiple:true 设为多选。作为内置技能 'core' 的默认工具，避免模型在信息不足时胡猜。

'use strict';

registerTool({
  skillId: 'core',
  name: 'ask_user',
  
  labelKey: 'toolAskUser',
  description: 'Ask the user one or more questions in a row and wait for their answers when you need input or a decision. Pass `steps` (array of { question, options?, multiple? }) to run a multi-round selection flow with an N/M progress indicator; otherwise pass a single `question`. Provide a short, specific question and optionally 2-4 preset choices per step; the user can also type their own answer plus an optional note. Use `multiple: true` when several options can apply at once. Use this instead of guessing when the request is ambiguous or involves choices.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The single concise question to ask, used when `steps` is omitted.' },
      options: { type: 'array', items: { type: 'string' }, description: 'Optional preset answer choices for the single question.' },
      multiple: { type: 'boolean', description: 'Whether the single question allows multiple selections.' },
      steps: {
        type: 'array', items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The concise question for this round.' },
            options: { type: 'array', items: { type: 'string' }, description: 'Optional preset choices for this round.' },
            multiple: { type: 'boolean', description: 'Whether this round allows multiple selections.' },
          },
          required: ['question'],
        }, description: 'When provided, runs several questions in a row (continuous, with N/M progress) and returns all answers together.',
      },
    },
  },
  async handler(args) {
    const multiple = !!args.multiple;
    const rawSteps = Array.isArray(args.steps) ? args.steps : [];
    const steps = rawSteps
      .map(s => ({
        question: String((s && s.question) || '').trim(),
        options: (s && Array.isArray(s.options)) ? s.options.map(String).filter(Boolean) : [],
        multiple: !!(s && s.multiple),
      }))
      .filter(s => s.question);
    if (!steps.length) {
      const q = String(args.question || '').trim();
      if (!q) return { success: false, error: '问题不能为空' };
      steps.push({
        question: q,
        options: Array.isArray(args.options) ? args.options.map(String).filter(Boolean) : [],
        multiple,
      });
    }
    const res = await askUserPrompt({ steps });
    if (res == null) return { success: false, denied: true, message: '用户取消了询问' };
    const answers = (res.items || []).map(a => ({ answer: String(a.value || '').trim() }));
    const note = String(res.note || '').trim();
    let text = answers.map(a => a.answer).join('\n---\n');
    if (note) text = text ? `${text}\n补充说明：${note}` : note;
    return { success: true, answers, note, text };
  },
  resultLines: (args, r) => {
    if (!r || !r.success) return [];
    const lines = (r.answers || []).map(a => ({ k: tSync('toolAskUser'), v: String(a.answer || '') }));
    return lines.length ? lines : [{ k: tSync('toolAskUser'), v: '' }];
  },
});

// set_window_title：设置窗口/标签页标题。属最基础的交互能力，挂在 core 技能下，
// 与 filesystem 解耦（改标题不是文件操作），随 core 一起强制启用、始终可用。
registerTool({
  skillId: 'core',
  name: 'set_window_title',
  
  labelKey: 'toolSetWindowTitle',
  description: 'Set the window/tab title of the AI Assistant. Use this to rename the current window when the user asks.',
  parameters: { type: 'object', properties: { title: { type: 'string', description: 'The new title text.' } }, required: ['title'] },
  async handler(args) {
    const title = String(args.title || '').trim();
    if (!title) return { success: false, error: '标题不能为空' };
    setCustomWindowTitle(title);
    return { success: true, title };
  },
  resultLines: (args, r) => (r && r.success && r.title) ? [{ k: tSync('toolTarget'), v: String(r.title) }] : [],
});