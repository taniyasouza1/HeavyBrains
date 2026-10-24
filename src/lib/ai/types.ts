import type { z } from "zod";

export type Effort = "low" | "medium" | "high";

/** One structured call to a model. Real implementation: client.ts. Tests pass a fake. */
export interface Llm {
  call<T>(args: {
    agent: string;
    system: string;
    user: string;
    schema: z.ZodType<T>;
    effort?: Effort;
    maxTokens?: number;
    /** Overrides the default model, e.g. a cheaper one for the fan-out reviewers. */
    model?: string;
  }): Promise<T>;
}

export type AgentErrorCode = "ai_auth" | "ai_rate_limit" | "ai_refused" | "ai_truncated" | "ai_invalid" | "ai_unavailable";

export class AgentError extends Error {
  constructor(readonly agent: string, readonly code: AgentErrorCode, message: string) {
    super(message);
  }
}
