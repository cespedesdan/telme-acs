import type { ApiErrorResponse } from "@telme/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly correlationId?: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(20000),
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      init?.method && init.method !== "GET"
        ? "A resposta não chegou. A solicitação pode estar em andamento; consulte o histórico antes de repetir."
        : "Não foi possível acessar o serviço. Verifique se Web e API estão em execução.",
      0,
      "SERVICE_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try {
      body = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      /* Proxy may return HTML. */
    }
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("telme:session-expired"));
    throw new ApiError(
      body.message ??
        (response.status >= 500
          ? "Serviço temporariamente indisponível."
          : "Não foi possível concluir a operação."),
      response.status,
      body.code,
      body.correlationId,
      body,
    );
  }
  if (response.status === 204 || response.headers.get("content-length") === "0")
    return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
