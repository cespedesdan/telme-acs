import { webHealth } from "../../../lib/health";

export function GET(): Response {
  return Response.json(webHealth);
}
