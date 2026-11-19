import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadLocalEnvironment, readRedisUrl } from "./config.js";

import { processSystemJob, systemQueueName } from "./jobs.js";

loadLocalEnvironment();

const redis = new Redis(readRedisUrl(), {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  systemQueueName,
  async (job) => processSystemJob(job.name),
  { connection: redis },
);

worker.on("ready", () => {
  console.info("TELME ACS worker ready");
});

worker.on("failed", (job, error) => {
  console.error("TELME ACS worker job failed", {
    error: error.message,
    jobId: job?.id,
    jobName: job?.name,
  });
});

async function shutdown(): Promise<void> {
  await worker.close();
  await redis.quit();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
