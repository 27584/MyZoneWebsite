// myzone.ai-assistant / tools/generative.js
// 工具实现（技能 'generative'）：内置生成式模型 —— 文生图 / 文生视频。
// 经内置 AI 网关中转，按次固定费率扣 credits（视频在生成成功后才计费）。
// 提示词在 skills/generative/skill.md。这里只放可调用函数与 schema。

'use strict';

// 挑选可用的内置生成模型：优先匹配用户指定的模型名称，否则取该类型第一个可用模型
function pickBuiltinModel(type, requestedName) {
  const builtins = state.builtinModels || [];
  const candidates = builtins.filter((m) => m.builtin && m.model_type === type);
  if (!candidates.length) return null;
  if (requestedName) {
    const name = String(requestedName).trim().toLowerCase();
    const match = candidates.find(
      (m) =>
        String(m.name || '').toLowerCase() === name ||
        String(m.model || '').toLowerCase() === name ||
        String(m.builtinModelId || '').toLowerCase() === name
    );
    if (match) return match;
  }
  return candidates[0];
}

// 把网关返回的图片列表规整为 URL 数组
function normalizeImageUrls(images) {
  return (images || [])
    .map((i) => (i && typeof i === 'object') ? (i.url || i.b64_json || '') : (typeof i === 'string' ? i : ''))
    .filter(Boolean);
}

registerTool({
  skillId: 'generative',
  name: 'generate_image',
  labelKey: 'toolGenerateImage',
  async: true, // 异步后台任务：提交即返回 task_id，不阻塞模型回合；生成在后台进行，完成后由调度器回写会话
  description: 'Generate an image from a detailed text description using the built-in image generation model (billed per call, charged only on success). Submits an async task and returns immediately; the generated image is delivered to the conversation once ready. Use only when the user asks to draw/paint/generate/make an image or a cover/thumbnail.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed description of the image to generate: subject, style, scene, composition, details.' },
      model: { type: 'string', description: 'Optional image model name to use; omit to auto-select the available image model.' },
      size: { type: 'string', description: 'Optional output size, e.g. "1024x1024".' },
      n: { type: 'integer', description: 'Optional number of images to generate (default 1).' },
    },
    required: ['prompt'],
  },
  async handler(args) {
    const model = pickBuiltinModel('image', args.model);
    if (!model) return { success: false, error: tSync('genNoImageModel') };
    // 后台生成：立即发起请求并返回 task_id，由 skillbar 调度器在完成后把结果回写会话，模型无需等待
    const taskId = 'img_' + generateId();
    const promise = window.myzone.ai.generateImage({
      modelId: model.builtinModelId,
      prompt: String(args.prompt || ''),
      size: args.size,
      n: args.n,
    });
    if (!state.pendingMediaPromises) state.pendingMediaPromises = new Map();
    state.pendingMediaPromises.set(taskId, promise);
    return {
      success: true,
      task_id: taskId,
      status: 'submitted',
      model: model.name,
      message: tSync('imageTaskSubmitted'),
    };
  },
  resultLines: (args, r) => {
    if (!r || r.success !== true) return [{ k: tSync('toolGenerateImage'), v: (r && r.error) || '' }];
    return [{ k: tSync('toolGenerateImage'), v: tSync('imageTaskSubmitted') }];
  },
});

registerTool({
  skillId: 'generative',
  name: 'generate_video',
  labelKey: 'toolGenerateVideo',
  async: true, // 异步后台任务：提交即返回 task_id，不阻塞模型回合；完成后由后台轮询回写结果
  description: 'Generate a video from a detailed text description using the built-in video generation model (billed per call, charged only on success). Submits an async task and returns immediately; the result (usually 1-5 minutes) is delivered to the conversation once ready. Use only when the user asks to generate/create/make a video.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed description of the video to generate: subject, action, scene, style, camera.' },
      model: { type: 'string', description: 'Optional video model name to use; omit to auto-select the available video model.' },
      size: { type: 'string', description: 'Optional output size.' },
      duration: { type: 'number', description: 'Optional duration in seconds.' },
      ratio: { type: 'string', description: 'Optional aspect ratio, e.g. "16:9".' },
    },
    required: ['prompt'],
  },
  async handler(args) {
    const model = pickBuiltinModel('video', args.model);
    if (!model) return { success: false, error: tSync('genNoVideoModel') };
    // 提交任务即返回，由后台调度器轮询 /video/status 并把结果回写到会话，模型无需等待
    const sub = await window.myzone.ai.generateVideo({
      modelId: model.builtinModelId,
      prompt: String(args.prompt || ''),
      size: args.size,
      duration: args.duration,
      ratio: args.ratio,
    });
    if (!sub || !sub.success) return { success: false, error: (sub && sub.error) || tSync('aiCallFailed') };
    return {
      success: true,
      task_id: sub.taskId,
      status: 'submitted',
      model: model.name,
      message: tSync('videoTaskSubmitted'),
    };
  },
  resultLines: (args, r) => {
    if (!r || r.success !== true) return [{ k: tSync('toolGenerateVideo'), v: (r && r.error) || '' }];
    return [{ k: tSync('toolGenerateVideo'), v: tSync('videoTaskSubmitted') }];
  },
});