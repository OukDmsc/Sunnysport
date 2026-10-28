import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fields = [
    { name: "Pitch A", surface: "FIFA-certified artificial turf", hourlyRateCents: 2500, description: "7-a-side, floodlights included" },
    { name: "Pitch B", surface: "Artificial turf", hourlyRateCents: 2000, description: "5-a-side, ideal for quick games" },
    { name: "Pitch C", surface: "Natural grass", hourlyRateCents: 3000, description: "11-a-side full-size pitch" },
  ];

  for (const field of fields) {
    await prisma.field.upsert({
      where: { name: field.name },
      update: {},
      create: field,
    });
  }
  console.log(`Seeded ${fields.length} football fields.`);
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
