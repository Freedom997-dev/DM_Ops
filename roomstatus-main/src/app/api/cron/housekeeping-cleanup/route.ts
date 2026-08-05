import { NextResponse } from "next/server";
import { sweepExpiredHousekeepingPhotos } from "@/lib/jobs/housekeeping-sweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily retention sweep — deletes housekeeping photos older than the configured
 * retention window. Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer
 * token automatically when the env var is set).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { deleted } = await sweepExpiredHousekeepingPhotos();
  return NextResponse.json({ ok: true, deleted });
}
