import { prisma } from "@/lib/db";

type AuditInput = {
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "ARCHIVE" | "RESTORE" | "LOGIN";
  entity: "Room" | "Question" | "Section" | "User" | "Inspection";
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
};

export async function logAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      details:
        input.details == null
          ? null
          : typeof input.details === "string"
            ? input.details
            : JSON.stringify(input.details),
    },
  });
}
