import { cp, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

export function readWebRuntime(environment) {
  const value = environment.WEB_PORT ?? "3000";
  const port = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("WEB_PORT must be an integer between 1 and 65535");
  }
  const hostname = environment.WEB_HOST ?? "127.0.0.1";
  if (!hostname.trim()) throw new Error("WEB_HOST must not be empty");
  return { hostname, port };
}

export async function resolveStandalone(appDirectory) {
  const standalone = join(appDirectory, ".next", "standalone");
  for (const directory of [join(standalone, "apps", "web"), standalone]) {
    try {
      await access(join(directory, "server.js"));
      return directory;
    } catch {
      // Both standalone layouts are supported; never fall back to next start.
    }
  }
  throw new Error(
    "Standalone build missing. Run pnpm build before pnpm start.",
  );
}

export async function prepareStandalone(appDirectory) {
  const destination = await resolveStandalone(appDirectory);
  await mkdir(join(destination, ".next"), { recursive: true });
  await cp(
    join(appDirectory, ".next", "static"),
    join(destination, ".next", "static"),
    { recursive: true, force: true },
  );
  const publicDirectory = join(appDirectory, "public");
  let hasPublic = true;
  try {
    await access(publicDirectory);
  } catch {
    hasPublic = false;
  }
  if (hasPublic) {
    await cp(publicDirectory, join(destination, "public"), {
      recursive: true,
      force: true,
    });
  }
  return destination;
}
