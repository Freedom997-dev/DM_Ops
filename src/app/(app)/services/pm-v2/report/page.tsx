import { requirePermission } from "@/lib/session";
import { buildReport, toDTO } from "@/lib/pmv2-data";
import { quarterFromParams } from "@/lib/pmv2";
import { PmV2Report } from "@/components/pmv2/PmV2Report";

export const dynamic = "force-dynamic";

export default async function PmV2ReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  await requirePermission("pmv2:reports:view");
  const q = quarterFromParams(searchParams.q);
  const report = await buildReport(q);
  return <PmV2Report report={toDTO(report)} />;
}
