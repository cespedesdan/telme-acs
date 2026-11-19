import {
  createDeviceCapabilities,
  type NormalizedDevice,
} from "@telme/device-model";

import { readBooleanParameter } from "../parameters.js";
import type { DeviceAdapter, DeviceAdapterContext } from "../registry.js";
import {
  buildTr098PasswordWrite,
  readIpv6Parameter,
  readPrivateString,
  readTr098Wifi,
} from "../tr098-device.js";

const HARDWARE = "tmp_hardware2.0";
const SOFTWARE = "GL_g1.10_100XNT0b14";
const IPV4_PATH =
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress";
const IPV6_PATH =
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_VIVO_COM_BR_ExternalIPv6Address";
const WLAN_ROOT = "InternetGatewayDevice.LANDevice.1.WLANConfiguration";
const WIFI_PATHS = {
  "2.4ghz": `${WLAN_ROOT}.1`,
  "5ghz": `${WLAN_ROOT}.5`,
} as const;
const WIFI_NETWORKS = [
  ["2.4ghz", WIFI_PATHS["2.4ghz"]],
  ["5ghz", WIFI_PATHS["5ghz"]],
  ["5ghz", `${WLAN_ROOT}.6`],
] as const;
const UNIQUE_SSID_PATH =
  "InternetGatewayDevice.X_TELEFONICA_COM_Roaming.UniqueSSID";

export const gpt2742gx4x5Capabilities = createDeviceCapabilities({
  identity: "supported",
  firmware: "read-only",
  ipv4: "read-only",
  ipv6: "read-only",
  wifi24: "supported",
  wifi5: "supported",
  wifiPasswordWrite: "experimental",
});

export const gpt2742gx4x5Adapter: DeviceAdapter = {
  id: "mitrastar-gpt2742gx4x5-v6-hw2-b14-partial",
  capabilities: gpt2742gx4x5Capabilities,
  parameterPaths: [
    IPV4_PATH,
    IPV6_PATH,
    ...WIFI_NETWORKS.flatMap(([, root]) => [
      `${root}.SSID`,
      `${root}.Enable`,
      `${root}.Status`,
      `${root}.Name`,
      `${root}.Standard`,
      `${root}.Channel`,
      `${root}.TotalAssociations`,
      `${root}.X_TELEFONICA-ES_FrecuencyBand`,
    ]),
    UNIQUE_SSID_PATH,
  ],
  matches: (identity) =>
    (identity.model === "GPT-2742GX4X5v6" ||
      identity.productClass === "GPT-2742GX4X5v6") &&
    identity.hardwareVersion === HARDWARE &&
    identity.softwareVersion === SOFTWARE,
  normalize: normalizeGpt2742gx4x5,
  readWifi: (context) =>
    WIFI_NETWORKS.map(([band, root]) => readTr098Wifi(context, band, root)),
  readWifiUnifiedSsid: (context) =>
    readBooleanParameter(context.parameters, UNIQUE_SSID_PATH),
  buildWifiPasswordWrite: (band, password) =>
    buildTr098PasswordWrite(WIFI_PATHS[band], password),
};

function normalizeGpt2742gx4x5(
  context: DeviceAdapterContext,
): NormalizedDevice {
  const ipv4 = readPrivateString(context, IPV4_PATH);
  const ipv6 = readIpv6Parameter(context, IPV6_PATH);
  return {
    id: context.id,
    ...context.identity,
    dataModel: "tr098",
    capabilities: gpt2742gx4x5Capabilities,
    onlineState: context.onlineState ?? "unknown",
    ...(context.lastInformAt === undefined
      ? {}
      : { lastInformAt: context.lastInformAt }),
    wan: {
      status: "unknown",
      ...(ipv4 === undefined ? {} : { ipv4 }),
      ...(ipv6 === undefined
        ? {}
        : { ipv6: [ipv6], ipv6Enabled: true as const }),
    },
  };
}
