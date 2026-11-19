import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  AdapterRegistry,
  adapterRegistry,
  createAdapterContextFromGenieAcs,
  detectDataModel,
  discoverFixture,
  genericAdapter,
  gpt2742gx4x5Adapter,
  hg8145v5Adapter,
  hg8145v5V2Adapter,
  inventoryGenieAcsDevice,
  inventoryParameterTree,
  isSensitiveParameterPath,
  parseFixture,
  REDACTED_PARAMETER_VALUE,
  readBooleanParameter,
  readNumberParameter,
  readStringParameter,
  sanitizeCapture,
  sanitizeGenieAcsCapture,
  rtf8225vwAdapter,
  rtf8225vwSvAdapter,
  unknownCapabilities,
} from "../dist/index.js";

const hg8145v5FixtureUrl = new URL(
  "./fixtures/huawei/hg8145v5/15ad-a-v5r020c00s270.json",
  import.meta.url,
);
const hg8145v5V2FixtureUrl = new URL(
  "./fixtures/huawei/hg8145v5-v2/313d-a-v5r020c00s406.json",
  import.meta.url,
);
const rtf8225vwFixtureUrl = new URL(
  "./fixtures/rtf8225vw/rev3-v2-9.json",
  import.meta.url,
);
const rtf8225vwSvFixtureUrl = new URL(
  "./fixtures/rtf8225vw/sv-rev4-v2-39.json",
  import.meta.url,
);
const gpt2742gx4x5FixtureUrl = new URL(
  "./fixtures/gpt2742gx4x5/v6-hw2-b14.json",
  import.meta.url,
);

async function loadHg8145v5Fixture() {
  return parseFixture(JSON.parse(await readFile(hg8145v5FixtureUrl, "utf8")));
}

async function loadHg8145v5V2Fixture() {
  return parseFixture(JSON.parse(await readFile(hg8145v5V2FixtureUrl, "utf8")));
}

async function loadFixture(url) {
  return parseFixture(JSON.parse(await readFile(url, "utf8")));
}

test("resolves a specific adapter before the safe generic fallback", () => {
  const labAdapter = {
    ...genericAdapter,
    id: "lab-adapter",
    matches: ({ manufacturer }) => manufacturer === "LAB",
  };
  const registry = new AdapterRegistry([labAdapter]);

  assert.equal(
    registry.resolve({ serialNumber: "A", manufacturer: "LAB" }).id,
    "lab-adapter",
  );
  assert.equal(registry.resolve({ serialNumber: "B" }).id, "generic");
});

test("detects generic TR-098, TR-181 and hybrid roots without vendor paths", () => {
  assert.equal(detectDataModel({ "InternetGatewayDevice.": {} }), "tr098");
  assert.equal(detectDataModel({ "Device.": {} }), "tr181");
  assert.equal(
    detectDataModel({ "InternetGatewayDevice.": {}, "Device.": {} }),
    "hybrid",
  );
  assert.equal(detectDataModel({ "Unverified.Root": {} }), "unknown");
});

test("normalizes identity while leaving unverified capabilities unknown", () => {
  const normalized = genericAdapter.normalize({
    id: "device-1",
    identity: { serialNumber: "SANITIZED", manufacturer: "LAB" },
    parameters: { "Device.": {} },
  });

  assert.equal(normalized.dataModel, "tr181");
  assert.equal(normalized.onlineState, "unknown");
  assert.equal(normalized.manufacturer, "LAB");
  assert.ok(
    Object.values(normalized.capabilities).every(
      (state) => state === "unknown",
    ),
  );
  assert.equal(normalized.capabilities, unknownCapabilities);
});

test("reads typed values only from explicitly supplied parameter paths", () => {
  const tree = {
    "Verified.String": { _value: "SSID" },
    "Verified.Number": { _value: "12.5" },
    "Verified.Boolean": { _value: "1" },
  };

  assert.equal(readStringParameter(tree, "Verified.String"), "SSID");
  assert.equal(readNumberParameter(tree, "Verified.Number"), 12.5);
  assert.equal(readBooleanParameter(tree, "Verified.Boolean"), true);
  assert.equal(readStringParameter(tree, "Unknown.Path"), undefined);
});

test("loads and discovers an explicitly synthetic sanitized fixture", async () => {
  const raw = JSON.parse(
    await readFile(
      new URL("./fixtures/generic/synthetic-hybrid.json", import.meta.url),
      "utf8",
    ),
  );
  const fixture = parseFixture(raw);
  const result = discoverFixture(fixture);

  assert.equal(fixture.source, "synthetic-test");
  assert.equal(result.adapterId, "generic");
  assert.equal(result.dataModel, "hybrid");
  assert.deepEqual(result.observedParameterPaths, [
    "Device.",
    "InternetGatewayDevice.",
  ]);
});

test("rejects fixtures without a traceable source", () => {
  assert.throws(
    () =>
      parseFixture({
        schemaVersion: 1,
        capturedAt: "2026-08-10T00:00:00.000Z",
        identity: { serialNumber: "SANITIZED" },
        parameters: {},
      }),
    /source is invalid/,
  );
});

test("inventories paths and types without exposing captured values", () => {
  const inventory = inventoryParameterTree({
    "Synthetic.Metric": { _value: -17.5 },
    "Synthetic.Password": { _value: "must-not-leak" },
  });

  assert.deepEqual(inventory, [
    {
      path: "Synthetic.Metric",
      valueKind: "number",
      sensitiveByName: false,
    },
    {
      path: "Synthetic.Password",
      valueKind: "string",
      sensitiveByName: true,
    },
  ]);
  assert.equal(JSON.stringify(inventory).includes("must-not-leak"), false);
});

test("creates an allowlisted fixture and redacts sensitive values", () => {
  const fixture = sanitizeCapture({
    capturedAt: "2026-08-10T00:00:00.000Z",
    serialNumberAlias: "LAB-001",
    identity: {
      manufacturer: "SYNTHETIC",
      model: "TEST-ONLY",
      hardwareVersion: "TEST-HW",
      softwareVersion: "TEST-SW",
    },
    parameters: {
      "Synthetic.Metric": { _value: -17.5, ignoredMetadata: "discarded" },
      "Synthetic.Password": { _value: "must-not-leak" },
      "Synthetic.Unselected": { _value: "not-copied" },
    },
    selections: [
      { path: "Synthetic.Metric", mode: "include" },
      { path: "Synthetic.Password", mode: "redact" },
    ],
  });

  assert.equal(fixture.source, "sanitized-capture");
  assert.equal(fixture.identity.serialNumber, "SANITIZED-LAB-001");
  assert.deepEqual(fixture.parameters, {
    "Synthetic.Metric": { _value: -17.5 },
    "Synthetic.Password": { _value: REDACTED_PARAMETER_VALUE },
  });
});

test("refuses to include a value whose path looks sensitive", () => {
  assert.throws(
    () =>
      sanitizeCapture({
        capturedAt: "2026-08-10T00:00:00.000Z",
        serialNumberAlias: "LAB-001",
        identity: { model: "TEST-ONLY" },
        parameters: { "Synthetic.SSID": { _value: "subscriber-name" } },
        selections: [{ path: "Synthetic.SSID", mode: "include" }],
      }),
    /must be redacted/,
  );
});

test("handles a nested GenieACS response without exposing metadata or values", () => {
  const rawDevice = {
    _id: "must-not-leak",
    _deviceId: { _SerialNumber: "must-not-leak" },
    Device: {
      Synthetic: {
        Metric: { _value: 42, _timestamp: "ignored" },
        Password: { _value: "must-not-leak" },
      },
    },
  };

  const inventory = inventoryGenieAcsDevice(rawDevice);
  assert.deepEqual(inventory, [
    {
      path: "Device.Synthetic.Metric",
      valueKind: "number",
      sensitiveByName: false,
    },
    {
      path: "Device.Synthetic.Password",
      valueKind: "string",
      sensitiveByName: true,
    },
  ]);
  assert.equal(JSON.stringify(inventory).includes("must-not-leak"), false);

  const fixture = sanitizeGenieAcsCapture({
    capturedAt: "2026-08-10T00:00:00.000Z",
    serialNumberAlias: "LAB-002",
    identity: { model: "TEST-ONLY" },
    rawDevice,
    selections: [
      { path: "Device.Synthetic.Metric", mode: "include" },
      { path: "Device.Synthetic.Password", mode: "redact" },
    ],
  });
  assert.deepEqual(fixture.parameters, {
    "Device.Synthetic.Metric": { _value: 42 },
    "Device.Synthetic.Password": { _value: REDACTED_PARAMETER_VALUE },
  });
});

test("creates a normalized adapter context from a GenieACS response", () => {
  const context = createAdapterContextFromGenieAcs(
    {
      _id: "safe-device-id",
      _deviceId: {
        _Manufacturer: "Huawei Technologies Co., Ltd",
        _OUI: "00259E",
        _ProductClass: "HG8145V5",
        _SerialNumber: "SANITIZED-SERIAL",
      },
      _lastInform: "2026-08-12T12:00:00.000Z",
      InternetGatewayDevice: {
        DeviceInfo: {
          HardwareVersion: { _value: "15AD.A" },
          SoftwareVersion: { _value: "V5R020C00S270" },
        },
      },
    },
    new Date("2026-08-12T12:04:00.000Z"),
  );

  assert.equal(context.id, "safe-device-id");
  assert.equal(context.identity.serialNumber, "SANITIZED-SERIAL");
  assert.equal(context.identity.model, "HG8145V5");
  assert.equal(context.identity.hardwareVersion, "15AD.A");
  assert.equal(context.onlineState, "online");
});

test("resolves only the captured HG8145V5 hardware and firmware", async () => {
  const fixture = await loadHg8145v5Fixture();

  assert.equal(
    adapterRegistry.resolve(fixture.identity).id,
    hg8145v5Adapter.id,
  );
  assert.equal(
    adapterRegistry.resolve({
      ...fixture.identity,
      softwareVersion: "UNVERIFIED-FIRMWARE",
    }).id,
    "generic",
  );
});

test("keeps all sensitive values redacted in the HG8145V5 fixture", async () => {
  const fixture = await loadHg8145v5Fixture();

  for (const [path, value] of Object.entries(fixture.parameters)) {
    if (isSensitiveParameterPath(path)) {
      assert.deepEqual(value, { _value: REDACTED_PARAMETER_VALUE });
    }
  }
});

test("normalizes verified HG8145V5 WAN, optical and Wi-Fi reads", async () => {
  const fixture = await loadHg8145v5Fixture();
  const parameters = {
    ...fixture.parameters,
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": {
      _value: "TELME-FIXTURE-24",
    },
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID": {
      _value: "TELME-FIXTURE-5",
    },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress":
      {
        _value: "198.51.100.10",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username":
      {
        _value: "fixture-user",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_HW_IPv6.IPv6Address.1.IPAddress":
      {
        _value: "2001:db8::10",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_HW_IPv6Enable":
      {
        _value: true,
      },
  };
  const context = {
    id: "sanitized-device",
    identity: fixture.identity,
    parameters,
  };

  const normalized = hg8145v5Adapter.normalize(context);
  assert.equal(normalized.dataModel, "tr098");
  assert.deepEqual(normalized.wan, {
    status: "connected",
    ipv4: "198.51.100.10",
    ipv6: ["2001:db8::10"],
    ipv6Enabled: true,
    pppoeUsername: "fixture-user",
  });
  assert.deepEqual(normalized.optical, { rxDbm: -21, txDbm: 2 });
  assert.equal(normalized.capabilities.opticalRx, "read-only");
  assert.equal(normalized.capabilities.opticalTx, "read-only");
  assert.equal(normalized.capabilities.reboot, "supported");
  assert.deepEqual(hg8145v5Adapter.readWifi?.(context), [
    {
      id: "wlan-1",
      band: "2.4ghz",
      ssid: "TELME-FIXTURE-24",
      enabled: true,
      status: "up",
      standard: "11bgn",
      channel: 9,
    },
    {
      id: "wlan-4",
      band: "5ghz",
      ssid: "TELME-FIXTURE-5",
      enabled: true,
      status: "up",
      standard: "11ac",
      channel: 36,
    },
  ]);
});

test("builds only the verified SSID writes and validates UTF-8 length", () => {
  assert.deepEqual(
    hg8145v5Adapter.buildWifiSsidWrite?.("2.4ghz", "TELME-M4-24"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
        "TELME-M4-24",
        "xsd:string",
      ],
    ],
  );
  assert.deepEqual(hg8145v5Adapter.buildWifiSsidWrite?.("5ghz", "TELME-M4-5"), [
    [
      "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID",
      "TELME-M4-5",
      "xsd:string",
    ],
  ]);
  assert.throws(
    () => hg8145v5Adapter.buildWifiSsidWrite?.("2.4ghz", "a".repeat(33)),
    /1-32 UTF-8 bytes/,
  );
  assert.throws(
    () => hg8145v5Adapter.buildWifiSsidWrite?.("2.4ghz", "á".repeat(17)),
    /1-32 UTF-8 bytes/,
  );
  assert.throws(
    () => hg8145v5Adapter.buildWifiSsidWrite?.("2.4ghz", "bad\nssid"),
    /control characters/,
  );
});

test("builds only captured Wi-Fi password paths and validates WPA secrets", () => {
  assert.deepEqual(
    hg8145v5Adapter.buildWifiPasswordWrite?.("2.4ghz", "safe-lab-password"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase",
        "safe-lab-password",
        "xsd:string",
      ],
    ],
  );
  assert.throws(
    () => hg8145v5Adapter.buildWifiPasswordWrite?.("5ghz", "short"),
    /8-63 printable ASCII/,
  );
  assert.equal(hg8145v5Adapter.capabilities.wifiPasswordWrite, "experimental");
});

test("resolves only the captured HG8145V5-V2 hardware and firmware", async () => {
  const fixture = await loadHg8145v5V2Fixture();

  assert.equal(
    adapterRegistry.resolve(fixture.identity).id,
    hg8145v5V2Adapter.id,
  );
  assert.equal(
    adapterRegistry.resolve({
      ...fixture.identity,
      softwareVersion: "UNVERIFIED-FIRMWARE",
    }).id,
    "generic",
  );
});

test("keeps all sensitive values redacted in the HG8145V5-V2 fixture", async () => {
  const fixture = await loadHg8145v5V2Fixture();

  for (const [path, value] of Object.entries(fixture.parameters)) {
    if (isSensitiveParameterPath(path)) {
      assert.deepEqual(value, { _value: REDACTED_PARAMETER_VALUE });
    }
  }
});

test("normalizes verified HG8145V5-V2 WAN, optical and Wi-Fi reads", async () => {
  const fixture = await loadHg8145v5V2Fixture();
  const parameters = {
    ...fixture.parameters,
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": {
      _value: "TELME-V2-24",
    },
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID": {
      _value: "TELME-V2-5",
    },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress":
      {
        _value: "201.7.165.102",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username":
      {
        _value: "v2-pppoe-user",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_HW_IPv6.IPv6Address.1.IPAddress":
      {
        _value: "2804:704:b800:0:d877:7d0a:2aa8:55f6",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_HW_IPv6Enable":
      {
        _value: true,
      },
  };
  const context = {
    id: "sanitized-v2-device",
    identity: fixture.identity,
    parameters,
  };

  const normalized = hg8145v5V2Adapter.normalize(context);
  assert.equal(normalized.dataModel, "tr098");
  assert.deepEqual(normalized.wan, {
    status: "connected",
    ipv4: "201.7.165.102",
    ipv6: ["2804:704:b800:0:d877:7d0a:2aa8:55f6"],
    ipv6Enabled: true,
    pppoeUsername: "v2-pppoe-user",
  });
  assert.deepEqual(normalized.optical, { rxDbm: -21, txDbm: 2 });
  assert.equal(normalized.capabilities.opticalRx, "read-only");
  assert.equal(normalized.capabilities.opticalTx, "read-only");
  assert.equal(normalized.capabilities.reboot, "supported");
  assert.deepEqual(hg8145v5V2Adapter.readWifi?.(context), [
    {
      id: "wlan-1",
      band: "2.4ghz",
      ssid: "TELME-V2-24",
      enabled: true,
      status: "up",
      standard: "11bgn",
      channel: 11,
      connectedDeviceCount: 0,
    },
    {
      id: "wlan-4",
      band: "5ghz",
      ssid: "TELME-V2-5",
      enabled: true,
      status: "up",
      standard: "11ac",
      channel: 149,
      connectedDeviceCount: 0,
    },
  ]);
});

test("builds only the verified HG8145V5-V2 SSID writes and validates UTF-8 length", () => {
  assert.deepEqual(
    hg8145v5V2Adapter.buildWifiSsidWrite?.("2.4ghz", "TELME-V2-SSID-24"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
        "TELME-V2-SSID-24",
        "xsd:string",
      ],
    ],
  );
  assert.deepEqual(
    hg8145v5V2Adapter.buildWifiSsidWrite?.("5ghz", "TELME-V2-SSID-5"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID",
        "TELME-V2-SSID-5",
        "xsd:string",
      ],
    ],
  );
  assert.throws(
    () => hg8145v5V2Adapter.buildWifiSsidWrite?.("2.4ghz", "a".repeat(33)),
    /1-32 UTF-8 bytes/,
  );
});

test("resolves only the captured RTF8225VW revisions and GPT firmware", async () => {
  const [rtf, rtfSv, gpt] = await Promise.all([
    loadFixture(rtf8225vwFixtureUrl),
    loadFixture(rtf8225vwSvFixtureUrl),
    loadFixture(gpt2742gx4x5FixtureUrl),
  ]);

  assert.equal(adapterRegistry.resolve(rtf.identity).id, rtf8225vwAdapter.id);
  assert.equal(
    adapterRegistry.resolve(rtfSv.identity).id,
    rtf8225vwSvAdapter.id,
  );
  assert.equal(
    adapterRegistry.resolve(gpt.identity).id,
    gpt2742gx4x5Adapter.id,
  );
  for (const fixture of [rtf, rtfSv, gpt]) {
    assert.equal(
      adapterRegistry.resolve({
        ...fixture.identity,
        softwareVersion: "UNVERIFIED-FIRMWARE",
      }).id,
      "generic",
    );
  }
});

test("keeps sensitive values redacted in every M6 fixture", async () => {
  const fixtures = await Promise.all([
    loadFixture(rtf8225vwFixtureUrl),
    loadFixture(rtf8225vwSvFixtureUrl),
    loadFixture(gpt2742gx4x5FixtureUrl),
  ]);
  for (const fixture of fixtures) {
    for (const [path, value] of Object.entries(fixture.parameters)) {
      if (isSensitiveParameterPath(path)) {
        assert.deepEqual(value, { _value: REDACTED_PARAMETER_VALUE });
      }
    }
  }
});

test("normalizes RTF8225VW REV3 UNIQUE_SSID and every captured Wi-Fi", async () => {
  const fixture = await loadFixture(rtf8225vwFixtureUrl);
  const parameters = {
    ...fixture.parameters,
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": {
      _value: "TELME-RTF-24",
    },
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID": {
      _value: "TELME-RTF-5",
    },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress":
      {
        _value: "198.51.100.20",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username":
      {
        _value: "fixture-rtf-user",
      },
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_VIVO_COM_BR_ExternalIPv6Address":
      {
        _value: "2001:db8::20",
      },
  };
  const context = {
    id: "sanitized-rtf",
    identity: fixture.identity,
    parameters,
  };

  assert.deepEqual(rtf8225vwAdapter.normalize(context).wan, {
    status: "connected",
    ipv4: "198.51.100.20",
    ipv6: ["2001:db8::20"],
    ipv6Enabled: true,
    pppoeUsername: "fixture-rtf-user",
  });
  const wifi = rtf8225vwAdapter.readWifi?.(context) ?? [];
  assert.equal(rtf8225vwAdapter.readWifiUnifiedSsid?.(context), true);
  assert.equal(wifi.length, 6);
  assert.deepEqual(
    wifi.map(({ id, band, enabled, connectedDeviceCount }) => ({
      id,
      band,
      enabled,
      connectedDeviceCount,
    })),
    [
      { id: "wlan-1", band: "2.4ghz", enabled: true, connectedDeviceCount: 0 },
      { id: "wlan-2", band: "2.4ghz", enabled: false, connectedDeviceCount: 0 },
      { id: "wlan-3", band: "2.4ghz", enabled: false, connectedDeviceCount: 0 },
      { id: "wlan-4", band: "2.4ghz", enabled: false, connectedDeviceCount: 0 },
      { id: "wlan-5", band: "5ghz", enabled: true, connectedDeviceCount: 2 },
      { id: "wlan-6", band: "5ghz", enabled: false, connectedDeviceCount: 0 },
    ],
  );
  assert.equal(rtf8225vwAdapter.capabilities.wifiWrite, "experimental");
  assert.equal(rtf8225vwAdapter.capabilities.reboot, "experimental");
  assert.deepEqual(
    rtf8225vwAdapter.buildWifiSsidWrite?.("5ghz", "TELME-M6-5"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
        "TELME-M6-5",
        "xsd:string",
      ],
    ],
  );
});

test("keeps partial WAN data explicit and normalizes captured GPT IPv6", async () => {
  const [rtfSv, gpt] = await Promise.all([
    loadFixture(rtf8225vwSvFixtureUrl),
    loadFixture(gpt2742gx4x5FixtureUrl),
  ]);
  const path =
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress";
  for (const [adapter, fixture] of [
    [rtf8225vwSvAdapter, rtfSv],
    [gpt2742gx4x5Adapter, gpt],
  ]) {
    const normalized = adapter.normalize({
      id: "sanitized-partial",
      identity: fixture.identity,
      parameters: {
        ...fixture.parameters,
        [path]: { _value: "198.51.100.30" },
      },
    });
    assert.deepEqual(normalized.wan, {
      status: "unknown",
      ipv4: "198.51.100.30",
    });
    assert.equal(normalized.capabilities.reboot, "unknown");
  }
  assert.equal(rtf8225vwSvAdapter.capabilities.wifi24, "unknown");
  assert.equal(gpt2742gx4x5Adapter.capabilities.wifi24, "supported");
  assert.equal(gpt2742gx4x5Adapter.capabilities.wifi5, "supported");
  assert.equal(gpt2742gx4x5Adapter.capabilities.ipv6, "read-only");
  assert.deepEqual(
    gpt2742gx4x5Adapter.normalize({
      id: "sanitized-gpt-ipv6",
      identity: gpt.identity,
      parameters: {
        ...gpt.parameters,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_VIVO_COM_BR_ExternalIPv6Address":
          { _value: "2001:db8::30" },
      },
    }).wan,
    {
      status: "unknown",
      ipv6: ["2001:db8::30"],
      ipv6Enabled: true,
    },
  );
  assert.deepEqual(
    gpt2742gx4x5Adapter.buildWifiPasswordWrite?.("5ghz", "safe-gpt-password"),
    [
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase",
        "safe-gpt-password",
        "xsd:string",
      ],
    ],
  );
  assert.equal(
    rtf8225vwSvAdapter.readWifi?.({
      id: "sanitized-rtf-sv",
      identity: rtfSv.identity,
      parameters: rtfSv.parameters,
    }).length,
    3,
  );
  assert.deepEqual(
    gpt2742gx4x5Adapter.readWifi?.({
      id: "sanitized-gpt",
      identity: gpt.identity,
      parameters: gpt.parameters,
    }),
    [
      {
        id: "wlan-1",
        band: "2.4ghz",
        enabled: true,
        status: "up",
        name: "ra0",
        standard: "ax",
        channel: 11,
        connectedDeviceCount: 2,
      },
      {
        id: "wlan-5",
        band: "5ghz",
        enabled: true,
        status: "up",
        name: "rai0",
        standard: "ax",
        channel: 149,
        connectedDeviceCount: 5,
      },
      {
        id: "wlan-6",
        band: "5ghz",
        enabled: true,
        status: "up",
        name: "rai1",
        standard: "ax",
        channel: 149,
        connectedDeviceCount: 0,
      },
    ],
  );
  assert.equal(
    gpt2742gx4x5Adapter.readWifiUnifiedSsid?.({
      id: "sanitized-gpt",
      identity: gpt.identity,
      parameters: gpt.parameters,
    }),
    true,
  );
});
