import {
  createDeviceCapabilities,
  type DeviceCapabilities,
  type DeviceIdentity,
  type DeviceOnlineState,
  type NormalizedDevice,
} from "@telme/device-model";

import { detectDataModel } from "./generic/index.js";
import { gpt2742gx4x5Adapter } from "./gpt2742gx4x5/index.js";
import { hg8145v5Adapter } from "./huawei/hg8145v5/index.js";
import { hg8145v5V2Adapter } from "./huawei/hg8145v5-v2/index.js";
import type { DeviceParameterTree } from "./parameters.js";
import { rtf8225vwAdapter, rtf8225vwSvAdapter } from "./rtf8225vw/index.js";

export type WifiBand = "2.4ghz" | "5ghz";
export type NormalizedWifiBand = WifiBand | "unknown";

export interface NormalizedWifiNetwork {
  id: string;
  band: NormalizedWifiBand;
  ssid?: string;
  enabled?: boolean;
  status: "up" | "down" | "unknown";
  name?: string;
  standard?: string;
  channel?: number;
  connectedDeviceCount?: number;
}

export interface NormalizedWifiClient {
  id: string;
  name?: string;
  macAddress?: string;
  ipv4?: string;
  networkId?: string;
  active?: boolean;
}

export type DeviceParameterWrite = readonly [
  path: string,
  value: string | number | boolean,
  xsdType?: string,
];

export interface DeviceAdapterContext {
  id: string;
  identity: DeviceIdentity;
  parameters: DeviceParameterTree;
  onlineState?: DeviceOnlineState;
  lastInformAt?: Date;
}

export interface DeviceAdapter {
  readonly id: string;
  readonly capabilities: DeviceCapabilities;
  readonly parameterPaths?: readonly string[];
  matches(identity: DeviceIdentity): boolean;
  normalize(context: DeviceAdapterContext): NormalizedDevice;
  readWifi?(context: DeviceAdapterContext): readonly NormalizedWifiNetwork[];
  readWifiUnifiedSsid?(context: DeviceAdapterContext): boolean | undefined;
  readWifiClients?(
    context: DeviceAdapterContext,
  ): readonly NormalizedWifiClient[];
  buildWifiSsidWrite?(
    band: WifiBand,
    ssid: string,
  ): readonly DeviceParameterWrite[];
  buildWifiPasswordWrite?(
    band: WifiBand,
    password: string,
  ): readonly DeviceParameterWrite[];
}

export const unknownCapabilities = createDeviceCapabilities();

export const genericAdapter: DeviceAdapter = {
  id: "generic",
  capabilities: unknownCapabilities,
  matches: () => true,
  normalize: ({ id, identity, parameters, onlineState, lastInformAt }) => ({
    id,
    ...identity,
    dataModel: detectDataModel(parameters),
    capabilities: unknownCapabilities,
    onlineState: onlineState ?? "unknown",
    ...(lastInformAt === undefined ? {} : { lastInformAt }),
  }),
};

export class AdapterRegistry {
  public constructor(
    private readonly adapters: readonly DeviceAdapter[] = [],
  ) {}

  public resolve(identity: DeviceIdentity): DeviceAdapter {
    return (
      this.adapters.find((adapter) => adapter.matches(identity)) ??
      genericAdapter
    );
  }

  public get parameterPaths(): readonly string[] {
    return [
      ...new Set(
        this.adapters.flatMap((adapter) => adapter.parameterPaths ?? []),
      ),
    ];
  }
}

export const adapterRegistry = new AdapterRegistry([
  hg8145v5Adapter,
  hg8145v5V2Adapter,
  rtf8225vwAdapter,
  rtf8225vwSvAdapter,
  gpt2742gx4x5Adapter,
]);

