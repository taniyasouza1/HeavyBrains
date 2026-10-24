import { connection } from "next/server";
import { isLiveConfigured } from "@/lib/crustdata/client";
import { aiModel, isAiConfigured } from "@/lib/ai/client";
import { isPayConfigured } from "@/lib/pay/server";
import { isLiveConfigured as liveKey } from "@/lib/crustdata/client";


/** Reports only whether live mode and AI agents are usable — never the keys themselves. */
export async function GET() {
  await connection(); // read env per request, not at build time
  const defaultMode = process.env.DATA_MODE === "live" ? "live" : "demo";
  return Response.json({ liveConfigured: isLiveConfigured(), defaultMode, aiConfigured: isAiConfigured(), aiModel: aiModel(), payConfigured: isPayConfigured(), contentConfigured: liveKey() && isAiConfigured() });
}
