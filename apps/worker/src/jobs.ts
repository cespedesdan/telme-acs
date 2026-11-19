export const systemQueueName = "telme-system";

export function processSystemJob(name: string): { status: "ok" } {
  if (name !== "health") {
    throw new Error(`Unsupported system job: ${name}`);
  }

  return { status: "ok" };
}
