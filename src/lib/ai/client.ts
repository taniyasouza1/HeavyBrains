import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AgentError, type Llm } from "./types";

export const isAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/** Default model for every agent. Override with ANTHROPIC_MODEL; the fan-out reviewers can use ANTHROPIC_REVIEW_MODEL. */
export const aiModel = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const reviewModel = () => process.env.ANTHROPIC_REVIEW_MODEL?.trim() || undefined;

export function createLlm(): Llm {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return {
    async call({ agent, system, user, schema, effort = "medium", maxTokens = 8000, model }) {
      try {
        const res = await client.messages.parse({
          model: model ?? aiModel(),
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort, format: zodOutputFormat(schema) },
        });
        if (res.stop_reason === "refusal") throw new AgentError(agent, "ai_refused", `${agent}: the model declined this request.`);
        if (res.stop_reason === "max_tokens") throw new AgentError(agent, "ai_truncated", `${agent}: the response was cut off before it finished.`);
        if (!res.parsed_output) throw new AgentError(agent, "ai_invalid", `${agent}: the model returned output that did not match the expected format.`);
        return res.parsed_output as never;
      } catch (e) {
        if (e instanceof AgentError) throw e;
        if (e instanceof Anthropic.AuthenticationError) throw new AgentError(agent, "ai_auth", "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.");
        if (e instanceof Anthropic.RateLimitError) throw new AgentError(agent, "ai_rate_limit", "The Anthropic API rate limit was reached. Try again in a minute.");
        if (e instanceof Anthropic.APIError) throw new AgentError(agent, "ai_unavailable", `${agent}: Anthropic API error (${e.status ?? "network"}). ${e.message}`);
        throw new AgentError(agent, "ai_unavailable", `${agent}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    },
  };
}
