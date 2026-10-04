import { NextResponse } from "next/server";
import { resetRecurringDailyTasks } from "@/lib/jobs/housekeeping-recurrence";
import { purgeExpiredAuthTokens } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly reset — recurring daily tasks (e.g. "Clean lobby") go back to
 * TODO + unassigned so they reappear fresh each day. Guarded by CRON_SECRET
 * (Vercel Cron sends it as a Bearer token automatically when the env var is set).
 * Also purges expired password-reset tokens and codes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { reset } = await resetRecurringDailyTasks();
  const purgedAuthTokens = await purgeExpiredAuthTokens();
  return NextResponse.json({ ok: true, reset, purgedAuthTokens });
}
