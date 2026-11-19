import type { DeviceParameterTree } from "../../parameters.js";

export const TR181_ROOT = "Device.";

export function hasTr181Root(parameters: DeviceParameterTree): boolean {
  return Object.keys(parameters).some(
    (path) => path === TR181_ROOT || path.startsWith(TR181_ROOT),
  );
}
