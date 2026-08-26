export type ChatRole =
  | "command"
  | "enhancer"
  | "judge"
  | "plan"
  | "review"
  | "build";

export const ROLE_BUDGETS: Record<
  ChatRole,
  { timeoutMs: number; maxTokens: number }
> = {
  command: { timeoutMs: 4000, maxTokens: 200 },
  enhancer: { timeoutMs: 5000, maxTokens: 300 },
  judge: { timeoutMs: 3000, maxTokens: 120 },
  plan: { timeoutMs: 12000, maxTokens: 800 },
  review: { timeoutMs: 6000, maxTokens: 400 },
  build: { timeoutMs: 12000, maxTokens: 600 },
};

export const TURN_CAPS = {
  maxEnhancerAsks: 1,
  maxReplans: 1,
  maxVerifyAttempts: 2,
  maxLlmCallsSimple: 2,
  maxLlmCallsComplex: 5,
} as const;
