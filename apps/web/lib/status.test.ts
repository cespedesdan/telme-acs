import { createDeviceCapabilities } from "@telme/device-model";
import { describe, expect, it } from "vitest";

import {
  inventoryMetrics,
  matchesInventoryFilter,
  operationStateLabel,
  onlineStateLabel,
  supportLevel,
  supportLevelLabel,
} from "./status";

describe("support level", () => {
  it("is verified only with supported Wi-Fi write and reboot", () => {
    expect(
      supportLevel(
        createDeviceCapabilities({
          wifiWrite: "supported",
          reboot: "supported",
        }),
      ),
    ).toBe("verified");
  });

  it("is partial for read-only or experimental data", () => {
    expect(
      supportLevel(
        createDeviceCapabilities({
          identity: "supported",
          reboot: "experimental",
        }),
      ),
    ).toBe("partial");
  });

  it("keeps fully unknown devices unverified", () => {
    const level = supportLevel(createDeviceCapabilities());
    expect(level).toBe("unknown");
    expect(supportLevelLabel(level)).toBe("Não verificado");
  });
});

describe("status labels", () => {
  it("does not describe a queued operation as applied", () => {
    expect(operationStateLabel("queued")).toBe("Aguardando contato");
    expect(operationStateLabel("executed")).toBe("Aplicada");
  });

  it("uses operator-friendly online labels", () => {
    expect(onlineStateLabel("stale")).toBe("Contato atrasado");
    expect(onlineStateLabel("unknown")).toBe("Desconhecido");
  });

  it("summarizes inventory and keeps attention states together", () => {
    expect(
      inventoryMetrics(["online", "online", "stale", "unknown", "offline"]),
    ).toEqual({
      total: 5,
      online: 2,
      attention: 2,
      offline: 1,
      availability: 40,
    });
    expect(matchesInventoryFilter("stale", "attention")).toBe(true);
    expect(matchesInventoryFilter("unknown", "attention")).toBe(true);
    expect(matchesInventoryFilter("online", "attention")).toBe(false);
  });
});
