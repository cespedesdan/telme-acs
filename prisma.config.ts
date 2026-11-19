import "dotenv/config";
import { defineConfig } from "prisma/config";

const schemaOnlyUrl =
  "postgresql://schema_only:schema_only@invalid.invalid:5432/schema_only";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? schemaOnlyUrl,
  },
});
