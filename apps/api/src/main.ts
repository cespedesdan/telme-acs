import "reflect-metadata";

import { createApp } from "./bootstrap.js";
import { loadLocalEnvironment, readPort } from "./config.js";

loadLocalEnvironment();

const app = await createApp();
app.enableShutdownHooks();

await app.listen(readPort(), process.env.API_HOST ?? "127.0.0.1");
