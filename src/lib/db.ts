import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function isCurrentClient(client: PrismaClient | undefined): client is PrismaClient {
  return Boolean(client && "eventImport" in client && client.eventImport);
}

const existing = globalForPrisma.prisma;
if (existing && !isCurrentClient(existing)) {
  void existing.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const prisma = isCurrentClient(globalForPrisma.prisma)
  ? globalForPrisma.prisma
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
