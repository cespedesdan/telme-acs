import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { join } from "node:path";
import { readWebRuntime, resolveStandalone } from "./standalone.mjs";

const rootEnvironment = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnvironment)) loadEnvFile(rootEnvironment);

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const directory = await resolveStandalone(appDirectory);
const { hostname, port } = readWebRuntime(process.env);
// Ignore system HOSTNAME (often the machine name) and bind only WEB_HOST.
process.env.HOSTNAME = hostname;
process.env.PORT = String(port);
await import(pathToFileURL(join(directory, "server.js")).href);
