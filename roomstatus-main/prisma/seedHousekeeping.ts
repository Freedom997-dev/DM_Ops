import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.housekeepingSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", deleteOnApproval: true, retentionDays: 7 },
    update: {},
  });
  console.log("✓ Housekeeping settings singleton ensured");

  // Default status actions for the check-out panel.
  const count = await prisma.housekeepingStatusAction.count();
  if (count === 0) {
    await prisma.housekeepingStatusAction.createMany({
      data: [
        { label: "Checkout", order: 0 },
        { label: "Request for cleaning", order: 1 },
      ],
    });
    console.log("✓ Seeded default status actions");
  }

  // Default daily-task templates for the "New task" panel.
  const templateCount = await prisma.housekeepingTaskTemplate.count();
  if (templateCount === 0) {
    await prisma.housekeepingTaskTemplate.createMany({
      data: [
        { label: "Clean lobby", order: 0 },
        { label: "Laundry", order: 1 },
        { label: "Restock supplies", order: 2 },
        { label: "Pool area", order: 3 },
        { label: "Corridors", order: 4 },
      ],
    });
    console.log("✓ Seeded default task templates");
  }

  // Default room-cleaning checklist (templateId null = room cleaning).
  const checklistCount = await prisma.housekeepingChecklistItem.count({ where: { templateId: null } });
  if (checklistCount === 0) {
    await prisma.housekeepingChecklistItem.createMany({
      data: [
        { templateId: null, label: "Strip & remake beds with fresh linen", order: 0 },
        { templateId: null, label: "Clean & sanitize bathroom", order: 1 },
        { templateId: null, label: "Dust surfaces & fixtures", order: 2 },
        { templateId: null, label: "Vacuum / mop floors", order: 3 },
        { templateId: null, label: "Restock amenities & minibar", order: 4 },
        { templateId: null, label: "Empty bins & replace liners", order: 5 },
        { templateId: null, label: "Check lights, AC & TV work", order: 6 },
      ],
    });
    console.log("✓ Seeded default room-cleaning checklist");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
