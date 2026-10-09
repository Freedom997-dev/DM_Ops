import { NextResponse } from "next/server";
import { remindNotStarted } from "@/lib/jobs/daily-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Late-morning reminder (15:00 UTC ≈ 11 AM Eastern summer / 10 AM winter):
 * notify the people who run Daily Cleanliness when today's inspection hasn't
 * been started. Guarded by CRON_SECRET like the other cron routes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await remindNotStarted()) });
}
