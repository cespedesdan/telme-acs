import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { SessionUser } from "@telme/contracts";

import { AuthService, SESSION_COOKIE } from "./auth.service.js";

export interface AuthenticatedRequest {
  headers: Readonly<Record<string, string | string[] | undefined>>;
  user: SessionUser;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticate(
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );
    return true;
  }
}

function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value
    ?.split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([key]) => key === name)?.[1];
}
