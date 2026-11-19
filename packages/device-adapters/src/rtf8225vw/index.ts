import {
  createDeviceCapabilities,
  type NormalizedDevice,
} from "@telme/device-model";

import { readBooleanParameter, readStringParameter } from "../parameters.js";
import type {
  DeviceAdapter,
  DeviceAdapterContext,
  NormalizedWifiNetwork,
} from "../registry.js";
import {
  buildTr098PasswordWrite,
  buildTr098SsidWrite,
  normalizeWanStatus,
  readIpv6Parameter,
  readPrivateString,
  readTr098Wifi,
} from "../tr098-device.js";

const WLAN_ROOT = "InternetGatewayDevice.LANDevice.1.WLANConfiguration";
const WIFI_PATHS = {
  "2.4ghz": `${WLAN_ROOT}.1`,
  "5ghz": `${WLAN_ROOT}.5`,
} as const;
const REV3_WIFI = [
  ["2.4ghz", `${WLAN_ROOT}.1`],
  ["2.4ghz", `${WLAN_ROOT}.2`],
  ["2.4ghz", `${WLAN_ROOT}.3`],
  ["2.4ghz", `${WLAN_ROOT}.4`],
  ["5ghz", `${WLAN_ROOT}.5`],
  ["5ghz", `${WLAN_ROOT}.6`],
] as const;
const REV4_WIFI = [1, 4, 5].map((instance) => `${WLAN_ROOT}.${instance}`);
const UNIQUE_SSID_PATH =
  "InternetGatewayDevice.X_TELEFONICA_COM_Roaming.UniqueSSID";
const WAN_PATH =
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1";
const IPV6_ADDRESS_PATH = `${WAN_PATH}.X_VIVO_COM_BR_ExternalIPv6Address`;
const REV3 = "REV3";
const REV3_SOFTWARE = "BR_SG_g1.4_RTF_TEF004_V2.9";
const REV4 = "REV4";
const REV4_SOFTWARE = "CO_g1.13_RTF_TEF004_V2.39";

export const rtf8225vwCapabilities = createDeviceCapabilities({
  identity: "supported",
  firmware: "read-only",
  wan: "read-only",
  pppoeUsername: "read-only",
  ipv4: "read-only",
  ipv6: "read-only",
  wifi24: "supported",
  wifi5: "supported",
  wifiWrite: "experimental",
  wifiPasswordWrite: "experimental",
  reboot: "experimental",
});

export const rtf8225vwAdapter: DeviceAdapter = {
  id: "askey-rtf8225vw-rev3-v2-9",
  capabilities: rtf8225vwCapabilities,
  parameterPaths: [
    ...REV3_WIFI.flatMap(([, root]) => [
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
    `${WAN_PATH}.ConnectionStatus`,
    `${WAN_PATH}.ExternalIPAddress`,
    `${WAN_PATH}.Username`,
    IPV6_ADDRESS_PATH,
  ],
  matches: (identity) =>
    (identity.model === "RTF8225VW" || identity.productClass === "RTF8225VW") &&
    identity.hardwareVersion === REV3 &&
    identity.softwareVersion === REV3_SOFTWARE,
  normalize: normalizeRtf8225vw,
  readWifi: readRtf8225vwWifi,
  readWifiUnifiedSsid: (context) =>
    readBooleanParameter(context.parameters, UNIQUE_SSID_PATH),
  buildWifiSsidWrite: (band, ssid) =>
    buildTr098SsidWrite(WIFI_PATHS[band], ssid),
  buildWifiPasswordWrite: (band, password) =>
    buildTr098PasswordWrite(WIFI_PATHS[band], password),
};

export const rtf8225vwSvCapabilities = createDeviceCapabilities({
  identity: "supported",
  firmware: "read-only",
  ipv4: "read-only",
});

export const rtf8225vwSvAdapter: DeviceAdapter = {
  id: "askey-rtf8225vw-sv-rev4-v2-39-partial",
  capabilities: rtf8225vwSvCapabilities,
  parameterPaths: [
    ...REV4_WIFI.flatMap((root) => [
      `${root}.SSID`,
      `${root}.Enable`,
      `${root}.Status`,
      `${root}.Name`,
      `${root}.Standard`,
      `${root}.Channel`,
      `${root}.TotalAssociations`,
    ]),
    `${WAN_PATH}.ExternalIPAddress`,
  ],
  matches: (identity) =>
    (identity.model === "RTF8225VW-SV" ||
      identity.productClass === "RTF8225VW-SV") &&
    identity.hardwareVersion === REV4 &&
    identity.softwareVersion === REV4_SOFTWARE,
  normalize: (context) => ({
    id: context.id,
    ...context.identity,
    dataModel: "tr098",
    capabilities: rtf8225vwSvCapabilities,
    onlineState: context.onlineState ?? "unknown",
    ...(context.lastInformAt === undefined
      ? {}
      : { lastInformAt: context.lastInformAt }),
    wan: {
      status: "unknown",
      ...optionalIpv4(context),
    },
  }),
  readWifi: (context) =>
    REV4_WIFI.map((root) => readTr098Wifi(context, "unknown", root)),
};

function normalizeRtf8225vw(context: DeviceAdapterContext): NormalizedDevice {
  const connectionStatus = readStringParameter(
    context.parameters,
    `${WAN_PATH}.ConnectionStatus`,
  );
  const pppoeUsername = readPrivateString(context, `${WAN_PATH}.Username`);
  const ipv6 = readIpv6Parameter(context, IPV6_ADDRESS_PATH);
  return {
    id: context.id,
    ...context.identity,
    dataModel: "tr098",
    capabilities: rtf8225vwCapabilities,
    onlineState: context.onlineState ?? "unknown",
    ...(context.lastInformAt === undefined
      ? {}
      : { lastInformAt: context.lastInformAt }),
    wan: {
      status: normalizeWanStatus(connectionStatus),
      ...optionalIpv4(context),
      ...(ipv6 === undefined
        ? {}
        : { ipv6: [ipv6], ipv6Enabled: true as const }),
      ...(pppoeUsername === undefined ? {} : { pppoeUsername }),
    },
  };
}

function readRtf8225vwWifi(
  context: DeviceAdapterContext,
): readonly NormalizedWifiNetwork[] {
  return REV3_WIFI.map(([band, root]) => readTr098Wifi(context, band, root));
}

function optionalIpv4(
  context: DeviceAdapterContext,
): { ipv4: string } | Record<string, never> {
  const ipv4 = readPrivateString(context, `${WAN_PATH}.ExternalIPAddress`);
  return ipv4 === undefined ? {} : { ipv4 };
}
