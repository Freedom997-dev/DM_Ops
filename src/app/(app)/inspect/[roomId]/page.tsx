import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { InspectForm } from "@/components/InspectForm";

export const dynamic = "force-dynamic";

export default async function InspectPage({
  params,
}: {
  params: { roomId: string };
}) {
  await requireUser();

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) notFound();

  const sections = await prisma.section.findMany({
    where: { archived: false },
    orderBy: { order: "asc" },
    include: {
      questions: {
        where: { archived: false },
        orderBy: { order: "asc" },
        select: { id: true, text: true },
      },
    },
  });

  const usable = sections.filter((s) => s.questions.length > 0);
  const totalQuestions = usable.reduce((n, s) => n + s.questions.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/rooms/${room.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Room {room.number}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ClipboardList className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Inspect Room {room.number}
            </h1>
            <p className="text-sm text-slate-500">
              {totalQuestions} checklist item{totalQuestions === 1 ? "" : "s"} ·
              every item starts at <span className="font-medium text-emerald-700">OK</span>;
              mark the exceptions.
            </p>
          </div>
        </div>
      </div>

      {totalQuestions === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          The checklist is empty. An admin needs to add questions first.
        </div>
      ) : (
        <InspectForm roomId={room.id} roomNumber={room.number} sections={usable} />
      )}
    </div>
  );
}
