import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { URL } from "node:url";

import { GenieAcsClient, GenieAcsError } from "../dist/index.js";

function jsonResponse(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
  };
}

test("uses absolute ISO task expiry and fault-specific queries without leaking faults", async () => {
  const requests = [];
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async (input, init) => {
      requests.push({ url: new URL(input), init });
      return jsonResponse(
        init.method === "POST"
          ? { _id: "task-1" }
          : [{ _id: "CPE/1:task_task-1" }],
        init.method === "POST" ? 202 : 200,
      );
    },
  );
  const expiresAt = new Date("2026-10-06T12:00:00.000Z");
  await client.reboot("CPE/1", { expiresAt });
  assert.equal(
    JSON.parse(requests[0].init.body).expiry,
    expiresAt.toISOString(),
  );
  assert.equal(await client.hasTaskFault("CPE/1", "task-1"), true);
  assert.deepEqual(JSON.parse(requests[1].url.searchParams.get("query")), {
    _id: "CPE/1:task_task-1",
  });
});

test("cancellation is safe when the upstream task has already disappeared", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async (_input, init) => {
      assert.equal(init.method, "DELETE");
      return jsonResponse({}, 404);
    },
  );
  await client.deleteTask("task/1");
});

test("looks up a device with an encoded query and projection", async () => {
  let request;
  const client = new GenieAcsClient(
    {
      baseUrl: "http://genieacs.test:7557",
      username: "acs-user",
      password: "secret",
    },
    async (input, init) => {
      request = { url: new URL(input), init };
      return jsonResponse([
        { _id: "CPE/1", _lastInform: "2026-08-10T12:00:00.000Z" },
      ]);
    },
  );

  const device = await client.getDevice("CPE/1", ["_id", "_lastInform"]);

  assert.equal(request.url.pathname, "/devices/");
  assert.deepEqual(JSON.parse(request.url.searchParams.get("query")), {
    _id: "CPE/1",
  });
  assert.equal(request.url.searchParams.get("projection"), "_id,_lastInform");
  assert.equal(
    request.init.headers.get("authorization"),
    `Basic ${Buffer.from("acs-user:secret").toString("base64")}`,
  );
  assert.equal(device.id, "CPE/1");
  assert.equal(device.lastInformAt.toISOString(), "2026-08-10T12:00:00.000Z");
});

test("distinguishes executed tasks from tasks queued for the next Inform", async () => {
  const statuses = [200, 202];
  const requests = [];
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async (input, init) => {
      requests.push({ url: new URL(input), init });
      const status = statuses.shift();
      return jsonResponse({ _id: `task-${status}` }, status);
    },
  );

  const executed = await client.reboot("CPE/with slash", {
    connectionRequest: true,
  });
  const queued = await client.setParameterValues("CPE-2", [
    ["Verified.Path", "safe-value", "xsd:string"],
  ]);

  assert.deepEqual(executed, {
    deviceId: "CPE/with slash",
    taskName: "reboot",
    state: "executed",
    taskId: "task-200",
  });
  assert.equal(queued.state, "queued");
  assert.equal(requests[0].url.pathname, "/devices/CPE%2Fwith%20slash/tasks");
  assert.equal(requests[0].url.searchParams.has("connection_request"), true);
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    name: "setParameterValues",
    parameterValues: [["Verified.Path", "safe-value", "xsd:string"]],
  });
});

test("reports a present task only as queued", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async () =>
      jsonResponse([{ _id: "task-1", device: "CPE-1", name: "reboot" }]),
  );

  assert.deepEqual(await client.getTask("task-1"), {
    id: "task-1",
    deviceId: "CPE-1",
    name: "reboot",
    state: "queued",
    raw: { _id: "task-1", device: "CPE-1", name: "reboot" },
  });
});

test("returns failed for rejected mutations without leaking an upstream body", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async () => jsonResponse("sensitive upstream error", 400),
  );

  assert.deepEqual(await client.reboot("CPE-1"), {
    deviceId: "CPE-1",
    taskName: "reboot",
    state: "failed",
  });
});

test("maps an aborted operation to timed_out", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    },
  );

  assert.deepEqual(await client.refreshObject("CPE-1"), {
    deviceId: "CPE-1",
    taskName: "refreshObject",
    state: "timed_out",
  });
});

test("preserves forbidden operations as explicit domain errors", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async () => jsonResponse(null, 403),
  );

  await assert.rejects(
    () => client.factoryReset("CPE-1"),
    (error) =>
      error instanceof GenieAcsError && error.code === "FORBIDDEN_OPERATION",
  );
});

test("rejects invalid responses with an explicit domain error", async () => {
  const client = new GenieAcsClient(
    { baseUrl: "http://genieacs.test:7557" },
    async () => jsonResponse({ not: "an array" }),
  );

  await assert.rejects(
    () => client.getDevice("CPE-1"),
    (error) =>
      error instanceof GenieAcsError &&
      error.code === "GENIEACS_INVALID_RESPONSE",
  );
});
