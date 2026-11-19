import { fileURLToPath, URL } from "node:url";
import { prepareStandalone } from "./standalone.mjs";

await prepareStandalone(fileURLToPath(new URL("../", import.meta.url)));
