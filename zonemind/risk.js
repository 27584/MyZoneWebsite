// myzone.ai-assistant / risk.js
// 操作风险评估：由一组规则对「写操作」打分（0-100），供「自动审批」模式判断是否需人工确认。
// 用户可在设置中设定阈值 `state.settings.riskThreshold`，风险分 >= 阈值 的操作需确认。

'use strict';

const DEFAULT_RISK_THRESHOLD = 70;

// 评估一次操作的固有风险。对读操作（非 write）返回最低风险，不触发确认。
// 入参 tool 为合并后的工具定义（含 write / destructive / isSensitive / isOutsideWorkDir），args 为本次参数。
// 返回 { score, level, levelKey }。score 0-100，越界封顶。
function assessToolRisk(tool, args) {
  if (!tool || !tool.write) return { score: 0, level: 'low', levelKey: 'riskLow' };

  const isDelete = !!tool.destructive;
  const isSensitive = tool.isSensitive ? !!tool.isSensitive(args) : false;
  const isPermanentDelete = isDelete && tool.name === 'delete_items' && !!(args && args.permanent);

  let score = 55;              // 写操作基线：创建/移动/重命名/编辑等
  if (isSensitive) score += 20; // 触碰到工作目录外/敏感路径
  if (isDelete) score += 30;    // 删除类（destructive）
  if (isPermanentDelete) score = 100; // 永久删除最危险，封顶必然要求确认
  score = Math.min(100, score);

  let level, levelKey;
  if (score >= 90) { level = 'critical'; levelKey = 'riskCritical'; }
  else if (score >= 60) { level = 'high'; levelKey = 'riskHigh'; }
  else if (score >= 30) { level = 'medium'; levelKey = 'riskMedium'; }
  else { level = 'low'; levelKey = 'riskLow'; }

  return { score, level, levelKey };
}

// 「自动审批」模式下是否需要人工确认：当前操作的分数需达到用户设定的阈值
function autoNeedsConfirm(risk) {
  const threshold = (state.settings && typeof state.settings.riskThreshold === 'number')
    ? state.settings.riskThreshold
    : DEFAULT_RISK_THRESHOLD;
  return risk.score >= threshold;
}