import type { DeviceDataModel, DeviceIdentity } from "@telme/device-model";
import { classifyDeviceContact } from "@telme/device-model";

import { detectDataModel } from "./generic/index.js";
import { readParameter } from "./parameters.js";
import type { DeviceParameterTree } from "./parameters.js";
import { adapterRegistry } from "./registry.js";
import type { AdapterRegistry, DeviceAdapter } from "./registry.js";
import type { DeviceAdapterContext } from "./registry.js";

export type FixtureSource = "sanitized-capture" | "synthetic-test";

/** A capture that was sanitized before being committed, or explicit test data. */
export interface SanitizedParameterTreeFixture {
  schemaVersion: 1;
  source: FixtureSource;
  capturedAt: string;
  identity: DeviceIdentity;
  parameters: DeviceParameterTree;
}

export interface DiscoveryResult {
  adapterId: string;
  dataModel: DeviceDataModel;
  capabilities: DeviceAdapter["capabilities"];
  observedParameterPaths: readonly string[];
}

export type ParameterValueKind =
  "string" | "number" | "boolean" | "null" | "undefined" | "complex";

export interface ParameterInventoryEntry {
  path: string;
  valueKind: ParameterValueKind;
  sensitiveByName: boolean;
}

export interface ParameterFixtureSelection {
  path: string;
  mode: "include" | "redact";
}

export interface SanitizeCaptureInput {
  capturedAt: string;
  serialNumberAlias: string;
  identity: Omit<DeviceIdentity, "serialNumber">;
  parameters: DeviceParameterTree;
  selections: readonly ParameterFixtureSelection[];
}

export interface SanitizeGenieAcsCaptureInput extends Omit<
  SanitizeCaptureInput,
  "parameters"
> {
  rawDevice: unknown;
}

export const REDACTED_PARAMETER_VALUE = "[REDACTED]";

export const GENIEACS_IDENTITY_PROJECTION = [
  "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
  "InternetGatewayDevice.DeviceInfo.ModelName",
  "InternetGatewayDevice.DeviceInfo.ProductClass",
  "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "Device.DeviceInfo.Manufacturer",
  "Device.DeviceInfo.ManufacturerOUI",
  "Device.DeviceInfo.ModelName",
  "Device.DeviceInfo.ProductClass",
  "Device.DeviceInfo.SerialNumber",
  "Device.DeviceInfo.HardwareVersion",
  "Device.DeviceInfo.SoftwareVersion",
] as const;

const SENSITIVE_PATH_TERMS = [
  "password",
  "passphrase",
  "presharedkey",
  "pre_shared_key",
  "psk",
  "secret",
  "token",
  "credential",
  "username",
  "ssid",
  "macaddress",
  "ipaddress",
  "ipv4",
  "ipv6",
  "hostname",
  "serialnumber",
  "connectionrequesturl",
  "deviceid",
  "gponsn",
] as const;

/** Lists paths and types only. Values never leave this function. */
export function inventoryParameterTree(
  parameters: DeviceParameterTree,
): readonly ParameterInventoryEntry[] {
  return Object.keys(parameters)
    .sort()
    .map((path) => ({
      path,
      valueKind: parameterValueKind(readParameter(parameters, path)),
      sensitiveByName: isSensitiveParameterPath(path),
    }));
}

/** Reads a GenieACS NBI device response but returns no captured values. */
export function inventoryGenieAcsDevice(
  rawDevice: unknown,
): readonly ParameterInventoryEntry[] {
  return inventoryParameterTree(flattenGenieAcsDevice(rawDevice));
}

export function createAdapterContextFromGenieAcs(
  rawDevice: unknown,
  now = new Date(),
): DeviceAdapterContext {
  if (!isRecord(rawDevice)) {
    throw new TypeError("GenieACS device response must be an object.");
  }
  const parameters = flattenGenieAcsDevice(rawDevice);
  const id = optionalString(rawDevice._id);
  const deviceId = isRecord(rawDevice._deviceId) ? rawDevice._deviceId : {};
  const serialNumber =
    readIdentityParameter(parameters, "SerialNumber") ??
    optionalString(deviceId._SerialNumber);
  if (id === undefined || serialNumber === undefined) {
    throw new TypeError("GenieACS device id and serial number are required.");
  }
  const lastInformValue = optionalString(rawDevice._lastInform);
  const lastInformAt =
    lastInformValue === undefined ? undefined : new Date(lastInformValue);
  const validLastInformAt =
    lastInformAt !== undefined && !Number.isNaN(lastInformAt.valueOf())
      ? lastInformAt
      : undefined;

  return {
    id,
    identity: {
      serialNumber,
      ...optionalIdentity("manufacturer", [
        readIdentityParameter(parameters, "Manufacturer"),
        optionalString(deviceId._Manufacturer),
      ]),
      ...optionalIdentity("model", [
        readIdentityParameter(parameters, "ModelName"),
        optionalString(deviceId._ProductClass),
      ]),
      ...optionalIdentity("productClass", [
        readIdentityParameter(parameters, "ProductClass"),
        optionalString(deviceId._ProductClass),
      ]),
      ...optionalIdentity("oui", [
        readIdentityParameter(parameters, "ManufacturerOUI"),
        optionalString(deviceId._OUI),
      ]),
      ...optionalIdentity("hardwareVersion", [
        readIdentityParameter(parameters, "HardwareVersion"),
      ]),
      ...optionalIdentity("softwareVersion", [
        readIdentityParameter(parameters, "SoftwareVersion"),
      ]),
    },
    parameters,
    onlineState: classifyDeviceContact(validLastInformAt, now),
    ...(validLastInformAt === undefined
      ? {}
      : { lastInformAt: validLastInformAt }),
  };
}

export function isSensitiveParameterPath(path: string): boolean {
  const normalized = path.toLowerCase().replaceAll("-", "_");
  if (normalized.endsWith(".uniquessid")) return false;
  return SENSITIVE_PATH_TERMS.some((term) => normalized.includes(term));
}

/** Builds a minimal fixture; every retained path needs an explicit policy. */
export function sanitizeCapture({
  capturedAt,
  serialNumberAlias,
  identity,
  parameters,
  selections,
}: SanitizeCaptureInput): SanitizedParameterTreeFixture {
  const alias = serialNumberAlias.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(alias)) {
    throw new TypeError("Serial number alias must be a safe synthetic label.");
  }

  const sanitizedParameters: Record<string, unknown> = {};
  for (const { path, mode } of selections) {
    if (path.trim() === "") {
      throw new TypeError("Parameter selection path cannot be empty.");
    }
    if (mode !== "include" && mode !== "redact") {
      throw new TypeError(`Invalid parameter selection mode: ${String(mode)}`);
    }
    if (Object.hasOwn(sanitizedParameters, path)) {
      throw new TypeError(`Duplicate parameter selection: ${path}`);
    }
    if (!Object.hasOwn(parameters, path)) {
      throw new TypeError(`Selected parameter does not exist: ${path}`);
    }
    if (mode === "include" && isSensitiveParameterPath(path)) {
      throw new TypeError(`Sensitive parameter must be redacted: ${path}`);
    }

    sanitizedParameters[path] = {
      _value:
        mode === "redact"
          ? REDACTED_PARAMETER_VALUE
          : requirePrimitiveValue(readParameter(parameters, path), path),
    };
  }

  return parseFixture({
    schemaVersion: 1,
    source: "sanitized-capture",
    capturedAt,
    identity: {
      ...identity,
      serialNumber: `SANITIZED-${alias}`,
    },
    parameters: sanitizedParameters,
  });
}

export function sanitizeGenieAcsCapture({
  rawDevice,
  ...input
}: SanitizeGenieAcsCaptureInput): SanitizedParameterTreeFixture {
  return sanitizeCapture({
    ...input,
    parameters: flattenGenieAcsDevice(rawDevice),
  });
}

export function parseFixture(value: unknown): SanitizedParameterTreeFixture {
  if (!isRecord(value)) throw new TypeError("Fixture must be an object.");
  if (value.schemaVersion !== 1) {
    throw new TypeError("Fixture schemaVersion must be 1.");
  }
  if (
    value.source !== "sanitized-capture" &&
    value.source !== "synthetic-test"
  ) {
    throw new TypeError("Fixture source is invalid.");
  }
  if (!isValidDate(value.capturedAt)) {
    throw new TypeError("Fixture capturedAt must be an ISO date.");
  }
  if (!isRecord(value.identity)) {
    throw new TypeError("Fixture identity must be an object.");
  }
  const identity = parseIdentity(value.identity);
  if (!isRecord(value.parameters)) {
    throw new TypeError("Fixture parameters must be an object.");
  }

  return {
    schemaVersion: 1,
    source: value.source,
    capturedAt: value.capturedAt,
    identity,
    parameters: value.parameters,
  };
}

export function discoverFixture(
  fixture: SanitizedParameterTreeFixture,
  registry: AdapterRegistry = adapterRegistry,
): DiscoveryResult {
  const adapter = registry.resolve(fixture.identity);

  return {
    adapterId: adapter.id,
    dataModel: detectDataModel(fixture.parameters),
    capabilities: adapter.capabilities,
    observedParameterPaths: Object.keys(fixture.parameters).sort(),
  };
}

function parseIdentity(
  value: Readonly<Record<string, unknown>>,
): DeviceIdentity {
  const serialNumber = optionalString(value.serialNumber);
  if (serialNumber === undefined) {
    throw new TypeError("Fixture identity serialNumber is required.");
  }
  const optionalFields = [
    "manufacturer",
    "model",
    "productClass",
    "oui",
    "hardwareVersion",
    "softwareVersion",
  ] as const;
  const result: Record<string, string> = { serialNumber };
  for (const field of optionalFields) {
    const fieldValue = optionalString(value[field]);
    if (fieldValue !== undefined) result[field] = fieldValue;
  }
  return result as unknown as DeviceIdentity;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parameterValueKind(value: unknown): ParameterValueKind {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value === undefined) return "undefined";
  return "complex";
}

function requirePrimitiveValue(value: unknown, path: string): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  throw new TypeError(`Selected parameter is not a JSON primitive: ${path}`);
}

export function flattenGenieAcsDevice(rawDevice: unknown): DeviceParameterTree {
  if (!isRecord(rawDevice)) {
    throw new TypeError("GenieACS device response must be an object.");
  }

  const roots = ["Device", "InternetGatewayDevice", "VirtualParameters"];
  const parameters: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(rawDevice)) {
    if (
      roots.includes(path) ||
      roots.some((root) => path.startsWith(`${root}.`))
    ) {
      flattenGenieAcsNode(value, path, parameters);
    }
  }
  return parameters;
}

function readIdentityParameter(
  parameters: DeviceParameterTree,
  name: string,
): string | undefined {
  return (
    optionalString(
      readParameter(parameters, `InternetGatewayDevice.DeviceInfo.${name}`),
    ) ?? optionalString(readParameter(parameters, `Device.DeviceInfo.${name}`))
  );
}

function optionalIdentity<Key extends string>(
  key: Key,
  values: readonly (string | undefined)[],
): Partial<Record<Key, string>> {
  const value = values.find((candidate) => candidate !== undefined);
  return value === undefined ? {} : ({ [key]: value } as Record<Key, string>);
}

function flattenGenieAcsNode(
  value: unknown,
  path: string,
  parameters: Record<string, unknown>,
): void {
  if (!isRecord(value)) {
    parameters[path] = value;
    return;
  }
  if (Object.hasOwn(value, "_value")) {
    parameters[path] = { _value: value._value, _timestamp: value._timestamp };
    return;
  }
  for (const [name, child] of Object.entries(value)) {
    if (!name.startsWith("_")) {
      flattenGenieAcsNode(child, `${path}.${name}`, parameters);
    }
  }
}
