import { Redis } from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import { loadLocalEnvironment, readRedisUrl } from "./config.js";
import { systemQueueName } from "./jobs.js";

loadLocalEnvironment();
const redis = new Redis(readRedisUrl(), {
  connectTimeout: 5_000,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: () => null,
});
const queue = new Queue(systemQueueName, { connection: redis });
const events = new QueueEvents(systemQueueName, { connection: redis });

try {
  // Queue constructors may already initiate connection when lazyConnect is set.
  await queue.waitUntilReady();
  await events.waitUntilReady();
  const response = await redis.ping();

  if (response !== "PONG") {
    throw new Error("Redis did not answer PONG");
  }

  // System-only job: proves a worker is consuming, without touching any CPE.
  const job = await queue.add(
    "health",
    {},
    {
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  try {
    const result = await job.waitUntilFinished(events, 5000);
    if (result?.status !== "ok")
      throw new Error("Worker did not answer health job");
  } catch {
    await job.remove().catch(() => undefined);
    throw new Error("Worker health job did not complete within 5 seconds");
  }

  console.info(JSON.stringify({ service: "telme-acs-worker", status: "ok" }));
} finally {
  await events.close();
  await queue.close();
  redis.disconnect();
}
