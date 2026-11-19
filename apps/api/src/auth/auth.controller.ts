import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { SessionResponse } from "@telme/contracts";

import {
  AuthService,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "./auth.service.js";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard.js";

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("session")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
    @Req() request: { ip?: string },
  ): Promise<SessionResponse> {
    const fields = isRecord(body) ? body : {};
    const session = await this.auth.login(
      fields.email,
      fields.password,
      request.ip ?? "local",
    );
    response.setHeader(
      "set-cookie",
      sessionCookie(session.token, SESSION_DURATION_SECONDS),
    );
    return { user: session.user };
  }

  @Delete("session")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: HeaderResponse): void {
    response.setHeader("set-cookie", sessionCookie("", 0));
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest): SessionResponse {
    return { user: request.user };
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sessionCookie(token: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
