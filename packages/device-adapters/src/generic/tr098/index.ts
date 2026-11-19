import type { DeviceParameterTree } from "../../parameters.js";

export const TR098_ROOT = "InternetGatewayDevice.";

export function hasTr098Root(parameters: DeviceParameterTree): boolean {
  return Object.keys(parameters).some(
    (path) => path === TR098_ROOT || path.startsWith(TR098_ROOT),
  );
}
