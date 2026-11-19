import {
  readBooleanParameter,
  readNumberParameter,
  readStringParameter,
} from "./parameters.js";
import type {
  DeviceAdapterContext,
  DeviceParameterWrite,
  NormalizedWifiBand,
  NormalizedWifiNetwork,
} from "./registry.js";

export function readTr098Wifi(
  context: DeviceAdapterContext,
  band: NormalizedWifiBand,
  root: string,
): NormalizedWifiNetwork {
  const ssid = readPrivateString(context, `${root}.SSID`);
  const enabled = readBooleanParameter(context.parameters, `${root}.Enable`);
  const rawStatus = readStringParameter(context.parameters, `${root}.Status`);
  const name = readStringParameter(context.parameters, `${root}.Name`);
  const standard = readStringParameter(context.parameters, `${root}.Standard`);
  const channel = readNumberParameter(context.parameters, `${root}.Channel`);
  const connectedDeviceCount = readNumberParameter(
    context.parameters,
    `${root}.TotalAssociations`,
  );
  return {
    id: `wlan-${root.split(".").at(-1) ?? root}`,
    band,
    ...(ssid === undefined ? {} : { ssid }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(name === undefined ? {} : { name }),
    ...(standard === undefined ? {} : { standard }),
    ...(channel === undefined ? {} : { channel }),
    ...(connectedDeviceCount === undefined ? {} : { connectedDeviceCount }),
    status:
      rawStatus === "Up" ? "up" : rawStatus === "Disabled" ? "down" : "unknown",
  };
}

export function buildTr098SsidWrite(
  root: string,
  ssid: string,
): readonly DeviceParameterWrite[] {
  validateSsid(ssid);
  return [[`${root}.SSID`, ssid, "xsd:string"]];
}

export function buildTr098PasswordWrite(
  root: string,
  password: string,
): readonly DeviceParameterWrite[] {
  const validPassphrase =
    password.length >= 8 &&
    password.length <= 63 &&
    [...password].every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint <= 0x7e;
    });
  const validPsk = /^[0-9a-f]{64}$/i.test(password);
  if (!validPassphrase && !validPsk) {
    throw new TypeError(
      "Wi-Fi password must contain 8-63 printable ASCII characters or 64 hexadecimal characters.",
    );
  }
  return [[`${root}.PreSharedKey.1.KeyPassphrase`, password, "xsd:string"]];
}

export function readIpv6Parameter(
  context: DeviceAdapterContext,
  path: string,
): string | undefined {
  const value = readPrivateString(context, path);
  if (value === undefined) return undefined;
  return value.includes(":") ? value : undefined;
}

export function readPrivateString(
  context: DeviceAdapterContext,
  path: string,
): string | undefined {
  const value = readStringParameter(context.parameters, path);
  return value === undefined || value === "[REDACTED]" ? undefined : value;
}

export function normalizeWanStatus(
  value: string | undefined,
): "connected" | "disconnected" | "unknown" {
  if (value === "Connected") return "connected";
  if (value === "Disconnected") return "disconnected";
  return "unknown";
}

function validateSsid(ssid: string): void {
  const bytes = utf8ByteLength(ssid);
  if (bytes < 1 || bytes > 32 || hasControlCharacter(ssid)) {
    throw new TypeError(
      "SSID must contain 1-32 UTF-8 bytes without control characters.",
    );
  }
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}
