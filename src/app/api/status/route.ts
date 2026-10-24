import { connection } from "next/server";
import { isLiveConfigured } from "@/lib/crustdata/client";


/** Reports only whether live mode is usable — never the key itself. */
export async function GET() {
  await connection(); // read env per request, not at build time
  const defaultMode = process.env.DATA_MODE === "live" ? "live" : "demo";
  return Response.json({ liveConfigured: isLiveConfigured(), defaultMode });
}
