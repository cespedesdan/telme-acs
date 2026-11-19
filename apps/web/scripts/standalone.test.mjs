import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareStandalone,
  readWebRuntime,
  resolveStandalone,
} from "./standalone.mjs";

const temporaryDirectories = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("standalone deployment", () => {
  it("binds loopback by default and ignores system PORT and HOSTNAME", () => {
    expect(readWebRuntime({ PORT: "8080", HOSTNAME: "public-host" })).toEqual({
      hostname: "127.0.0.1",
      port: 3000,
    });
    expect(
      readWebRuntime({ WEB_HOST: "127.0.0.1", WEB_PORT: "3005" }).port,
    ).toBe(3005);
  });

  it("rejects invalid web ports and an empty bind address", () => {
    for (const value of ["", "0", "65536", "3000x", "1.5"]) {
      expect(() => readWebRuntime({ WEB_PORT: value })).toThrow(/WEB_PORT/);
    }
    expect(() => readWebRuntime({ WEB_HOST: "" })).toThrow(/WEB_HOST/);
  });

  it("copies static and public assets into the monorepo standalone layout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telme-standalone-test-"));
    temporaryDirectories.push(directory);
    const destination = join(directory, ".next", "standalone", "apps", "web");
    await mkdir(destination, { recursive: true });
    await mkdir(join(directory, ".next", "static"), { recursive: true });
    await mkdir(join(directory, "public"), { recursive: true });
    await writeFile(join(destination, "server.js"), "// synthetic server");
    await writeFile(
      join(directory, ".next", "static", "chunk.js"),
      "synthetic chunk",
    );
    await writeFile(join(directory, "public", "asset.txt"), "synthetic asset");
    await writeFile(join(directory, ".env"), "SECRET=must-not-be-copied");
    expect(await prepareStandalone(directory)).toBe(destination);
    expect(
      await readFile(join(destination, ".next", "static", "chunk.js"), "utf8"),
    ).toBe("synthetic chunk");
    expect(
      await readFile(join(destination, "public", "asset.txt"), "utf8"),
    ).toBe("synthetic asset");
    await expect(readFile(join(destination, ".env"))).rejects.toThrow();
  });

  it("supports a flat layout with no public directory and rejects missing builds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telme-standalone-test-"));
    temporaryDirectories.push(directory);
    await expect(resolveStandalone(directory)).rejects.toThrow(/pnpm build/);
    const destination = join(directory, ".next", "standalone");
    await mkdir(join(directory, ".next", "static"), { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "server.js"), "// synthetic server");
    await prepareStandalone(directory);
    expect(await resolveStandalone(directory)).toBe(destination);
  });
});
