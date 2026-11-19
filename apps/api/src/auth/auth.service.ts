import { Inject, Injectable, HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  createSessionToken,
  ROLE_PERMISSIONS,
  verifyPassword,
  verifySessionToken,
  type UserRole,
} from "@telme/auth";
import type { SessionUser } from "@telme/contracts";
import { unauthorized, databaseUnavailable } from "../http-errors.js";
import {
  InfrastructureService,
  requireEnvironment,
} from "../infrastructure.service.js";

export const SESSION_COOKIE = "telme_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

@Injectable()
export class AuthService {
  // Bounded per-process limit; use Redis if API gains multiple replicas.
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}

  async login(
    emailValue: unknown,
    passwordValue: unknown,
    source = "local",
  ): Promise<{ token: string; user: SessionUser }> {
    const email = requireEmail(emailValue);
    const password = requirePassword(passwordValue);
    this.limit(`source:${source}`);
    this.limit(`account:${email}`);
    const user = await this.infrastructure.database.user
      .findUnique({ where: { email } })
      .catch(() => {
        throw databaseUnavailable();
      });
    const matches = await verifyPassword(
      password,
      user?.passwordHash ?? "invalid$invalid$invalid",
    );
    if (!user?.isActive || !matches) throw unauthorized();
    this.attempts.delete(`account:${email}`);
    return {
      token: createSessionToken(
        user.id,
        requireEnvironment("SESSION_SECRET"),
        new Date(Date.now() + SESSION_DURATION_SECONDS * 1000),
      ),
      user: toSessionUser(user),
    };
  }

  async authenticate(token: string | undefined): Promise<SessionUser> {
    if (!token) throw unauthorized();
    const claims = verifySessionToken(
      token,
      requireEnvironment("SESSION_SECRET"),
    );
    if (!claims) throw unauthorized();
    const user = await this.infrastructure.database.user
      .findUnique({ where: { id: claims.sub } })
      .catch(() => {
        throw databaseUnavailable();
      });
    if (!user?.isActive) throw unauthorized();
    return toSessionUser(user);
  }

  private limit(key: string): void {
    const now = Date.now();
    for (const [entry, attempt] of this.attempts)
      if (attempt.expires <= now) this.attempts.delete(entry);
    const previous = this.attempts.get(key);
    if (
      (!previous && this.attempts.size >= 10000) ||
      (previous && previous.count >= 30)
    )
      throw new HttpException(
        {
          code: "LOGIN_RATE_LIMITED",
          message: "Muitas tentativas. Aguarde alguns minutos.",
          correlationId: randomUUID(),
        },
        429,
      );
    this.attempts.set(key, {
      count: (previous?.count ?? 0) + 1,
      expires: previous?.expires ?? now + 300000,
    });
  }
}

function toSessionUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
}): SessionUser {
  const role = user.role as UserRole;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role,
    isActive: true,
    permissions: ROLE_PERMISSIONS[role],
  };
}

function requireEmail(value: unknown): string {
  if (typeof value !== "string") throw unauthorized();
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !email.includes("@")) throw unauthorized();
  return email;
}

function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length > 128) throw unauthorized();
  return value;
}
