/** One policy for the provider payload AND the credit precheck. */
export function isReasoningModel(model: string): boolean {
  return [
    /^moonshotai\/kimi-k2/i,
    /^openai\/o[1-9]/i,
    /^openai\/gpt-5(?:\.[0-9]+)?(?:-|$)/i,
    /^anthropic\/claude-(?:opus|sonnet)-4(?:\.5)?:thinking/i,
    /^deepseek\/deepseek-r1/i,
    /^qwen\/qwq/i,
    /^x-ai\/grok-(?:3|4).*-(?:thinking|reasoning|mini)/i,
    /\/.*-(?:thinking|reasoning|reasoner)/i,
  ].some(re => re.test(model)) && !/^openai\/gpt-5(?:\.[0-9]+)?-chat(?:-|:|$)/i.test(model);
}

export function effectiveOutputTokens(model: string, requested?: number): number {
  const tokens = Number.isFinite(requested) && requested! > 0 ? Math.floor(requested!) : 2000;
  return isReasoningModel(model) ? Math.max(tokens, 6000) : tokens;
}

export function precheckOutputTokens(models: string[], requested?: number): number {
  return Math.max(...(models.length ? models : [""]).map(model => effectiveOutputTokens(model, requested)));
}
