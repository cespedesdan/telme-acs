import { hashPassword, USER_ROLES, type UserRole } from "@telme/auth";
import { createPrismaClient } from "@telme/persistence";

import { loadLocalEnvironment } from "./config.js";
import { requireEnvironment } from "./infrastructure.service.js";

loadLocalEnvironment();

const email = requireEnvironment("TELME_ADMIN_EMAIL").toLowerCase();
const displayName = requireEnvironment("TELME_ADMIN_DISPLAY_NAME");
const password = requireEnvironment("TELME_ADMIN_PASSWORD");
const roleValue = process.env.TELME_ADMIN_ROLE ?? "ADMIN";
if (!USER_ROLES.includes(roleValue as UserRole)) {
  throw new Error(`TELME_ADMIN_ROLE must be one of ${USER_ROLES.join(", ")}.`);
}

const database = createPrismaClient({
  connectionString: requireEnvironment("DATABASE_URL"),
});
try {
  const passwordHash = await hashPassword(password);
  const user = await database.user.upsert({
    where: { email },
    create: {
      email,
      displayName,
      passwordHash,
      role: roleValue as UserRole,
    },
    update: {
      displayName,
      passwordHash,
      role: roleValue as UserRole,
      isActive: true,
    },
  });
  console.log(`Administrative user ready: ${user.email}`);
} finally {
  await database.$disconnect();
}
