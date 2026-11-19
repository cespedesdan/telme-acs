"use client";

import type {
  DeviceAuditResponse,
  DeviceDetailResponse,
  DeviceOperationResponse,
  DeviceSummaryResponse,
  OperationAcceptedResponse,
  SessionResponse,
  WifiNetworkResponse,
  DeviceInventoryResponse,
  ServiceReadinessResponse,
} from "@telme/contracts";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { api, ApiError } from "../lib/api";

import {
  operationStateLabel,
  onlineStateLabel,
  supportLevel,
  supportLevelLabel,
  type InventoryFilter,
} from "../lib/status";

type SessionState = SessionResponse["user"] | null | undefined;

function isReadiness(value: unknown): value is ServiceReadinessResponse {
  if (typeof value !== "object" || value === null || !("checks" in value))
    return false;
  const checks = value.checks;
  return (
    typeof checks === "object" &&
    checks !== null &&
    "database" in checks &&
    "genieAcs" in checks &&
    ["ok", "unavailable"].includes(String(checks.database)) &&
    ["ok", "unavailable"].includes(String(checks.genieAcs))
  );
}

export default function HomePage() {
  const [session, setSession] = useState<SessionState>(undefined);
  const [devices, setDevices] = useState<readonly DeviceSummaryResponse[]>([]);
  const [selected, setSelected] = useState<DeviceDetailResponse>();
  const [operations, setOperations] = useState<
    readonly DeviceOperationResponse[]
  >([]);
  const [audit, setAudit] = useState<readonly DeviceAuditResponse[]>([]);
  const [search, setSearch] = useState("");
  const [inventoryFilter, setInventoryFilter] =
    useState<InventoryFilter>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [inventory, setInventory] = useState<DeviceInventoryResponse>();
  const [readiness, setReadiness] = useState<ServiceReadinessResponse>();
  const [page, setPage] = useState(1);
  const [activeQuery, setActiveQuery] = useState("");
  const pendingRequest = useRef<{
    path: string;
    body?: BodyInit | null | undefined;
    key: string;
  } | null>(null);
  const openSequence = useRef(0);
  const inventorySequence = useRef(0);
  const metrics = {
    total: inventory?.metrics.total ?? 0,
    online: inventory?.metrics.online ?? 0,
    offline: inventory?.metrics.offline ?? 0,
    attention:
      (inventory?.metrics.stale ?? 0) + (inventory?.metrics.unknown ?? 0),
    availability: inventory?.metrics.total
      ? Math.round((inventory.metrics.online / inventory.metrics.total) * 100)
      : 0,
  };
  const visibleDevices = devices;

  const loadDevices = useCallback(
    async (query = "", requestedPage = 1, filter: InventoryFilter = "all") => {
      const sequence = ++inventorySequence.current;
      setError(undefined);
      const list = await api<DeviceInventoryResponse>(
        `/devices/inventory?q=${encodeURIComponent(query)}&page=${requestedPage}&state=${filter}`,
      );
      if (sequence !== inventorySequence.current) return;
      setDevices(list.items);
      setInventory(list);
      setPage(requestedPage);
      setActiveQuery(query);
    },
    [],
  );

  useEffect(() => {
    api<SessionResponse>("/auth/me")
      .then(({ user }) => {
        setSession(user);
        void loadDevices().catch((cause: unknown) =>
          setError(errorMessage(cause)),
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) setSession(null);
        else setError(errorMessage(cause));
      });
    const expired = () => {
      openSequence.current++;
      inventorySequence.current++;
      setSession(null);
      setSelected(undefined);
      setDevices([]);
      setOperations([]);
      setAudit([]);
      setInventory(undefined);
      setReadiness(undefined);
      setNotice(undefined);
      setBusy(false);
      setSearch("");
      setActiveQuery("");
      setInventoryFilter("all");
      setPage(1);
      pendingRequest.current = null;
    };
    window.addEventListener("telme:session-expired", expired);
    return () => window.removeEventListener("telme:session-expired", expired);
  }, [loadDevices]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const check = async () => {
      try {
        const state = await api<ServiceReadinessResponse>("/health/ready");
        if (!cancelled) setReadiness(state);
      } catch (cause) {
        if (!cancelled)
          setReadiness(
            cause instanceof ApiError &&
              cause.status === 503 &&
              isReadiness(cause.responseBody)
              ? cause.responseBody
              : undefined,
          );
      }
    };
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    if (!session || !selected) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || busy) return;
      const sequence = openSequence.current;
      void api<readonly DeviceOperationResponse[]>(
        `/devices/${selected.id}/operations`,
      )
        .then(async (rows) => {
          if (sequence !== openSequence.current) return;
          setOperations(rows);
          if (
            rows.some(
              (row) =>
                row.state !== "queued" &&
                operations.find((old) => old.id === row.id)?.state === "queued",
            )
          ) {
            const detail = await api<DeviceDetailResponse>(
              `/devices/${selected.id}`,
            );
            if (sequence === openSequence.current) setSelected(detail);
            if (session.permissions.includes("audit.read")) {
              const history = await api<readonly DeviceAuditResponse[]>(
                `/devices/${selected.id}/audit`,
              );
              if (sequence === openSequence.current) setAudit(history);
            }
          }
        })
        .catch((cause: unknown) => setError(errorMessage(cause)));
    }, 15000);
    return () => clearInterval(timer);
  }, [session, selected, busy, operations]);

  async function openDevice(id: string): Promise<void> {
    const sequence = ++openSequence.current;
    setBusy(true);
    setError(undefined);
    try {
      const [detail, operationList, auditList] = await Promise.all([
        api<DeviceDetailResponse>(`/devices/${id}`),
        api<readonly DeviceOperationResponse[]>(`/devices/${id}/operations`),
        session?.permissions.includes("audit.read")
          ? api<readonly DeviceAuditResponse[]>(`/devices/${id}/audit`)
          : Promise.resolve([]),
      ]);
      if (sequence !== openSequence.current) return;
      setSelected(detail);
      setOperations(operationList);
      setAudit(auditList);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (sequence === openSequence.current) setBusy(false);
    }
  }

  function openAndReveal(id: string): void {
    void openDevice(id).then(() =>
      document
        .getElementById("device-detail")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  async function runOperation(path: string, init: RequestInit): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      if (
        pendingRequest.current?.path !== path ||
        pendingRequest.current.body !== init.body
      )
        pendingRequest.current = {
          path,
          body: init.body,
          key: crypto.randomUUID(),
        };
      const result = await api<OperationAcceptedResponse>(path, {
        ...init,
        headers: {
          ...init.headers,
          "idempotency-key": pendingRequest.current!.key,
        },
      });
      pendingRequest.current = null;
      setNotice(
        result.state === "queued"
          ? "Solicitação registrada; aguardando contato ou confirmação do equipamento."
          : operationStateLabel(result.state),
      );
      await openDevice(selected.id);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500
      )
        pendingRequest.current = null;
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  if (session === undefined) {
    return (
      <main className="centered">
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          "Carregando TELME ACS…"
        )}
      </main>
    );
  }
  if (session === null) {
    return (
      <Login
        onAuthenticated={(user) => {
          setSession(user);
          void loadDevices().catch((cause: unknown) =>
            setError(errorMessage(cause)),
          );
        }}
      />
    );
  }

  return (
    <main className="shell">
      <div className="app-hero">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark compact">T</div>
            <div>
              <p className="eyebrow">TELME FIBRA</p>
              <strong>TELME ACS</strong>
            </div>
          </div>
          <div className="operator">
            <span>{session.displayName}</span>
            <small>{session.role.replaceAll("_", " ")}</small>
            <button
              className="link-button"
              onClick={() =>
                api<void>("/auth/session", { method: "DELETE" }).finally(() => {
                  setSession(null);
                  setSelected(undefined);
                  setDevices([]);
                  setOperations([]);
                  setAudit([]);
                  setInventory(undefined);
                  setReadiness(undefined);
                  setNotice(undefined);
                  setBusy(false);
                  setSearch("");
                  setActiveQuery("");
                  setInventoryFilter("all");
                  setPage(1);
                  openSequence.current++;
                  inventorySequence.current++;
                  pendingRequest.current = null;
                })
              }
            >
              Sair
            </button>
          </div>
        </header>

        <div className="hero-content">
          <div>
            <p className="section-kicker">Central de operações</p>
            <h1>Rede sob controle, suporte sem adivinhação.</h1>
            <p>
              Inventário, diagnóstico e ações remotas com o estado real de cada
              equipamento.
            </p>
          </div>
          <div className="availability-card">
            <span>Disponibilidade observada</span>
            <strong>{metrics.availability}%</strong>
            <div aria-hidden="true">
              <span style={{ width: `${metrics.availability}%` }} />
            </div>
            <small>{metrics.online} equipamentos online agora</small>
          </div>
        </div>
      </div>

      <section className="inventory-metrics" aria-label="Resumo da rede">
        <InventoryMetric
          label="Equipamentos"
          value={metrics.total}
          tone="total"
        />
        <InventoryMetric label="Online" value={metrics.online} tone="online" />
        <InventoryMetric
          label="Precisam de atenção"
          value={metrics.attention}
          tone="attention"
        />
        <InventoryMetric
          label="Offline"
          value={metrics.offline}
          tone="offline"
        />
      </section>
      <p className="message notice" role="status">
        {readiness?.status === "ok"
          ? "Banco e GenieACS disponíveis."
          : "Verificando serviços ou conexão indisponível."}
        {inventory?.syncState === "unavailable"
          ? " Inventário em cache: GenieACS indisponível."
          : ""}
        {inventory?.lastSyncedAt
          ? ` Última sincronização: ${formatDate(inventory.lastSyncedAt)}.`
          : ""}
      </p>

      <section className="search-panel" aria-labelledby="search-title">
        <div>
          <p className="section-kicker">Inventário</p>
          <h2 id="search-title">Localizar equipamento</h2>
          <p>Busque por serial, PPPoE, MAC, modelo ou identificador local.</p>
        </div>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            loadDevices(search, 1, inventoryFilter)
              .catch((cause: unknown) => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="device-search">Busca</label>
          <div>
            <input
              id="device-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: HG8145V5 ou número de série"
              maxLength={100}
            />
            <button disabled={busy}>Buscar</button>
          </div>
        </form>
      </section>

      {error && <p className="message error">{error}</p>}
      {notice && <p className="message notice">{notice}</p>}

      <div className="workspace">
        <section className="device-list" aria-label="Equipamentos encontrados">
          <div className="panel-heading">
            <h2>Equipamentos</h2>
            <span>
              {visibleDevices.length}/{inventory?.total ?? 0}
            </span>
          </div>
          <div className="inventory-filters" aria-label="Filtrar equipamentos">
            {(
              [
                ["all", "Todos"],
                ["online", "Online"],
                ["attention", "Atenção"],
                ["offline", "Offline"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={inventoryFilter === value ? "active" : ""}
                aria-pressed={inventoryFilter === value}
                onClick={() => {
                  setInventoryFilter(value);
                  setBusy(true);
                  void loadDevices(activeQuery, 1, value)
                    .catch((cause: unknown) => setError(errorMessage(cause)))
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              >
                {label}
              </button>
            ))}
          </div>
          {visibleDevices.length === 0 ? (
            <p className="empty">Nenhum equipamento encontrado.</p>
          ) : (
            <div className="table-scroll">
              <table className="device-table">
                <thead>
                  <tr>
                    <th scope="col">Estado</th>
                    <th scope="col">Modelo</th>
                    <th scope="col">Serial</th>
                    <th scope="col">Hardware</th>
                    <th scope="col">Firmware</th>
                    <th scope="col">Último Inform</th>
                    <th scope="col">Suporte</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDevices.map((device) => {
                    const level = supportLevel(device.capabilities);
                    return (
                      <tr
                        key={device.id}
                        className={selected?.id === device.id ? "selected" : ""}
                        onClick={() => openAndReveal(device.id)}
                      >
                        <td>
                          <span
                            className={`status-dot ${device.onlineState}`}
                          />{" "}
                          {onlineStateLabel(device.onlineState)}
                        </td>
                        <td>
                          <button
                            className="link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAndReveal(device.id);
                            }}
                          >
                            {device.model ??
                              device.productClass ??
                              "Modelo desconhecido"}
                          </button>
                          {device.localLabel && (
                            <small>{device.localLabel}</small>
                          )}
                        </td>
                        <td>{device.serialNumber}</td>
                        <td>{device.hardwareVersion ?? "—"}</td>
                        <td>{device.softwareVersion ?? "—"}</td>
                        <td>{shortDate(device.lastInformAt)}</td>
                        <td>
                          <span className={`support-badge ${level}`}>
                            {supportLevelLabel(level)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="inventory-filters" aria-label="Paginação">
            <button
              disabled={busy || page <= 1}
              onClick={() => {
                setBusy(true);
                void loadDevices(activeQuery, page - 1, inventoryFilter)
                  .catch((cause: unknown) => setError(errorMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Anterior
            </button>
            <span>
              Página {page} de{" "}
              {Math.max(1, Math.ceil((inventory?.total ?? 0) / 50))}
            </span>
            <button
              disabled={busy || page * 50 >= (inventory?.total ?? 0)}
              onClick={() => {
                setBusy(true);
                void loadDevices(activeQuery, page + 1, inventoryFilter)
                  .catch((cause: unknown) => setError(errorMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Próxima
            </button>
          </div>
        </section>

        <section id="device-detail" className="detail-panel" aria-live="polite">
          {!selected ? (
            <div className="empty detail-empty">
              <strong>Selecione um equipamento</strong>
              <span>Os dados técnicos e ações aparecerão aqui.</span>
            </div>
          ) : (
            <>
              {session.permissions.includes("device.bind") && (
                <LocalIdentification
                  key={selected.id}
                  value={selected.localLabel ?? ""}
                  busy={busy}
                  onSave={async (localLabel) => {
                    setBusy(true);
                    try {
                      await api<void>(
                        `/devices/${selected.id}/identification`,
                        {
                          method: "PUT",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ localLabel }),
                        },
                      );
                      await openDevice(selected.id);
                      await loadDevices(activeQuery, page, inventoryFilter);
                    } catch (cause) {
                      setError(errorMessage(cause));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}
              <DeviceDetail
                device={selected}
                operations={operations}
                audit={audit}
                permissions={session.permissions}
                busy={busy}
                onSsid={(band, ssid) =>
                  runOperation(`/devices/${selected.id}/wifi/${band}`, {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ssid }),
                  })
                }
                onWifiPassword={(band, password) => {
                  if (
                    !window.confirm(
                      `Confirmar alteração da senha do Wi-Fi ${band === "2.4ghz" ? "2,4 GHz" : "5 GHz"}? Os dispositivos precisarão se conectar novamente.`,
                    )
                  ) {
                    return Promise.resolve();
                  }
                  return runOperation(
                    `/devices/${selected.id}/wifi/${band}/password`,
                    {
                      method: "PUT",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ password }),
                    },
                  );
                }}
                onRefresh={() =>
                  runOperation(`/devices/${selected.id}/refresh`, {
                    method: "POST",
                  })
                }
                onReboot={() => {
                  if (
                    window.confirm(
                      "Confirmar reboot? O equipamento ficará indisponível por alguns minutos.",
                    )
                  ) {
                    void runOperation(`/devices/${selected.id}/reboot`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ confirm: true }),
                    });
                  }
                }}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function LocalIdentification({
  value,
  busy,
  onSave,
}: {
  value: string;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(value);
  return (
    <form
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(label);
      }}
    >
      <label htmlFor="local-label">Identificação local</label>
      <div>
        <input
          id="local-label"
          value={label}
          maxLength={120}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ex.: bancada 1 ou código interno"
        />
        <button disabled={busy || label === value}>Salvar</button>
      </div>
    </form>
  );
}

function Login({
  onAuthenticated,
}: {
  onAuthenticated: (user: SessionResponse["user"]) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const session = await api<SessionResponse>("/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      onAuthenticated(session.user);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark">T</div>
        <p className="eyebrow">TELME FIBRA</p>
        <h1 id="login-title">Acesso ao ACS</h1>
        <p className="muted">
          Ambiente interno de gerenciamento de equipamentos.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && <p className="message error">{error}</p>}
          <button disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

function InventoryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "total" | "online" | "attention" | "offline";
}) {
  return (
    <article className={`inventory-metric ${tone}`}>
      <span className="metric-indicator" />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function DeviceDetail({
  device,
  operations,
  audit,
  permissions,
  busy,
  onSsid,
  onWifiPassword,
  onRefresh,
  onReboot,
}: {
  device: DeviceDetailResponse;
  operations: readonly DeviceOperationResponse[];
  audit: readonly DeviceAuditResponse[];
  permissions: readonly string[];
  busy: boolean;
  onSsid: (band: WifiNetworkResponse["band"], ssid: string) => Promise<void>;
  onWifiPassword: (
    band: WifiNetworkResponse["band"],
    password: string,
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onReboot: () => void;
}) {
  return (
    <>
      <div className="detail-header">
        <div>
          <p className="section-kicker">Detalhes do equipamento</p>
          <h2>
            {device.model ?? device.productClass ?? "Modelo desconhecido"}
          </h2>
          <p className="serial">{device.serialNumber}</p>
        </div>
        <div className="detail-badges">
          <span
            className={`support-badge ${supportLevel(device.capabilities)}`}
          >
            {supportLevelLabel(supportLevel(device.capabilities))}
          </span>
          <span className={`status-pill ${device.onlineState}`}>
            {onlineStateLabel(device.onlineState)}
          </span>
        </div>
      </div>

      <section
        className="diagnostic-section"
        aria-labelledby="diagnostic-title"
      >
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Diagnóstico rápido</p>
            <h3 id="diagnostic-title">Leitura atual do equipamento</h3>
          </div>
          <span>Dados do último Inform</span>
        </div>
        <div className="diagnostic-grid">
          <DiagnosticCard
            label="Conectividade ACS"
            value={onlineStateLabel(device.onlineState)}
            detail={`Último contato: ${formatDate(device.lastInformAt)}`}
            tone={device.onlineState === "online" ? "good" : "attention"}
          />
          <DiagnosticCard
            label="Internet / WAN"
            value={ipModeLabel(device)}
            detail={`${device.wan?.ipv4 ?? "IPv4 não informado"} · IPv6 ${ipv6StatusLabel(device)}`}
            tone={device.wan?.status === "connected" ? "good" : "neutral"}
          />
          <DiagnosticCard
            label="Conexões Wi-Fi"
            value={connectedWifiLabel(device.wifi)}
            detail={networkCountLabel(device.wifi.length)}
            tone="neutral"
          />
          <DiagnosticCard
            label="Sinal óptico"
            value={
              device.optical?.rxDbm === undefined
                ? "Não informado"
                : `${device.optical.rxDbm} dBm RX`
            }
            detail={
              device.optical?.txDbm === undefined
                ? "TX não informado"
                : `${device.optical.txDbm} dBm TX`
            }
            tone="neutral"
          />
        </div>
      </section>

      <div className="quick-actions">
        <div>
          <span>Ações remotas</span>
          <strong>Gerenciamento seguro do HGU</strong>
        </div>
        <button
          className="secondary"
          disabled={busy || !permissions.includes("device.refresh")}
          onClick={() => void onRefresh()}
        >
          Atualizar dados
        </button>
        <button
          className="danger"
          disabled={
            busy ||
            !permissions.includes("device.reboot") ||
            device.capabilities.reboot !== "supported"
          }
          onClick={onReboot}
        >
          Reiniciar equipamento
        </button>
      </div>

      <div className="facts">
        <Fact label="Hardware" value={device.hardwareVersion} />
        <Fact label="Firmware" value={device.softwareVersion} />
        <Fact label="WAN" value={wanLabel(device.wan?.status)} />
        <Fact label="IPv4" value={device.wan?.ipv4} />
        <Fact label="IPv6" value={ipv6DisplayValue(device)} />
        <Fact label="PPPoE" value={device.wan?.pppoeUsername} />
      </div>

      <section className="subsection">
        <div className="panel-heading">
          <h3>Wi-Fi</h3>
          <span>{networkCountLabel(device.wifi.length)}</span>
        </div>
        <div className="wifi-summary">
          <WifiSummary
            label="SSID unificado (UNIQUE_SSID)"
            value={
              device.wifiUnifiedSsid === undefined
                ? "Não informado pelo HGU"
                : device.wifiUnifiedSsid
                  ? "Ativo"
                  : "Desativado"
            }
            tone={
              device.wifiUnifiedSsid === undefined
                ? "unknown"
                : device.wifiUnifiedSsid
                  ? "active"
                  : "inactive"
            }
          />
          <WifiSummary
            label="Usuários conectados"
            value={connectedWifiLabel(device.wifi)}
            tone="neutral"
          />
        </div>
        <div className="wifi-grid">
          {device.wifi.length === 0 ? (
            <p className="empty">Wi-Fi ainda não validado para esta revisão.</p>
          ) : (
            device.wifi.map((network) => (
              <WifiCard
                key={network.id}
                network={network}
                canWrite={
                  permissions.includes("wifi.write") &&
                  device.capabilities.wifiWrite === "supported"
                }
                passwordCapability={device.capabilities.wifiPasswordWrite}
                busy={busy}
                onSave={onSsid}
                onPassword={onWifiPassword}
              />
            ))
          )}
        </div>

        <div className="wifi-clients">
          <div className="panel-heading">
            <h4>Dispositivos conectados</h4>
            <span>Nomes, IP e rede</span>
          </div>
          {device.wifiClients === undefined ? (
            <p className="wifi-client-note">
              O HGU informou a quantidade de conexões, mas ainda não entregou a
              lista de hosts com nomes. A atualização já pode ser solicitada em
              “Atualizar dados”.
            </p>
          ) : device.wifiClients.length === 0 ? (
            <p className="wifi-client-note">Nenhum dispositivo conectado.</p>
          ) : (
            <div className="wifi-client-list">
              {device.wifiClients.map((client) => (
                <div className="wifi-client-row" key={client.id}>
                  <strong>{client.name ?? "Dispositivo sem nome"}</strong>
                  <span>{client.ipv4 ?? "IP não informado"}</span>
                  <span>{client.macAddress ?? "MAC não informado"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="subsection">
        <h3>Operações</h3>
        <div className="timeline">
          {operations.length === 0 ? (
            <p className="empty">Nenhuma operação registrada.</p>
          ) : (
            operations.map((operation) => (
              <div className="timeline-row" key={operation.id}>
                <span className={`state ${operation.state}`}>
                  {operationStateLabel(operation.state)}
                </span>
                <strong>{operationLabel(operation.type)}</strong>
                <time>{formatDate(operation.createdAt)}</time>
              </div>
            ))
          )}
        </div>
      </section>

      {permissions.includes("audit.read") && (
        <section className="subsection">
          <h3>Auditoria</h3>
          <div className="timeline">
            {audit.length === 0 ? (
              <p className="empty">Nenhum evento auditado.</p>
            ) : (
              audit.map((entry) => (
                <div className="timeline-row" key={entry.id}>
                  <span>{entry.result}</span>
                  <strong>{operationLabel(entry.action)}</strong>
                  <time>
                    {entry.actor ?? "Sistema"} · {formatDate(entry.createdAt)}
                  </time>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </>
  );
}

function DiagnosticCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "attention" | "neutral";
}) {
  return (
    <article className={`diagnostic-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function WifiCard({
  network,
  canWrite,
  passwordCapability,
  busy,
  onSave,
  onPassword,
}: {
  network: WifiNetworkResponse;
  canWrite: boolean;
  passwordCapability: DeviceDetailResponse["capabilities"]["wifiPasswordWrite"];
  busy: boolean;
  onSave: (band: WifiNetworkResponse["band"], ssid: string) => Promise<void>;
  onPassword: (
    band: WifiNetworkResponse["band"],
    password: string,
  ) => Promise<void>;
}) {
  const [ssid, setSsid] = useState(network.ssid ?? "");
  const [password, setPassword] = useState("");
  useEffect(() => setSsid(network.ssid ?? ""), [network.ssid]);
  const changed = ssid !== (network.ssid ?? "");
  const canWritePassword = canWrite && passwordCapability === "supported";

  return (
    <article className="wifi-card">
      <div className="wifi-card-heading">
        <div>
          <strong>{wifiNetworkLabel(network)}</strong>
          <small>
            {[network.name, network.standard, channelLabel(network.channel)]
              .filter(Boolean)
              .join(" · ") || "Detalhes não informados"}
          </small>
        </div>
        <span className={`wifi-state ${network.status}`}>
          {network.status === "up"
            ? "Ativo"
            : network.status === "down"
              ? "Desativado"
              : "Desconhecido"}
        </span>
      </div>
      <label htmlFor={`ssid-${network.id}`}>SSID</label>
      <input
        id={`ssid-${network.id}`}
        value={ssid}
        onChange={(event) => setSsid(event.target.value)}
        disabled={!canWrite || busy || network.band === "unknown"}
        placeholder="SSID não informado"
        maxLength={32}
      />
      <div className="wifi-card-footer">
        <span>
          {network.connectedDeviceCount === undefined
            ? "Conectados: não informado"
            : `${network.connectedDeviceCount} conectado${network.connectedDeviceCount === 1 ? "" : "s"}`}
        </span>
        <span>{network.enabled === false ? "Rádio desativado" : ""}</span>
      </div>
      <button
        className="secondary"
        disabled={
          !canWrite || busy || network.band === "unknown" || !changed || !ssid
        }
        onClick={() => {
          if (network.band !== "unknown") void onSave(network.band, ssid);
        }}
      >
        Salvar SSID
      </button>
      <div className="wifi-password">
        <label htmlFor={`wifi-password-${network.id}`}>Nova senha</label>
        <input
          id={`wifi-password-${network.id}`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!canWritePassword || busy || network.band === "unknown"}
          placeholder="8 a 63 caracteres"
          minLength={8}
          maxLength={64}
        />
        <button
          className="secondary"
          disabled={
            !canWritePassword ||
            busy ||
            network.band === "unknown" ||
            password.length < 8
          }
          onClick={async () => {
            if (network.band === "unknown") return;
            await onPassword(network.band, password);
            setPassword("");
          }}
        >
          Alterar senha
        </button>
        {passwordCapability !== "supported" && (
          <small>
            {passwordCapability === "experimental"
              ? "Caminho encontrado; aguardando validação controlada no HGU."
              : "Alteração de senha ainda não verificada para este modelo."}
          </small>
        )}
      </div>
    </article>
  );
}

function WifiSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "active" | "inactive" | "unknown" | "neutral";
}) {
  return (
    <article className="wifi-summary-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  );
}

function wifiNetworkLabel(network: WifiNetworkResponse): string {
  const instance = network.id.replace("wlan-", "");
  const band =
    network.band === "2.4ghz"
      ? "2,4 GHz"
      : network.band === "5ghz"
        ? "5 GHz"
        : "banda não informada";
  return `Wi-Fi ${band} · WLAN ${instance}`;
}

function connectedWifiLabel(networks: readonly WifiNetworkResponse[]): string {
  const counts = networks
    .map(({ connectedDeviceCount }) => connectedDeviceCount)
    .filter((value): value is number => value !== undefined);
  if (counts.length === 0) return "Não informado pelo HGU";
  const total = counts.reduce((sum, value) => sum + value, 0);
  return total === 1 ? "1 conexão" : `${total} conexões`;
}

function networkCountLabel(total: number): string {
  return total === 1 ? "1 rede encontrada" : `${total} redes encontradas`;
}

function channelLabel(channel?: number): string | undefined {
  return channel === undefined ? undefined : `Canal ${channel}`;
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Não disponível"}</strong>
    </div>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Erro inesperado.";
}

function formatDate(value?: string): string {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value))
    : "Não disponível";
}

function shortDate(value?: string): string {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Sem contato";
}

function wanLabel(status?: "connected" | "disconnected" | "unknown"): string {
  if (status === "connected") return "Conectada";
  if (status === "disconnected") return "Desconectada";
  return "Desconhecida";
}

function ipModeLabel(device: DeviceDetailResponse): string {
  const hasIpv4 = Boolean(device.wan?.ipv4);
  const hasIpv6 = (device.wan?.ipv6?.length ?? 0) > 0;
  if (hasIpv4 && hasIpv6) return "IPv4 / IPv6";
  if (hasIpv6) return "IPv6";
  if (hasIpv4) return "IPv4";
  return "Não informado";
}

function ipv6StatusLabel(device: DeviceDetailResponse): string {
  if ((device.wan?.ipv6?.length ?? 0) > 0) return "ativo";
  if (device.wan?.ipv6Enabled === false) return "desabilitado";
  if (device.capabilities.ipv6 === "unknown") return "não verificado";
  return "sem endereço";
}

function ipv6DisplayValue(device: DeviceDetailResponse): string {
  const addresses = device.wan?.ipv6 ?? [];
  if (addresses.length > 0) return addresses.join(", ");
  if (device.wan?.ipv6Enabled === false) return "Desabilitado";
  if (device.capabilities.ipv6 === "unknown") return "Não verificado";
  return "Sem endereço atribuído";
}

function operationLabel(value: string): string {
  if (value.startsWith("wifi.ssid.update")) return "Alteração de SSID";
  if (value.startsWith("wifi.password.update"))
    return "Alteração de senha Wi-Fi";
  if (value === "device.reboot") return "Reboot";
  if (value === "device.refresh") return "Atualização de dados";
  return value;
}
