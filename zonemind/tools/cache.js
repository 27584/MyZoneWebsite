'use strict';

registerTool({
  skillId: 'core',
  name: 'result_read',
  labelKey: 'toolResultRead',
  description:
    'Retrieve the full stored content of a previously truncated tool result or oversized archived message by its reference id. ' +
    'Use it whenever you see a truncated marker (`_truncatedOutput:true`) or a `[Reference id:xxx]` note in a previous result/message ' +
    'and you need the complete details to continue the task. Returns the full stored text without truncation.',
  parameters: {
    type: 'object',
    properties: {
      refId: { type: 'string', description: 'The reference id captured in the truncated result or message.' },
    },
    required: ['refId'],
  },
  async handler(args) {
    const refId = String((args && args.refId) || '').trim();
    const text = ctxGet(refId);
    if (text == null) return { success: false, error: tSync('resultReadNotFound') };
    return { success: true, result: text, refId };
  },
  resultLines: (args, r) => {
    if (!r || !r.success) return [];
    const text = String(r.result || '');
    return [{ k: tSync('toolResultRead'), v: `${text.length} 字符 / ${formatTokenCount(estimateTokens(text))} tokens（refId: ${r.refId}）` }];
  },
});
