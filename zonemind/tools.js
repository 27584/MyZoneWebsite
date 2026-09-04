// 工具执行器：负责查找工具、审批、执行和记录事件。
// 工具实现位于 tools/<name>.js，技能提示词位于 skills/<name>/skill.md；事件只用于界面展示。

'use strict';

// ========== 事件记录 ==========
// 思考过程、工具操作等「展示型事件」写入当前会话历史，但不会作为 AI 上下文发送。
let activeHistory = null;
function setActiveHistory(h) { activeHistory = h; }

function pushEvent(ev) {
  if (!activeHistory) return;
  ev.uid = generateId();
  if (state.turnId) ev.turnId = state.turnId; // 关联到所在生成轮次，便于按轮删除
  activeHistory.push(ev);
}

// ===== ask_user 循环防护 =====
// 部分模型在拿到用户答复后仍可能再次调用 ask_user 提同一个问题（新工具链上更易触发），
// 形成「问→答→又问同一题」的循环。这里按生成轮次记录「已问过并已答复」的问题签名：
// 若模型在同一轮里再次发出完全相同的问题，则不再弹询问框，直接把上次答复回填给模型，
// 并明确要求其直接继续，从代码层面确定性打断循环（不依赖模型自觉、无需用户再作答）。
const askLoopAsked = new Map(); // `${turnId}::${signature}` -> { answers, note, text }
let askLoopTurn = null;
function askSignature(args) {
  const single = String((args && args.question) || '').trim();
  const steps = Array.isArray(args && args.steps) ? args.steps : [];
  const qs = single ? [single] : steps.map((s) => String((s && s.question) || '').trim()).filter(Boolean);
  return JSON.stringify(qs);
}
// 重置当前轮次的循环记录（每轮独立，避免跨轮误判）
function resetAskLoop() {
  if (askLoopTurn === state.turnId) return;
  askLoopAsked.clear();
  askLoopTurn = state.turnId;
}

// ===== 通用工具循环防护 =====
// ask_user 之外的通用防循环：模型常在同一轮对同一工具重复发出「完全相同参数」的调用（如反复读同一页面/同一查询），
// 手动重试毫无进展 → 死循环。这里确定性拦截：同轮内相同 fn + 规范化后相同参数 的第 2 次起不再执行，
// 直接返回提示让其换思路或收尾。动态数据轮询通常参数不同，不会误伤。
// 参数规范化：递归排序对象 key，避免模型仅因参数 key 顺序不同而绕过检测。
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const toolLoopCalls = new Map(); // key -> 计数
let toolLoopTurn = null;
function resetToolLoop() {
  if (toolLoopTurn === state.turnId) return;
  toolLoopCalls.clear();
  toolLoopTurn = state.turnId;
}

// ========== 工具执行 ==========
// 工具未提供 resultLines 时的兜底展示（MCP 工具等通用工具）：把返回值拍平成若干行，
// 保证卡片能看到操作的详细信息。result 可能是 { success, result }，取 result 主体；对象则逐字段展示。
function defaultToolResultLines(result) {
  if (!result || typeof result !== 'object') {
    return [{ k: tSync('toolResultLine'), v: String(result || '') }];
  }
  const src = (result && result.result !== undefined) ? result.result : result;
  if (src && typeof src === 'object') {
    return Object.keys(src).map((k) => ({
      k,
      v: src[k] && typeof src[k] === 'object' ? JSON.stringify(src[k]) : String(src[k]),
    }));
  }
  return [{ k: tSync('toolResultLine'), v: String(src ?? '') }];
}

async function runTool(tc) {
  let fn = '';
  let args = {};
  try {
    fn = (tc.function && tc.function.name) || '';
    args = JSON.parse(tc.function.arguments || '{}');
  } catch (e) {
    return JSON.stringify({ success: false, error: '工具参数解析失败' });
  }

  const tool = getToolByName(fn);
  const label = tSync(tool ? (tool.labelKey || fn) : fn);
  if (!tool) return JSON.stringify({ success: false, error: `未知工具: ${fn}` });
  // 异步工具（如生成视频）：提交即返回，不渲染结果卡片；由 skillbar 后台调度器轮询并在完成后回写
  const isAsync = !!tool.async;

  // 泛化循环防护：同轮内「同一工具 + 相同参数」第 2 次起不再执行，避免重复操作死循环
  // （ask_user 已走上方专用防护，这里覆盖其余所有工具）
  if (fn !== 'ask_user') {
    resetToolLoop();
    const loopKey = `${fn}::${stableStringify(args)}`;
    const loopCount = (toolLoopCalls.get(loopKey) || 0) + 1;
    toolLoopCalls.set(loopKey, loopCount);
    if (loopCount >= 2) {
      const notice = tSync('toolLoopBreak');
      // 渲染一条事件提示，让用户/模型都看到「重复调用被拦截」，避免静默
      pushEvent({ role: 'event', type: 'tool', name: fn, label, status: 'executed', lines: [{ k: notice, v: '' }] });
      return JSON.stringify({ success: false, loop: true, message: notice });
    }
  }

  // ask_user 循环防护：同一轮内模型再次询问完全相同的问题时，不再弹框，直接回填上次答复
  // 并明确要求其继续执行，从而打断「问→答→又问同一题」的循环，且无需用户重复作答。
  if (fn === 'ask_user') {
    resetAskLoop();
    const sig = askSignature(args);
    if (sig && sig !== '[]') {
      const key = `${state.turnId}::${sig}`;
      const prior = askLoopAsked.get(key);
      if (prior) {
        const notice = tSync('askRepeatNotAllowed');
        const ret = {
          success: true,
          answers: prior.answers,
          note: prior.note,
          text: `${notice} ${prior.text}`,
          reused: true,
        };
        // 渲染一条事件卡片展示「已自动沿用上次答复」，避免只发进上下文的静默行为
        pushEvent({ role: 'event', type: 'tool', name: fn, label, status: 'executed', lines: [{ k: tSync('askRepeatNotAllowed'), v: prior.text }] });
        return JSON.stringify(ret);
      }
    }
  }

  const isWrite = !!tool.write;
  const isDelete = !!tool.destructive;
  // 「敏感操作」与「工作目录外」是两回事：敏感可能还因其他原因触发（如永久删除），
  // 不能拿 isSensitive 的结果冒充是否在工作目录外，否则永久删除会误显示「工作目录外」警告。
  const isSensitive = tool.isSensitive ? !!tool.isSensitive(args) : false;
  const isOutsideWorkDir = tool.isOutsideWorkDir ? !!tool.isOutsideWorkDir(args) : false;
  // 永久删除：不走回收站、不可恢复，确认卡片应给出对应警告（而非「移入回收站」文案）
  const isPermanentDelete = isDelete && fn === 'delete_items' && !!(args && args.permanent);

  // 事件记录（展示给用户，不作为 AI 记忆）
  const ev = { role: 'event', type: 'tool', name: fn, label, status: 'pending', lines: [] };
  pushEvent(ev);

  // 仅当用户正在查看生成会话时才渲染卡片；否则切换到其他会话时不影响生成
  const viewing = isViewingGenerating();
  // 异步工具不渲染结果卡片（占位气泡 + 完成后回写由 skillbar 后台调度器负责）
  const card = (viewing && !isAsync) ? createToolCard(label, isDelete, isOutsideWorkDir) : null;

  let confirmed = true;
  // 自动执行的操作（读操作本就无需确认；写操作在自动/完全访问模式的安全路径也直接执行）
  // 执行完后折叠成一行标题（保留标题+状态，点击可展开查看详情）。
  let collapseAfterExec = !isWrite;
  if (isWrite) {
    const confirmLines = tool.confirmLines ? tool.confirmLines(args) : [];
    ev.lines = confirmLines;
    // 风险评分：自动审批模式下按「手动审批=逐条确认 / 自动=风险达到阈值才确认 / 完全放行=直接执行」
    const risk = assessToolRisk(tool, args);
    let needConfirm;
    if (state.approvalMode === 'manual') needConfirm = true;
    else if (state.approvalMode === 'auto') needConfirm = autoNeedsConfirm(risk);
    else needConfirm = false;
    if (needConfirm) {
      if (viewing) {
        confirmed = await showConfirmOnCard(card, { lines: confirmLines, isDelete, isOutsideWorkDir, isPermanentDelete, risk });
      } else {
        // 用户不在生成会话中：用应用内对话框确认，避免打断生成；风险一并展示
        const detail = [...confirmLines,
          { k: tSync('riskLevelLabel'), v: `${tSync(risk.levelKey)}（${tSync('ctxRiskScore')} ${risk.score}/100）` }]
          .map(l => `${l.k}：${l.v}`).join('\n');
        confirmed = await window.myzone.dialog.confirm(detail, {
          title: label,
          confirmText: tSync('toolConfirmAllow'),
          cancelText: tSync('toolConfirmDeny'),
        });
      }
    } else if (card) {
      // 完全放行模式，或自动档中风险未达阈值的写操作：直接展示详情，无需确认
      // 这类卡片没有确认按钮，需在执行完后折叠成一行标题（与确认卡片一致）
      addCardLines(card, confirmLines);
      collapseAfterExec = true;
    }
  }

  if (!confirmed) {
    ev.status = 'denied';
    if (card) setCardStatus(card, 'denied', tSync('toolDenied'));
    // ask_user 被取消（典型地切走对话触发的自动否决）：记录该问题为「已答复否决」，
    // 避免模型在同一轮再次弹出同一问题、出现在其它对话里打断用户。
    if (fn === 'ask_user') {
      const sig = askSignature(args);
      if (sig && sig !== '[]') {
        askLoopAsked.set(`${state.turnId}::${sig}`, { answers: [], note: '', text: tSync('askCancelled') });
      }
    }
    return JSON.stringify({ success: false, denied: true, message: '用户拒绝了该操作' });
  }

  ev.status = 'executing';
  if (card) setCardStatus(card, 'pending', tSync('executingTools'));
  try {
    const result = await tool.handler(args);
    if (result.success) {
      ev.status = 'executed';
      // 工具级消耗的 credits（如生成图片）累计到本轮，随最终 assistant 消息 footer 展示
      const toolCredits = Number(result && result.credits_cost);
      if (Number.isFinite(toolCredits) && toolCredits > 0) state.toolCredits = (state.toolCredits || 0) + toolCredits;
      if (isAsync && result.task_id) {
        // 异步生成任务（如图片/视频）：提交成功即入队后台，占位气泡由调度器完成后原地替换
        const mediaMode = fn === 'generate_video' ? 'video' : 'image';
        ev.lines = [{ k: label, v: tSync(mediaMode === 'video' ? 'videoTaskSubmitted' : 'imageTaskSubmitted') }];
        enqueueMediaTask({
          convId: state.currentConvId,
          taskId: result.task_id,
          mode: mediaMode,
          modelName: result.model || '',
          prompt: String(args.prompt || ''),
        });
      } else {
        // 记录已完成答复的问题签名，供本轮循环防护复用
        if (fn === 'ask_user' && result.text) {
          const sig = askSignature(args);
          if (sig && sig !== '[]') askLoopAsked.set(`${state.turnId}::${sig}`, { answers: result.answers, note: result.note, text: result.text });
        }
        const detail = tool.resultLines ? tool.resultLines(args, result) : defaultToolResultLines(result);
        if (detail.length) ev.lines = [...(ev.lines || []), ...detail];
        if (card) {
          setCardStatus(card, 'done', tSync('toolExecuted'));
          addCardLines(card, detail);
        }
      }
    } else {
      ev.status = 'failed';
      ev.error = result.error || '';
      // ask_user 被取消（典型地切走对话触发自动否决）：记录该问题为「已答复否决」，
      // 避免模型在同一轮再次重复弹出同一问题、出现在其它对话里打断用户。
      if (fn === 'ask_user' && result && result.denied) {
        const sig = askSignature(args);
        if (sig && sig !== '[]') {
          askLoopAsked.set(`${state.turnId}::${sig}`, { answers: [], note: '', text: tSync('askCancelled') });
        }
      }
      if (card) {
        setCardStatus(card, 'err', tSync('toolFailed'));
        addCardBody(card, `<span class="k">${escapeHtml(result.error || '')}</span>`);
      }
    }
    // 直显型卡片执行完后折叠成一行标题，点击可展开
    if (collapseAfterExec && card) collapseToolCard(card);
    // L0 源头节流：工具结果按预算写入上下文，超长→存缓存 + 摘要（完整内容模型可用 result_read 取回）。
    // UI 上仍展示完整 detail，仅「写入 messages 的副本」被压缩，不影响展示与历史回溯。
    return capToolOutput(fn, tool, JSON.stringify(result)).text;
  } catch (err) {
    ev.status = 'failed';
    ev.error = err.message || '';
    if (card) {
      setCardStatus(card, 'err', tSync('toolFailed'));
      addCardBody(card, `<span class="k">${escapeHtml(err.message || '')}</span>`);
    }
    return JSON.stringify({ success: false, error: err.message || '执行失败' });
  }
}