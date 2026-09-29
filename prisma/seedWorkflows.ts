/**
 * Seeds the Daily Cleanliness Inspection workflow + its 18 items.
 *
 * Idempotent (skips if the slug exists). Called from prisma/seed.ts, so every
 * production deploy (`prisma db seed`) ensures the service exists. The older
 * manual SQL (prisma/manual-migrations/2026-06-30-seed-daily-cleanliness.sql)
 * was never applied to the Supabase database, which is why prod lacked it.
 *
 * Standalone: `npx tsx prisma/seedWorkflows.ts`
 */
import { PrismaClient } from "@prisma/client";

const ITEMS = [
  "Window & Glass",
  "Air-Conditioner",
  "Chair & Cushion",
  "Lights & Lamps",
  "Bedsheet & Pillows",
  "Toilet & Shower",
  "Soap & Shampoo",
  "Sink",
  "Towels",
  "Iron & Board",
  "Hangers",
  "Coffee & Supplies",
  "Telephone",
  "Television",
  "Microwave",
  "Fridge",
  "Drawers",
  "Floor",
];

export async function seedDailyCleanliness(prisma: PrismaClient) {
  const slug = "daily-cleanliness";
  const existing = await prisma.workflowDefinition.findUnique({ where: { slug } });
  if (existing) {
    console.log(`• Daily Cleanliness workflow already exists (id=${existing.id}). Skipping.`);
    return;
  }

  const definition = await prisma.workflowDefinition.create({
    data: {
      slug,
      name: "Daily Cleanliness Inspection",
      description:
        "Matrix check across rooms — 18 cleanliness items per room, three-state OK/Issue/NA, run daily by managers and inspectors.",
      shape: "MATRIX",
      rolesAllowed: JSON.stringify(["ADMIN", "MANAGER", "INSPECTOR"]),
    },
  });
  console.log(`✓ Created WorkflowDefinition: ${definition.id} (slug=${slug})`);

  await prisma.workflowItem.createMany({
    data: ITEMS.map((text, order) => ({ workflowId: definition.id, text, order })),
  });
  console.log(`✓ Created ${ITEMS.length} WorkflowItem rows`);
}

// Standalone run.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDailyCleanliness(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
