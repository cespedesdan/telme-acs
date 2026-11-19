import type { DeviceOperationState } from "@telme/device-model";

export interface GenieAcsClientConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  requestTimeoutMs?: number;
}

export interface GenieAcsDevice {
  id: string;
  lastInformAt?: Date;
  raw: Readonly<Record<string, unknown>>;
}

export type GenieAcsQuery = Readonly<Record<string, unknown>>;

export type GenieAcsParameterValue = string | number | boolean;
export type GenieAcsParameterValueTuple = readonly [
  path: string,
  value: GenieAcsParameterValue,
  xsdType?: string,
];

export type GenieAcsTask =
  | {
      readonly name: "getParameterValues";
      readonly parameterNames: readonly string[];
    }
  | { readonly name: "refreshObject"; readonly objectName: string }
  | {
      readonly name: "setParameterValues";
      readonly parameterValues: readonly GenieAcsParameterValueTuple[];
    }
  | { readonly name: "reboot" }
  | { readonly name: "factoryReset" }
  | { readonly name: "download"; readonly file: string };

export interface GenieAcsTaskOptions {
  /** Attempts immediate execution. Behind CGNAT this may still be queued. */
  connectionRequest?: boolean;
  timeoutMs?: number;
  expiresAt?: Date;
}

export interface GenieAcsOperationResult {
  deviceId: string;
  taskName: GenieAcsTask["name"];
  state: DeviceOperationState;
  taskId?: string;
}

export interface GenieAcsTaskRecord {
  id: string;
  deviceId?: string;
  name?: string;
  state: "queued";
  raw: Readonly<Record<string, unknown>>;
}

export type GenieAcsErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "DEVICE_NOT_FOUND"
  | "FORBIDDEN_OPERATION"
  | "GENIEACS_UNAVAILABLE"
  | "GENIEACS_TIMEOUT"
  | "GENIEACS_INVALID_RESPONSE";

export class GenieAcsError extends Error {
  public constructor(
    public readonly code: GenieAcsErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GenieAcsError";
  }
}

export type GenieAcsFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;

export class GenieAcsClient {
  readonly #baseUrl: URL;
  readonly #authorization?: string;
  readonly #requestTimeoutMs: number;

  public constructor(
    config: GenieAcsClientConfig,
    private readonly fetchImpl: GenieAcsFetch = fetch,
  ) {
    this.#baseUrl = parseBaseUrl(config.baseUrl);
    this.#requestTimeoutMs = requirePositiveTimeout(
      config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if ((config.username === undefined) !== (config.password === undefined)) {
      throw new GenieAcsError(
        "INVALID_CONFIGURATION",
        "GenieACS username and password must be configured together.",
      );
    }
    if (config.username !== undefined && config.password !== undefined) {
      this.#authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    }
  }

  public async findDevices(
    query: GenieAcsQuery,
    projection: readonly string[] = [],
  ): Promise<readonly GenieAcsDevice[]> {
    if (Object.keys(query).length === 0) {
      throw new GenieAcsError(
        "INVALID_REQUEST",
        "A non-empty GenieACS device query is required.",
      );
    }

    const url = this.#url("devices/");
    url.searchParams.set("query", JSON.stringify(query));
    if (projection.length > 0) {
      url.searchParams.set("projection", projection.join(","));
    }

    const raw = await this.#requestJson(url);
    if (!Array.isArray(raw)) {
      throw invalidResponse("Expected a device array from GenieACS.");
    }
    return raw.map(parseDevice);
  }

  public async findDevice(
    query: GenieAcsQuery,
    projection: readonly string[] = [],
  ): Promise<GenieAcsDevice | null> {
    const [device] = await this.findDevices(query, projection);
    return device ?? null;
  }

  public async getDevice(
    id: string,
    projection: readonly string[] = [],
  ): Promise<GenieAcsDevice | null> {
    requireNonEmpty(id, "device id");
    return this.findDevice({ _id: id }, projection);
  }

  public refreshParameters(
    deviceId: string,
    parameterNames: readonly string[],
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    if (parameterNames.length === 0) {
      throw new GenieAcsError(
        "INVALID_REQUEST",
        "At least one parameter name is required.",
      );
    }
    parameterNames.forEach((path) => requireNonEmpty(path, "parameter name"));
    return this.createTask(
      deviceId,
      { name: "getParameterValues", parameterNames },
      options,
    );
  }

  public refreshObject(
    deviceId: string,
    objectName = "",
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    return this.createTask(
      deviceId,
      { name: "refreshObject", objectName },
      options,
    );
  }

  public setParameterValues(
    deviceId: string,
    parameterValues: readonly GenieAcsParameterValueTuple[],
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    if (parameterValues.length === 0) {
      throw new GenieAcsError(
        "INVALID_REQUEST",
        "At least one parameter value is required.",
      );
    }
    parameterValues.forEach(([path]) =>
      requireNonEmpty(path, "parameter name"),
    );
    return this.createTask(
      deviceId,
      { name: "setParameterValues", parameterValues },
      options,
    );
  }

  public reboot(
    deviceId: string,
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    return this.createTask(deviceId, { name: "reboot" }, options);
  }

  public factoryReset(
    deviceId: string,
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    return this.createTask(deviceId, { name: "factoryReset" }, options);
  }

  public downloadFile(
    deviceId: string,
    file: string,
    options?: GenieAcsTaskOptions,
  ): Promise<GenieAcsOperationResult> {
    requireNonEmpty(file, "file id");
    return this.createTask(deviceId, { name: "download", file }, options);
  }

  public async createTask(
    deviceId: string,
    task: GenieAcsTask,
    options: GenieAcsTaskOptions = {},
  ): Promise<GenieAcsOperationResult> {
    requireNonEmpty(deviceId, "device id");
    const url = this.#url(`devices/${encodeURIComponent(deviceId)}/tasks`);
    if (options.connectionRequest === true) {
      url.searchParams.set("connection_request", "");
    }

    try {
      const response = await this.#request(
        url,
        {
          method: "POST",
          body: JSON.stringify({
            ...task,
            ...(options.expiresAt === undefined
              ? {}
              : { expiry: options.expiresAt.toISOString() }),
          }),
          headers: { "content-type": "application/json" },
        },
        options.timeoutMs,
      );
      if (response.status !== 200 && response.status !== 202) {
        throw this.#httpError(response.status);
      }
      const raw = await parseJson(response);
      const taskId = isRecord(raw) ? readString(raw, "_id") : undefined;
      if (taskId === undefined) {
        throw invalidResponse("Task id is missing from GenieACS response.");
      }

      return {
        deviceId,
        taskName: task.name,
        state: response.status === 200 ? "executed" : "queued",
        taskId,
      };
    } catch (error) {
      if (error instanceof GenieAcsError && error.code === "GENIEACS_TIMEOUT") {
        return { deviceId, taskName: task.name, state: "timed_out" };
      }
      if (error instanceof GenieAcsError && error.code === "INVALID_REQUEST") {
        return { deviceId, taskName: task.name, state: "failed" };
      }
      throw error;
    }
  }

  /** A present task is still queued. Absence alone cannot prove execution. */
  public async getTask(taskId: string): Promise<GenieAcsTaskRecord | null> {
    requireNonEmpty(taskId, "task id");
    const url = this.#url("tasks/");
    url.searchParams.set("query", JSON.stringify({ _id: taskId }));
    const raw = await this.#requestJson(url);
    if (!Array.isArray(raw)) {
      throw invalidResponse("Expected a task array from GenieACS.");
    }
    const task = raw[0];
    if (task === undefined) return null;
    if (!isRecord(task)) throw invalidResponse("Invalid GenieACS task.");

    const id = readString(task, "_id");
    if (id === undefined) throw invalidResponse("Task id is missing.");
    const deviceId = readString(task, "device");
    const name = readString(task, "name");
    return {
      id,
      state: "queued",
      raw: task,
      ...(deviceId === undefined ? {} : { deviceId }),
      ...(name === undefined ? {} : { name }),
    };
  }

  /** Fault details may contain secrets; expose only the presence of a fault. */
  public async hasTaskFault(
    deviceId: string,
    taskId: string,
  ): Promise<boolean> {
    requireNonEmpty(deviceId, "device id");
    requireNonEmpty(taskId, "task id");
    const url = this.#url("faults/");
    url.searchParams.set(
      "query",
      JSON.stringify({ _id: `${deviceId}:task_${taskId}` }),
    );
    url.searchParams.set("projection", "_id");
    const raw = await this.#requestJson(url);
    if (!Array.isArray(raw))
      throw invalidResponse("Expected a fault array from GenieACS.");
    return raw.length > 0;
  }

  public async deleteTask(taskId: string): Promise<void> {
    requireNonEmpty(taskId, "task id");
    const response = await this.#request(
      this.#url(`tasks/${encodeURIComponent(taskId)}`),
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404)
      throw this.#httpError(response.status);
  }

  async #requestJson(url: URL): Promise<unknown> {
    const response = await this.#request(url);
    if (!response.ok) throw this.#httpError(response.status);
    return parseJson(response);
  }

  async #request(
    url: URL,
    init: RequestInit = {},
    timeoutMs = this.#requestTimeoutMs,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.#authorization !== undefined) {
      headers.set("authorization", this.#authorization);
    }

    try {
      return await this.fetchImpl(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(requirePositiveTimeout(timeoutMs)),
      });
    } catch (error) {
      if (
        isRecord(error) &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new GenieAcsError(
          "GENIEACS_TIMEOUT",
          "GenieACS request timed out.",
          { cause: error },
        );
      }
      throw new GenieAcsError(
        "GENIEACS_UNAVAILABLE",
        "GenieACS is unavailable.",
        { cause: error },
      );
    }
  }

  #httpError(status: number): GenieAcsError {
    if (status === 404) {
      return new GenieAcsError("DEVICE_NOT_FOUND", "Device was not found.");
    }
    if (status === 401 || status === 403) {
      return new GenieAcsError(
        "FORBIDDEN_OPERATION",
        "GenieACS rejected the operation.",
      );
    }
    if (status >= 400 && status < 500) {
      return new GenieAcsError(
        "INVALID_REQUEST",
        "GenieACS rejected the request.",
      );
    }
    return new GenieAcsError(
      "GENIEACS_UNAVAILABLE",
      "GenieACS is unavailable.",
    );
  }

  #url(path: string): URL {
    return new URL(path, this.#baseUrl);
  }
}

function parseBaseUrl(value: string): URL {
  try {
    const url = new URL(value.endsWith("/") ? value : `${value}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw 0;
    return url;
  } catch {
    throw new GenieAcsError(
      "INVALID_CONFIGURATION",
      "GenieACS base URL must be a valid HTTP(S) URL.",
    );
  }
}

function requirePositiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new GenieAcsError(
      "INVALID_CONFIGURATION",
      "GenieACS request timeout must be a positive number.",
    );
  }
  return value;
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim() === "") {
    throw new GenieAcsError(
      "INVALID_REQUEST",
      `A non-empty ${label} is required.`,
    );
  }
}

function parseDevice(value: unknown): GenieAcsDevice {
  if (!isRecord(value)) throw invalidResponse("Invalid GenieACS device.");
  const id = readString(value, "_id");
  if (id === undefined) throw invalidResponse("Device id is missing.");
  const lastInform = readString(value, "_lastInform");
  const parsedDate =
    lastInform === undefined ? undefined : new Date(lastInform);
  const lastInformAt =
    parsedDate !== undefined && !Number.isNaN(parsedDate.valueOf())
      ? parsedDate
      : undefined;

  return {
    id,
    raw: value,
    ...(lastInformAt === undefined ? {} : { lastInformAt }),
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw invalidResponse("GenieACS returned invalid JSON.", error);
  }
}

function invalidResponse(message: string, cause?: unknown): GenieAcsError {
  return new GenieAcsError("GENIEACS_INVALID_RESPONSE", message, { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}
