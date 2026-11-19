export interface HealthResponse {
  status: "ok";
  service: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: true;
  permissions: readonly Permission[];
}

export interface SessionResponse {
  user: SessionUser;
}

export interface DeviceSummaryResponse {
  id: string;
  serialNumber: string;
  manufacturer?: string;
  model?: string;
  productClass?: string;
  hardwareVersion?: string;
  softwareVersion?: string;
  lastInformAt?: string;
  onlineState: DeviceOnlineState;
  capabilities: DeviceCapabilities;
  localLabel?: string;
  macAddress?: string;
  pppoeUsername?: string;
}

export interface DeviceInventoryResponse {
  items: readonly DeviceSummaryResponse[];
  total: number;
  page: number;
  pageSize: number;
  metrics: {
    total: number;
    online: number;
    stale: number;
    offline: number;
    unknown: number;
  };
  syncState: "current" | "unavailable";
  lastSyncedAt?: string;
}

export interface ServiceReadinessResponse {
  status: "ok" | "degraded";
  checks: { database: "ok" | "unavailable"; genieAcs: "ok" | "unavailable" };
}

export interface WifiNetworkResponse {
  id: string;
  band: "2.4ghz" | "5ghz" | "unknown";
  ssid?: string;
  enabled?: boolean;
  status: "up" | "down" | "unknown";
  name?: string;
  standard?: string;
  channel?: number;
  connectedDeviceCount?: number;
}

export interface WifiClientResponse {
  id: string;
  name?: string;
  macAddress?: string;
  ipv4?: string;
  networkId?: string;
  active?: boolean;
}

export interface DeviceDetailResponse extends DeviceSummaryResponse {
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
  wifiUnifiedSsid?: boolean;
  wifi: readonly WifiNetworkResponse[];
  wifiClients?: readonly WifiClientResponse[];
}

export interface DeviceOperationResponse {
  id: string;
  type: string;
  state: DeviceOperationState;
  correlationId: string;
  genieAcsTaskId?: string;
  errorCode?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DeviceAuditResponse {
  id: string;
  action: string;
  result: string;
  correlationId: string;
  actor?: string;
  createdAt: string;
}

export interface OperationAcceptedResponse {
  operationId: string;
  state: DeviceOperationState;
  correlationId: string;
  genieAcsTaskId?: string;
}
import type { Permission, UserRole } from "@telme/auth";
import type {
  DeviceCapabilities,
  DeviceOnlineState,
  DeviceOperationState,
} from "@telme/device-model";
