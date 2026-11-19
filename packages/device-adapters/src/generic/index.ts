import type { DeviceDataModel } from "@telme/device-model";

import type { DeviceParameterTree } from "../parameters.js";
import { hasTr098Root } from "./tr098/index.js";
import { hasTr181Root } from "./tr181/index.js";

export function detectDataModel(
  parameters: DeviceParameterTree,
): DeviceDataModel {
  const tr098 = hasTr098Root(parameters);
  const tr181 = hasTr181Root(parameters);
  if (tr098 && tr181) return "hybrid";
  if (tr098) return "tr098";
  if (tr181) return "tr181";
  return "unknown";
}

export { TR098_ROOT, hasTr098Root } from "./tr098/index.js";
export { TR181_ROOT, hasTr181Root } from "./tr181/index.js";
