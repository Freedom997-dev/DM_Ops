import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES } from "../src/lib/rbac/defaults";
import { ROLE_KEYS } from "../src/lib/roles";

const prisma = new PrismaClient();

const CHECKLIST: { section: string; questions: string[] }[] = [
  {
    section: "Heating & Cooling System",
    questions: [
      "Unit Casing / Clean / Tight",
      "Filter Condition",
      "Blower Fan / Operational / Noisy",
      "Knobs Missing",
      "Instructional Label / Plate / Legible / Missing",
      "Selector Switch / Operational / Missing",
      "Exterior / Interior / Grills / Loose / Vibrating",
      "Condensation Tray & Grill Clear",
      "Electrical Connections & Appliance Plugs",
      "Radiator Element / Clean / Clear",
    ],
  },
  {
    section: "Guest Room",
    questions: [
      "Door Frame Condition",
      "Door Threshold Plate Fits Properly",
      "Door Lock & Hardware Condition",
      "Door Self-Closes and Locks (Interior Corridor Only)",
      "Secondary Locking Device Secure",
      "Door - Evacuation Plan / Emergency / Rate Card",
      "Weather / Sound Stripping Secure",
      "180 Door Viewer In Place",
      "Closet Area Shelf / Rod / Hooks / Hangers",
      "Folding or Louvered Doors & Tracks If Applicable",
      "Iron and Board (functional, leaks, stains, damage) if Applicable",
      "Luggage Rack Condition",
      "Carpet Condition (holes, tears, stains, burns)",
      "Carpet Cove Base",
      "Wall Condition (paint or wall vinyl peeling)",
      "Ceiling Condition",
      "Ceiling / Wall Electrical Fixtures / Shades",
      "Lighting Switches",
      "Electrical Receptacles & Covers",
      "TV & Remote Condition / Operational",
      "High Speed Internet Wired / Wireless Operation if Applicable",
      "Smoke Alarm Operational",
      "Sprinkler System / Head Unobstructed If Applicable",
      "Wall Décor Missing / Damaged",
      "Boxspring, Mattress, Bedframe Condition",
      "Turn Mattress",
      "Bedspreads Worn / Damaged",
      "Headboard(s) Condition / Secure",
      "Guest Room Mirror Condition / Secure",
      "Night Stand Condition",
      "Bed Lamps & Shades / Lighting Fixtures / Correct Wattage",
      "Dresser(s) Condition / Knobs Missing",
      "Desk Unit and Chair Condition",
      "Activity Tables and Chairs Condition",
      "Occasional Tables / Chairs Condition",
      "Sleeper Sofa (bedding, upholstery, springs) if Applicable",
      "Desk / Table Lamp & Shade Condition",
      "Clock / Radio Condition / Operational If Applicable",
      "Telephone Condition / Operational",
      "Telephone Dialing Instructions / Face Plate Legible and Accurate",
      "Drapery Condition",
      "Drapery Rod Condition / Operational",
      "Window Condition",
      "Window Locks / Tracks Operational",
      "Sliding Glass Door Condition / Operational if Applicable",
      "Sliding Glass Door Hardware Condition if Applicable",
      "Balcony / Balcony Railing Condition if Applicable",
    ],
  },
  {
    section: "Bathroom & Vanity Area(s)",
    questions: [
      "Door Frame Condition",
      "Door Finish Condition",
      "Door Hardware / Locking Device / Stopper",
      "Coffee Maker Condition / Operational if Applicable",
      "Robe Hook",
      "Towel Bars / Racks / Hooks",
      "Wall Condition (loose vinyl, mold, needs paint)",
      "Ceiling Condition",
      "Floor Condition (loose tiles, etc)",
      "Electrical Switches",
      "Electrical Receptacles - GFI Test Properly",
      "Lighting Fixtures",
      "Night Light Condition / Operational if Applicable",
      "Exhaust System Operational",
      "Facial Tissue Holder Condition",
      "Toilet Tissue Holder / Dispenser",
      "Handicap Equipment Secure if Applicable",
      "Hair Dryer Condition / Operational if Applicable",
      "Vanity Condition",
      "Mirror Condition (no desilvering)",
      "Sink(s) Condition",
      "Sink Faucet Condition / Operational / Hot Water Temperature",
      "Sink Stopper Condition / Operational",
      "Commode Tight to Floor or Properly Caulked / Screw Caps",
      "Commode Seat Condition / Secure",
      "Commode Tank / Plumbing Operational",
      "Bathtub / Shower Enclosure Condition",
      "Bathtub / Shower Safety Strips",
      "Bathtub / Shower Tile Condition",
      "Bathtub / Shower Grout / Caulk Condition",
      "Bathtub / Shower Hand Grip or Bars",
      "Shower Curtain Rod Condition / Secure",
      "Shower Curtain / Door Condition",
      "Bathtub / Shower Faucets Operational / Good Pressure",
      "Bathtub / Shower Head Condition",
      "Bathtub / Shower Drain Operational",
      "Jacuzzi Condition if Applicable",
      "Jacuzzi Tile & Grout Condition if Applicable",
    ],
  },
];

const SAMPLE_ROOMS = [
  { number: "101", name: "Standard Queen", floor: "1" },
  { number: "102", name: "Standard Queen", floor: "1" },
  { number: "103", name: "Standard King", floor: "1" },
  { number: "201", name: "Double Queen", floor: "2" },
  { number: "202", name: "King Suite", floor: "2" },
  { number: "203", name: "Accessible King", floor: "2" },
];

async function main() {
  // --- Roles + default permission grants ---
  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: r.key } });
    if (!existing) {
      await prisma.role.create({
        data: {
          key: r.key,
          label: r.label,
          description: r.description,
          isSystem: r.isSystem,
          permissions: { create: r.permissions.map((permission) => ({ permission })) },
        },
      });
    } else {
      await prisma.role.update({
        where: { key: r.key },
        data: { label: r.label, description: r.description, isSystem: r.isSystem },
      });
    }
  }
  const roleByKey = Object.fromEntries(
    (await prisma.role.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );
  console.log(`✓ Ensured ${DEFAULT_ROLES.length} roles`);

  // --- Migrate any existing users' single role string -> UserRole ---
  const usersToMigrate = await prisma.user.findMany({
    where: { roles: { none: {} } },
    select: { id: true, role: true },
  });
  for (const u of usersToMigrate) {
    const roleId = roleByKey[u.role] ?? roleByKey[ROLE_KEYS.INSPECTOR];
    if (roleId) {
      await prisma.userRole.create({ data: { userId: u.id, roleId } });
    }
  }
  if (usersToMigrate.length > 0) {
    console.log(`✓ Migrated ${usersToMigrate.length} existing user(s) to RBAC roles`);
  }

  // --- Admin user (assigned Super Admin) ---
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@divyamotel.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME || "Motel Admin";
  const superId = roleByKey[ROLE_KEYS.SUPER_ADMIN];

  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        roles: superId ? { create: [{ roleId: superId }] } : undefined,
      },
    });
    console.log(`✓ Created admin: ${email} / ${password}`);
  } else if (superId) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existingAdmin.id, roleId: superId } },
      create: { userId: existingAdmin.id, roleId: superId },
      update: {},
    });
    console.log(`• Admin already exists: ${email}`);
  }

  // --- Checklist (only if empty) ---
  const sectionCount = await prisma.section.count();
  if (sectionCount === 0) {
    let sOrder = 0;
    for (const block of CHECKLIST) {
      const section = await prisma.section.create({
        data: { name: block.section, order: sOrder++ },
      });
      await prisma.question.createMany({
        data: block.questions.map((text, i) => ({
          sectionId: section.id,
          text,
          order: i,
        })),
      });
    }
    const total = CHECKLIST.reduce((n, b) => n + b.questions.length, 0);
    console.log(`✓ Created ${CHECKLIST.length} sections, ${total} questions`);
  } else {
    console.log(`• Checklist already has ${sectionCount} sections`);
  }

  // --- Sample rooms (only if empty) ---
  const roomCount = await prisma.room.count();
  if (roomCount === 0) {
    await prisma.room.createMany({ data: SAMPLE_ROOMS });
    console.log(`✓ Created ${SAMPLE_ROOMS.length} sample rooms`);
  } else {
    console.log(`• ${roomCount} rooms already exist`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
