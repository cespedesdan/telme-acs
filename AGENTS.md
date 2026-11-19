# AGENTS.md — TELME ACS

## Mission

Build **TELME ACS**, an internal device-management platform for TELME FIBRA.

The product uses **GenieACS as the TR-069/CWMP engine** and a TELME-owned application layer for:

- IXC Provedor integration;
- HGU/CPE inventory;
- normalized device capabilities;
- Wi-Fi management;
- optical diagnostics;
- reboot/maintenance operations;
- firmware management;
- historical metrics;
- audit logs;
- RBAC;
- NOC/support dashboards.

Core architecture:

```text
CPE/HGU
  |
  | TR-069 / CWMP
  v
Nginx/HAProxy + TLS + IPv4/IPv6
  |
  v
GenieACS
  |
  | NBI/API
  v
TELME ACS API
  |-----------|-------------|
  v           v             v
PostgreSQL   Redis        IXC API
  |
  v
TELME ACS Web
```

**Do not rewrite TR-069 for the MVP.** GenieACS owns CWMP. TELME ACS owns business logic and UX.

---

## Communication

- Code, identifiers, schemas and API fields: English.
- User-facing UI: Brazilian Portuguese (`pt-BR`).
- Reports to the repository owner: concise Brazilian Portuguese.
- Explain decisions that affect security, hardware compatibility or maintainability.

---

## Non-negotiable architecture rules

### GenieACS boundary

Use GenieACS through:

1. NBI/API;
2. provisions;
3. presets;
4. virtual parameters;
5. extensions;
6. configuration.

Do not modify GenieACS core unless a proven requirement cannot reasonably be solved through those mechanisms.

If a core patch becomes necessary, document:

- missing capability;
- patch scope;
- tests;
- upstream/upgrade impact.

### Never query GenieACS MongoDB from TELME code

Forbidden:

```text
TELME API -> GenieACS MongoDB
```

Required:

```text
TELME API -> GenieACS NBI/API -> GenieACS
```

MongoDB is private infrastructure owned by GenieACS.

### Data ownership

**IXC is authoritative** for commercial/subscriber data such as customer, contract, plan, login and address.

**PostgreSQL is authoritative** for TELME ACS data such as:

- users/RBAC;
- device identities;
- device-to-IXC bindings;
- capabilities;
- operations;
- audit logs;
- firmware metadata;
- alerts;
- historical normalized metrics.

IXC data may be cached, but TELME ACS must not silently become the source of truth for customer contracts.

**Redis/BullMQ is ephemeral** and is used for queues, retries, cache, locks and rate limiting.

---

## Initial device fleet

Primary models:

- RTF8225VW
- GPT2742GX4X5
- Huawei HG8145V5
- Huawei HG8145V5-V2

More models will be added later.

### Critical rule: never invent TR-069 paths

Never guess vendor-specific paths for:

- optical RX/TX;
- Wi-Fi SSID/password;
- WAN;
- PPPoE;
- host lists;
- proprietary `X_*` objects;
- firmware operations.

A model/firmware path is considered verified only when backed by:

1. a real sanitized parameter-tree capture;
2. manufacturer documentation valid for the exact model/firmware;
3. an already verified repository mapping;
4. a reviewed discovery result.

When data is unknown:

- mark capability `unknown`;
- create discovery tooling/fixtures;
- document what must be captured;
- do not fabricate a path to finish a feature.

Hardware and firmware revisions may behave differently.

---

## Normalized device model

Frontend and business logic must not depend on raw CWMP paths.

Create normalized TELME concepts such as:

```ts
type CapabilityState =
  | "supported"
  | "unsupported"
  | "unknown"
  | "read-only"
  | "experimental";

interface NormalizedDevice {
  id: string;
  serialNumber: string;
  manufacturer?: string;
  model?: string;
  productClass?: string;
  oui?: string;
  hardwareVersion?: string;
  softwareVersion?: string;

  lastInformAt?: Date;
  onlineState: "online" | "stale" | "offline" | "unknown";

  wan?: {
    status?: "connected" | "disconnected" | "unknown";
    ipv4?: string;
    ipv6?: string[];
    pppoeUsername?: string;
  };

  optical?: {
    rxDbm?: number;
    txDbm?: number;
  };
}
```

Raw parameter paths belong in adapters/normalization code, never scattered through controllers or React components.

---

## Device adapters

Use a dedicated package:

```text
packages/device-adapters/
  src/
    generic/
      tr098/
      tr181/
    huawei/
      hg8145v5/
      hg8145v5-v2/
    rtf8225vw/
    gpt2742gx4x5/
    registry.ts
```

Each adapter may contain:

- identity matching;
- capabilities;
- verified parameter mappings;
- read transforms;
- write transforms;
- units/conversions;
- firmware/hardware constraints;
- validation;
- known limitations.

Prefer:

```ts
const adapter = adapterRegistry.resolve(identity);
const wifi = await adapter.readWifi(context);
```

Avoid model conditionals spread throughout the application.

Use explicit `unknown` vs `unsupported`; they are not the same.

---

## TR-098 / TR-181 / vendor trees

Expect devices to expose combinations of:

```text
InternetGatewayDevice.*
Device.*
vendor-specific objects
```

Do not assume one data model.

GenieACS Virtual Parameters may normalize frequently used values:

```text
VirtualParameters.TelmeModel
VirtualParameters.WanIPv4
VirtualParameters.WanIPv6
VirtualParameters.PppoeUsername
VirtualParameters.Wifi24Ssid
VirtualParameters.Wifi5Ssid
VirtualParameters.OpticalRx
VirtualParameters.OpticalTx
```

Virtual Parameters complement, not replace, the adapter layer.

---

## GenieACS client

Create:

```text
packages/genieacs-client
```

No random GenieACS HTTP calls from controllers.

Expose typed operations such as:

```ts
findDevice(...)
getDevice(...)
refreshParameters(...)
setParameterValues(...)
reboot(...)
factoryReset(...)
downloadFile(...)
createTask(...)
getTask(...)
```

Normalize GenieACS behavior into TELME operation states:

```ts
type DeviceOperationState =
  | "executed"
  | "queued"
  | "failed"
  | "timed_out";
```

A queued task is **not** an applied configuration.

---

## CGNAT and Connection Request

TELME subscribers commonly lack public IPv4.

Assume:

- ordinary CWMP sessions are initiated by the CPE;
- immediate IPv4 Connection Request may fail behind CGNAT;
- IPv6 may be usable;
- STUN/UDP/XMPP support varies;
- tasks may wait for the next Inform.

UI/API status must distinguish:

```text
Applied
Queued for next CPE contact
Failed
Expired
```

Never display "successfully applied" when only queued.

---

## IXC integration

Create:

```text
packages/ixc-client
```

Keep IXC HTTP details out of device logic.

Secrets must come from environment/secrets management.

Preferred device/subscriber correlation:

1. PPPoE/login;
2. MAC;
3. explicit/manual binding;
4. another verified stable identifier.

Do not use dynamic WAN IP as the sole permanent identity.

Store the binding method:

```text
pppoe
mac
manual
import
```

Ambiguous matches must not silently bind a device.

---

## Preferred repository structure

For a new repository, use a pnpm TypeScript monorepo:

```text
telme-acs/
  AGENTS.md
  README.md
  package.json
  pnpm-workspace.yaml

  apps/
    api/                  # NestJS
    web/                  # Next.js
    worker/               # BullMQ jobs

  packages/
    contracts/
    device-model/
    device-adapters/
    genieacs-client/
    ixc-client/
    auth/
    observability/

  genieacs/
    provisions/
    virtual-parameters/
    extensions/
    presets/

  prisma/
    schema.prisma
    migrations/

  infrastructure/
    docker/
    nginx/
    monitoring/

  docs/
    architecture/
    devices/
    security/
    adr/

  .agent/
    PLANS.md
    plans/
```

If meaningful code already exists, do not reorganize only to match this tree.

---

## Default technology stack

- Node.js: project-compatible current LTS.
- TypeScript: strict mode.
- Package manager: pnpm.
- API: NestJS.
- Web: Next.js + React.
- Database: PostgreSQL + Prisma.
- Queue/cache: Redis + BullMQ.
- ACS: GenieACS + dedicated MongoDB.
- Edge: Nginx or HAProxy with TLS and dual-stack when available.
- Observability: structured logs; Prometheus/Grafana where useful.

Do not add infrastructure the MVP does not need.

---

## API principles

Expose TELME domain operations:

```http
GET  /api/v1/devices
GET  /api/v1/devices/:id
GET  /api/v1/devices/:id/wifi
PUT  /api/v1/devices/:id/wifi/2.4ghz
PUT  /api/v1/devices/:id/wifi/5ghz
POST /api/v1/devices/:id/reboot
POST /api/v1/devices/:id/refresh
GET  /api/v1/devices/:id/optical
GET  /api/v1/devices/:id/clients
GET  /api/v1/devices/:id/operations
```

Ordinary users should not manipulate arbitrary raw TR-069 paths.

Low-level engineering endpoints, if implemented, must be privileged and audited.

---

## Security

Treat this platform as privileged ISP infrastructure.

### Never expose publicly unless required

Do not directly expose:

- MongoDB;
- PostgreSQL;
- Redis;
- GenieACS NBI;
- internal admin APIs.

CPE-facing CWMP endpoints may be public as required.

### Never commit secrets

Never commit:

- IXC tokens;
- ACS credentials;
- DB passwords;
- JWT/signing keys;
- TLS private keys;
- vendor passwords;
- production secrets.

Commit only safe placeholders in `.env.example`.

### Validate writes

Validate before issuing device operations, especially:

- SSID;
- Wi-Fi credentials;
- channels/radio configuration;
- WAN/PPPoE values;
- firmware compatibility;
- batch filters.

### Dangerous operations

Use stronger authorization and explicit confirmation for:

- factory reset;
- firmware rollout;
- WAN/PPPoE writes;
- mass reboot;
- mass configuration changes;
- destructive unbinding/deletion.

---

## RBAC

Initial roles:

```text
ADMIN
NOC
SUPPORT_L2
SUPPORT_L1
FIELD_TECHNICIAN
READ_ONLY
```

Implement capability-based permissions, for example:

```text
device.read
device.refresh
wifi.read
wifi.write
optical.read
device.reboot
device.factory_reset
wan.read
wan.write
firmware.read
firmware.deploy
batch.execute
audit.read
admin.users
admin.adapters
admin.integration
```

Do not give Support L1 firmware, factory-reset, WAN or mass-operation privileges by default.

---

## Audit requirements

Every mutation must create an audit record containing, where applicable:

- actor;
- timestamp;
- target device;
- linked IXC entity;
- operation;
- safe before/after summary;
- correlation ID;
- result;
- GenieACS task ID.

Never log plaintext passwords/tokens.

For secret changes record:

```json
{
  "action": "wifi.password.update",
  "previousValue": "[REDACTED]",
  "newValue": "[REDACTED]",
  "result": "queued"
}
```

---

## Firmware

Firmware is model + hardware + software compatibility sensitive.

Track:

- manufacturer;
- model;
- hardware revision;
- current/target software version;
- SHA-256;
- compatibility;
- approval state;
- rollout state.

Never deploy firmware based only on matching model name.

Prefer:

```text
lab -> pilot -> small batch -> percentage rollout -> full rollout
```

Support pause/cancel of future rollout stages.

---

## Real-device discovery workflow

Before declaring a model supported:

1. connect a lab device to GenieACS;
2. capture identity;
3. capture relevant parameter tree;
4. record firmware/hardware revision;
5. identify read/write paths;
6. test Wi-Fi reads;
7. test Wi-Fi writes;
8. test reboot;
9. test optical values where present;
10. test connected-host enumeration;
11. document vendor behavior;
12. add sanitized fixtures;
13. add adapter tests.

Store sanitized captures under:

```text
docs/devices/<model>/
packages/device-adapters/test/fixtures/<model>/
```

Never commit real subscriber credentials or private customer data.

---

## Support matrix

Maintain a matrix for:

```text
Identity
Firmware
WAN state
PPPoE username
IPv4/IPv6
Optical RX/TX
Wi-Fi 2.4
Wi-Fi 5
Wi-Fi writes
Connected clients
Reboot
Factory reset
Firmware upgrade
```

Use `Unknown/Discover` until verified.

---

## Historical metrics

Possible normalized metrics:

- optical RX/TX;
- uptime;
- WAN state;
- Wi-Fi client counts;
- LAN host count;
- CPU/memory if reliably available.

Avoid excessive CWMP polling.

Prefer data collected during normal Inform sessions plus justified scheduled refreshes.

Thresholds must be configurable; do not invent universal optical/Wi-Fi limits.

---

## Testing

CI must not depend on physical CPEs or production IXC.

### Unit tests

Required for:

- adapter matching;
- raw -> normalized transforms;
- normalized -> write transforms;
- capabilities;
- IXC mapping;
- GenieACS mapping;
- validation;
- authorization.

### Integration tests

Mock/stub:

- GenieACS NBI;
- IXC API.

### Fixtures

Use sanitized captured TR-069 trees.

### Critical E2E flow

Eventually cover:

```text
login
search
open device
read Wi-Fi
request Wi-Fi update
see operation status
request reboot
review audit
```

Physical-HGU validation belongs to a separate lab/manual test suite.

---

## Errors

Prefer explicit domain errors:

```text
DEVICE_NOT_FOUND
DEVICE_NOT_LINKED
DEVICE_OFFLINE
CAPABILITY_UNSUPPORTED
CAPABILITY_UNKNOWN
PARAMETER_NOT_VERIFIED
GENIEACS_UNAVAILABLE
IXC_UNAVAILABLE
OPERATION_QUEUED
OPERATION_FAILED
AMBIGUOUS_IXC_MATCH
FIRMWARE_INCOMPATIBLE
FORBIDDEN_OPERATION
```

Never expose stack traces or upstream secrets to the frontend.

Use correlation/request IDs.

---

## UI principles

The UI is for ISP support staff, not CWMP engineers.

Show concepts such as:

```text
Wi-Fi 5 GHz
SSID
Password
Channel
Connected devices
Optical signal
Last contact
```

Do not make operators work with raw parameter paths.

A privileged raw-parameter view may exist for engineering/debugging.

Always show the true operation state.

---

## MVP

First production-oriented MVP:

1. authentication/RBAC;
2. GenieACS connectivity;
3. normalized CPE identity;
4. IXC linking;
5. device search;
6. device details;
7. optical info where verified;
8. Wi-Fi read where verified;
9. Wi-Fi write where verified;
10. reboot;
11. operation state;
12. audit log.

Do not block MVP on AI recommendations, advanced analytics or large-scale automation.

---

## Implementation milestones

### M0 — Foundation

- pnpm monorepo;
- TypeScript strict;
- lint/format/tests;
- `.env.example`;
- Docker development infrastructure;
- local startup docs.

### M1 — GenieACS client

- typed client;
- device lookup;
- refresh;
- set values;
- reboot;
- tasks/status;
- mocked tests.

### M2 — Device model/adapters

- normalized model;
- capability registry;
- adapter interfaces;
- generic TR-098/TR-181 helpers;
- fixture tests.

### M3 — Persistence/RBAC

Build the TELME-owned application persistence and access-control layer without depending on IXC.

- Prisma/PostgreSQL schema;
- users;
- roles and permissions;
- devices;
- optional/manual device bindings;
- capabilities;
- operations;
- audit logs;
- external identifier structure prepared for future integrations.

At this stage, a device must be able to exist and be managed even when it has no IXC relationship.

Do not make `ixc_customer_id`, `ixc_contract_id`, or any other IXC field mandatory in the core device model.

### M4 — First verified model

Prefer **HG8145V5** if available in the lab:

```text
capture -> sanitize -> fixture -> adapter -> tests -> real lab validation
```

Validate on the real lab device, where supported:

- identity;
- model/firmware;
- last contact;
- Wi-Fi read;
- Wi-Fi write;
- optical information;
- WAN information;
- reboot;
- operation state.

Do not invent mappings before the capture exists.

The result of this milestone should be the first genuinely supported HGU in TELME ACS.

### M5 — Web MVP

Create the first operational interface for TELME support staff.

The web application should work without IXC integration.

Initial flows:

- login;
- device search by serial, MAC, PPPoE/login when known, model or other local identifiers;
- device detail page;
- model/firmware;
- last ACS contact;
- Wi-Fi read/write where verified;
- optical information where verified;
- reboot;
- operation status;
- audit history.

When customer information is not yet integrated, display device information directly and allow safe local/manual identification where needed.

Do not block this milestone waiting for IXC.

### M6 — Additional models

Add support using real captures and the same adapter workflow used for the first HGU:

- HG8145V5-V2;
- RTF8225VW;
- GPT2742GX4X5.

For each model:

```text
capture
  -> sanitize
  -> fixture
  -> adapter
  -> automated tests
  -> lab validation
```

The frontend must continue using normalized TELME concepts and must not gain model-specific logic.

The result should be a technically useful ACS capable of managing the primary TELME HGU fleet independently of IXC.

### M7 — IXC integration

Only after the ACS core, adapters and operational UI are stable, integrate IXC Provedor.

Create/use:

```text
packages/ixc-client
```

Implement:

- typed IXC client;
- authentication/configuration;
- subscriber lookup;
- internet login/PPPoE lookup;
- contract/customer lookup required by the product;
- device-to-subscriber correlation;
- safe error handling;
- retries where appropriate;
- mocked integration tests;
- synchronization jobs where necessary.

Preferred correlation order:

1. PPPoE/login;
2. MAC address;
3. explicit/manual binding;
4. another verified stable identifier.

Do not use dynamic WAN IP as the permanent relationship key.

The relationship must remain optional:

```text
TELME Device
   |
   +-- IXC binding: optional
```

Store how the relationship was created, for example:

```text
pppoe
mac
manual
import
```

Ambiguous automatic matches must require review rather than silently linking the wrong subscriber.

After this milestone, the operational flow becomes:

```text
HGU
 |
 v
GenieACS
 |
 v
TELME ACS
 |
 +----> device management
 |
 +----> IXC correlation
          |
          v
        customer
        contract
        plan
        login
```

IXC enriches the TELME ACS experience but must not become a runtime dependency for basic CPE management.

---

## Development commands

For a new repository establish:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

Before completing work, run relevant checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a command cannot run because infrastructure/secrets are unavailable, report exactly what is missing and run all other possible checks.

Never claim a test passed when it did not run.

---

## Database changes

Use migrations for schema changes.

Do not mutate production schema manually from application startup.

For destructive migrations, document:

- impact;
- backfill;
- recovery/rollback;
- audit-history preservation.

---

## Dependencies

Before adding a production dependency:

1. check whether existing stack solves it;
2. prefer maintained packages;
3. avoid duplicate libraries for the same concern;
4. document important runtime dependencies;
5. apply extra scrutiny to security-sensitive packages.

---

## Git/work discipline

- Keep changes focused.
- Do not rewrite unrelated working code.
- Preserve existing behavior unless intentionally changed.
- Add regression tests with bug fixes.
- Update docs when architecture/behavior changes.
- Never commit generated secrets or local `.env`.
- Do not hide failing tests.

---

## ADRs

Material architecture decisions go in:

```text
docs/adr/
```

Format:

```markdown
# ADR-0001: Title

## Status
Accepted

## Context

## Decision

## Consequences
```

Important candidates:

- GenieACS integration boundary;
- IXC source-of-truth policy;
- adapter architecture;
- authentication;
- firmware rollout;
- metrics retention.

---

## ExecPlans

For complex features/refactors/migrations, use an execution plan under:

```text
.agent/plans/
```

If `.agent/PLANS.md` exists, follow it.

A plan should remain self-contained and track:

- purpose;
- relevant current state;
- assumptions/unknowns;
- affected components;
- milestones;
- validation;
- discoveries;
- decisions;
- progress;
- remaining work.

Writing a plan is not the end of an implementation request. Continue implementation unless genuinely blocked by unavailable hardware data, credentials or another real prerequisite.

---

## Missing real-world information

Separate unknowns into:

### Implementable now

- interfaces;
- types;
- adapter framework;
- fixture loader;
- mocked integrations;
- persistence;
- UI states;
- tests.

### Requires TELME environment

- exact unprovided IXC mappings;
- production credentials;
- real CPE tree;
- vendor firmware;
- real Connection Request behavior.

Use configuration/interfaces/placeholders for unavailable environment details.

Do not present fake production data as real.

---

## Lab safety

- Use lab devices for destructive tests.
- Never factory-reset production subscriber equipment casually.
- Never push unverified firmware to customers.
- Test writes on a controlled CPE first.
- Mass operations default to safe/dry-run behavior until explicitly enabled.

---

## Definition of done

A feature is done when applicable:

- code compiles;
- typecheck passes;
- lint passes;
- tests pass;
- behavior works;
- errors are handled;
- authorization is enforced;
- mutations are audited;
- docs are updated;
- secrets are absent;
- device paths are verified rather than guessed;
- limitations are documented.

---

## If the repository is empty

Inspect the repository first, create an ExecPlan, then implement the foundation without unnecessary questions.

Initial deliverable:

1. pnpm workspace;
2. NestJS `apps/api`;
3. Next.js `apps/web`;
4. `apps/worker`;
5. `packages/contracts`;
6. `packages/device-model`;
7. `packages/device-adapters`;
8. `packages/genieacs-client`;
9. `packages/ixc-client`;
10. PostgreSQL/Prisma;
11. Redis/BullMQ;
12. Docker Compose for local infrastructure;
13. `.env.example`;
14. health endpoints;
15. lint/typecheck/test/build scripts;
16. README;
17. initial ADR for the GenieACS/TELME boundary.

Do **not** create fake HG8145V5 paths during scaffolding.

Build the generic adapter/discovery/fixture mechanism first.

---

## Domain invariants

Preserve these rules:

```text
A physical CPE has a stable TELME device identity.

A TELME device may temporarily have no IXC binding.

A subscriber may change equipment over time.

Historical bindings remain auditable.

Queued != applied.

Unknown capability != unsupported capability.

Raw TR-069 data != frontend contract.

Matching model name alone != firmware compatibility.

Public customer IPv4 is not required for ordinary CPE-initiated CWMP.

Production secrets never belong in Git.
```

---

## North-star behavior

A TELME support operator should eventually be able to:

1. search by customer, PPPoE/login, serial or MAC;
2. open the subscriber HGU;
3. see last ACS contact;
4. see model/firmware;
5. see WAN IPv4/IPv6;
6. see optical values when supported;
7. see 2.4/5 GHz state and clients when supported;
8. change Wi-Fi safely;
9. request reboot;
10. know whether the action was applied or queued;
11. review operation history;
12. do all this without knowing raw TR-069 paths.

Optimize architecture toward this outcome without sacrificing correctness, security or device compatibility.
