import { isIP } from "node:net";

export function getRegistrationClientIp(headers: Pick<Headers, "get">): string | null {
  const clientIp = headers.get("x-real-ip")?.trim();
  return clientIp && isIP(clientIp) ? clientIp : null;
}
