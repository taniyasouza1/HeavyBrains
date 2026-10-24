import { connection } from "next/server";
import { crustdataGet, isLiveConfigured } from "@/lib/crustdata/client";

/** Remaining Crustdata credits. Free to call. Returns the number only, never the key. */
export async function GET() {
  await connection();
  if (!isLiveConfigured()) return Response.json({ credits: null });
  try {
    const body = (await crustdataGet("/account/credits")) as { account?: { credits?: number } };
    const credits = body.account?.credits;
    return Response.json({ credits: typeof credits === "number" ? credits : null });
  } catch {
    return Response.json({ credits: null });
  }
}
