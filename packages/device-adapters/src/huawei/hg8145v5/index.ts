import {
  createDeviceCapabilities,
  type NormalizedDevice,
} from "@telme/device-model";

import {
  readBooleanParameter,
  readNumberParameter,
  readStringParameter,
} from "../../parameters.js";
import type {
  DeviceAdapter,
  DeviceAdapterContext,
  NormalizedWifiNetwork,
} from "../../registry.js";
import {
  buildTr098PasswordWrite,
  buildTr098SsidWrite,
  normalizeWanStatus,
  readIpv6Parameter,
  readPrivateString,
  readTr098Wifi,
} from "../../tr098-device.js";

const VERIFIED_HARDWARE = "15AD.A";
const VERIFIED_SOFTWARE = "V5R020C00S270";

const WIFI_PATHS = {
  "2.4ghz": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1",
  "5ghz": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4",
} as const;

const WAN_PATH =
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1";
const IPV6_ENABLED_PATH = `${WAN_PATH}.X_HW_IPv6Enable`;
const IPV6_ADDRESS_PATH = `${WAN_PATH}.X_HW_IPv6.IPv6Address.1.IPAddress`;
const OPTICAL_PATH = "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig";

export const hg8145v5Capabilities = createDeviceCapabilities({
  identity: "supported",
  firmware: "read-only",
  wan: "read-only",
  pppoeUsername: "read-only",
  ipv4: "read-only",
  ipv6: "read-only",
  opticalRx: "read-only",
  opticalTx: "read-only",
  wifi24: "supported",
  wifi5: "supported",
  wifiWrite: "supported",
  wifiPasswordWrite: "experimental",
  reboot: "supported",
});

export const hg8145v5Adapter: DeviceAdapter = {
  id: "huawei-hg8145v5-15ad-a-s270",
  capabilities: hg8145v5Capabilities,
  parameterPaths: [
    ...Object.values(WIFI_PATHS).flatMap((root) => [
      `${root}.SSID`,
      `${root}.Enable`,
      `${root}.Status`,
      `${root}.Standard`,
      `${root}.Channel`,
      `${root}.TotalAssociations`,
    ]),
    `${WAN_PATH}.ConnectionStatus`,
    `${WAN_PATH}.ExternalIPAddress`,
    `${WAN_PATH}.Username`,
    IPV6_ENABLED_PATH,
    IPV6_ADDRESS_PATH,
    `${OPTICAL_PATH}.RXPower`,
    `${OPTICAL_PATH}.TXPower`,
  ],
  matches: (identity) =>
    (identity.model === "HG8145V5" || identity.productClass === "HG8145V5") &&
    identity.hardwareVersion === VERIFIED_HARDWARE &&
    identity.softwareVersion === VERIFIED_SOFTWARE,
  normalize: normalizeHg8145v5,
  readWifi: readHg8145v5Wifi,
  buildWifiSsidWrite: buildHg8145v5SsidWrite,
  buildWifiPasswordWrite: (band, password) =>
    buildTr098PasswordWrite(WIFI_PATHS[band], password),
};

function normalizeHg8145v5(context: DeviceAdapterContext): NormalizedDevice {
  const connectionStatus = readStringParameter(
    context.parameters,
    `${WAN_PATH}.ConnectionStatus`,
  );
  const ipv4 = readPrivateString(context, `${WAN_PATH}.ExternalIPAddress`);
  const pppoeUsername = readPrivateString(context, `${WAN_PATH}.Username`);
  const ipv6Enabled = readBooleanParameter(
    context.parameters,
    IPV6_ENABLED_PATH,
  );
  const ipv6 = readIpv6Parameter(context, IPV6_ADDRESS_PATH);
  const rxDbm = readNumberParameter(
    context.parameters,
    `${OPTICAL_PATH}.RXPower`,
  );
  const txDbm = readNumberParameter(
    context.parameters,
    `${OPTICAL_PATH}.TXPower`,
  );

  return {
    id: context.id,
    ...context.identity,
    dataModel: "tr098",
    capabilities: hg8145v5Capabilities,
    onlineState: context.onlineState ?? "unknown",
    ...(context.lastInformAt === undefined
      ? {}
      : { lastInformAt: context.lastInformAt }),
    wan: {
      status: normalizeWanStatus(connectionStatus),
      ...(ipv4 === undefined ? {} : { ipv4 }),
      ...(ipv6 === undefined ? {} : { ipv6: [ipv6] }),
      ...(ipv6Enabled === undefined ? {} : { ipv6Enabled }),
      ...(pppoeUsername === undefined ? {} : { pppoeUsername }),
    },
    ...(rxDbm === undefined && txDbm === undefined
      ? {}
      : {
          optical: {
            ...(rxDbm === undefined ? {} : { rxDbm }),
            ...(txDbm === undefined ? {} : { txDbm }),
          },
        }),
  };
}

function readHg8145v5Wifi(
  context: DeviceAdapterContext,
): readonly NormalizedWifiNetwork[] {
  return (["2.4ghz", "5ghz"] as const).map((band) =>
    readTr098Wifi(context, band, WIFI_PATHS[band]),
  );
}

function buildHg8145v5SsidWrite(band: keyof typeof WIFI_PATHS, ssid: string) {
  return buildTr098SsidWrite(WIFI_PATHS[band], ssid);
}
