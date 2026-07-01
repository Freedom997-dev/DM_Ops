import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { ChecklistManager } from "@/components/ChecklistManager";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  await requireAdmin();

  const sections = await prisma.section.findMany({
    where: { archived: false },
    orderBy: { order: "asc" },
    include: {
      questions: {
        where: { archived: false },
        orderBy: { order: "asc" },
      },
    },
  });

  const data = sections.map((s) => ({
    id: s.id,
    name: s.name,
    questions: s.questions.map((q) => ({ id: q.id, text: q.text })),
  }));

  return (
    <div className="space-y-5">
      <Link
        href="/services/pm/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to PM settings
      </Link>
      <ChecklistManager sections={data} />
    </div>
  );
}
