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

  return <ChecklistManager sections={data} />;
}
