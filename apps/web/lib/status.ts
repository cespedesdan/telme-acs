import type {
  DeviceCapabilities,
  DeviceOnlineState,
  DeviceOperationState,
} from "@telme/device-model";

export type SupportLevel = "verified" | "partial" | "unknown";

/** Summarizes adapter-declared capabilities; it never upgrades `unknown`. */
export function supportLevel(capabilities: DeviceCapabilities): SupportLevel {
  if (
    capabilities.wifiWrite === "supported" &&
    capabilities.reboot === "supported"
  )
    return "verified";
  const known = Object.values(capabilities).some(
    (state) => state !== "unknown" && state !== "unsupported",
  );
  return known ? "partial" : "unknown";
}

export function supportLevelLabel(level: SupportLevel): string {
  if (level === "verified") return "Verificado";
  if (level === "partial") return "Parcial";
  return "Não verificado";
}

export type InventoryFilter = "all" | "online" | "attention" | "offline";

export interface InventoryMetrics {
  total: number;
  online: number;
  attention: number;
  offline: number;
  availability: number;
}

export function onlineStateLabel(state: DeviceOnlineState): string {
  if (state === "online") return "Online";
  if (state === "stale") return "Contato atrasado";
  if (state === "offline") return "Offline";
  return "Desconhecido";
}

export function operationStateLabel(state: DeviceOperationState): string {
  if (state === "executed") return "Aplicada";
  if (state === "queued") return "Aguardando contato";
  if (state === "failed") return "Falhou";
  return "Expirada";
}

export function inventoryMetrics(
  states: readonly DeviceOnlineState[],
): InventoryMetrics {
  const online = states.filter((state) => state === "online").length;
  const offline = states.filter((state) => state === "offline").length;
  const attention = states.length - online - offline;
  return {
    total: states.length,
    online,
    attention,
    offline,
    availability:
      states.length === 0 ? 0 : Math.round((online / states.length) * 100),
  };
}

export function matchesInventoryFilter(
  state: DeviceOnlineState,
  filter: InventoryFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return state === "stale" || state === "unknown";
  return state === filter;
}
