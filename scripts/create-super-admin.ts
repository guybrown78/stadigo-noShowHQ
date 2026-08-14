import { Role } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function usage(): never {
  console.error(
    "Usage: npm run create-super-admin -- --email you@example.com --password 'secret' --first-name Jane --last-name Doe",
  );
  console.error(
    "   or: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run create-super-admin -- --from-env",
  );
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const fromEnv = process.argv.includes("--from-env");

  const emailRaw = fromEnv
    ? process.env.SUPER_ADMIN_EMAIL
    : getArg("email");
  const password = fromEnv
    ? process.env.SUPER_ADMIN_PASSWORD
    : getArg("password");
  const firstName =
    (fromEnv ? process.env.SUPER_ADMIN_FIRST_NAME : getArg("first-name")) ??
    "Super";
  const lastName =
    (fromEnv ? process.env.SUPER_ADMIN_LAST_NAME : getArg("last-name")) ??
    "Admin";

  if (fromEnv && (!emailRaw || !password)) {
    console.log(
      "Skipping SUPER_ADMIN seed (set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create one).",
    );
    return;
  }

  if (!emailRaw || !password) {
    usage();
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const email = emailRaw.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (fromEnv) {
      console.log(`SUPER_ADMIN ${email} already exists; skipping.`);
      return;
    }
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      passwordHash,
      role: Role.SUPER_ADMIN,
      tenantId: null,
    },
  });

  console.log(`Created SUPER_ADMIN ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
