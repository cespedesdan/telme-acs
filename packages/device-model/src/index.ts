export type CapabilityState =
  "supported" | "unsupported" | "unknown" | "read-only" | "experimental";

export const DEVICE_CAPABILITIES = [
  "identity",
  "firmware",
  "wan",
  "pppoeUsername",
  "ipv4",
  "ipv6",
  "opticalRx",
  "opticalTx",
  "wifi24",
  "wifi5",
  "wifiWrite",
  "wifiPasswordWrite",
  "connectedClients",
  "reboot",
  "factoryReset",
  "firmwareUpgrade",
] as const;

export type DeviceCapability = (typeof DEVICE_CAPABILITIES)[number];
export type DeviceCapabilities = Readonly<
  Record<DeviceCapability, CapabilityState>
>;

/** Creates a complete capability set; omitted entries remain explicitly unknown. */
export function createDeviceCapabilities(
  overrides: Partial<Record<DeviceCapability, CapabilityState>> = {},
): DeviceCapabilities {
  return Object.freeze(
    Object.fromEntries(
      DEVICE_CAPABILITIES.map((capability) => [
        capability,
        overrides[capability] ?? "unknown",
      ]),
    ),
  ) as DeviceCapabilities;
}

/** `queued` means pending; only `executed` confirms that GenieACS ran it. */
export type DeviceOperationState =
  "executed" | "queued" | "failed" | "timed_out";

export type DeviceBindingMethod = "pppoe" | "mac" | "manual" | "import";
export type DeviceOnlineState = "online" | "stale" | "offline" | "unknown";
export type DeviceDataModel = "tr098" | "tr181" | "hybrid" | "unknown";

export function classifyDeviceContact(
  lastInformAt: Date | undefined,
  now = new Date(),
  onlineWindowMs = 300_000,
  offlineWindowMs = 86_400_000,
): DeviceOnlineState {
  if (!lastInformAt || !Number.isFinite(lastInformAt.valueOf()))
    return "unknown";
  const age = Math.max(0, now.valueOf() - lastInformAt.valueOf());
  return age <= onlineWindowMs
    ? "online"
    : age <= offlineWindowMs
      ? "stale"
      : "offline";
}

export interface DeviceIdentity {
  serialNumber: string;
  manufacturer?: string;
  model?: string;
  productClass?: string;
  oui?: string;
  hardwareVersion?: string;
  softwareVersion?: string;
}

export interface NormalizedDevice extends DeviceIdentity {
  id: string;
  dataModel: DeviceDataModel;
  capabilities: DeviceCapabilities;
  lastInformAt?: Date;
  onlineState: DeviceOnlineState;
  wan?: {
    status?: "connected" | "disconnected" | "unknown";
    ipv4?: string;
    ipv6?: string[];
    ipv6Enabled?: boolean;
    pppoeUsername?: string;
  };
  optical?: {
    rxDbm?: number;
    txDbm?: number;
  };
}
