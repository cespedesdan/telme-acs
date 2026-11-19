export type DeviceParameterTree = Readonly<Record<string, unknown>>;

/** Reads a value only from a caller-supplied, previously verified path. */
export function readParameter(
  parameters: DeviceParameterTree,
  path: string,
): unknown {
  const raw = parameters[path];
  if (isRecord(raw) && "_value" in raw) return raw._value;
  return raw;
}

export function readStringParameter(
  parameters: DeviceParameterTree,
  path: string,
): string | undefined {
  const value = readParameter(parameters, path);
  return typeof value === "string" ? value : undefined;
}

export function readNumberParameter(
  parameters: DeviceParameterTree,
  path: string,
): number | undefined {
  const value = readParameter(parameters, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function readBooleanParameter(
  parameters: DeviceParameterTree,
  path: string,
): boolean | undefined {
  const value = readParameter(parameters, path);
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
