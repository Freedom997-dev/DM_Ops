import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { getHotelName } from "@/lib/pmv2-data";
import { PmV2Nav } from "@/components/pmv2/PmV2Nav";

export const dynamic = "force-dynamic";

export default async function PmV2Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("pmv2:board:view");

  // Open-issue count per quarter for the "Issues" tab badge (layouts can't
  // read ?q=, so the nav picks its quarter's number client-side).
  const [hotel, open] = await Promise.all([
    getHotelName(),
    prisma.pmV2Result.findMany({
      where: {
        status: { in: ["REPAIR", "REPLACE", "MISSING"] },
        inspection: { area: { archived: false } },
        OR: [{ itemId: null }, { item: { archived: false, section: { archived: false } } }],
      },
      select: { inspection: { select: { quarter: true } } },
    }),
  ]);
  const issueCounts: Record<string, number> = {};
  for (const r of open) issueCounts[r.inspection.quarter] = (issueCounts[r.inspection.quarter] ?? 0) + 1;

  return (
    <div className="space-y-5">
      <PmV2Nav
        hotel={hotel}
        issueCounts={issueCounts}
        canReport={can(user, "pmv2:reports:view")}
        canSetup={can(user, "pmv2:setup:configure")}
      />
      {children}
    </div>
  );
}
