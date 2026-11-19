export const USER_ROLES = [
  "ADMIN",
  "NOC",
  "SUPPORT_L2",
  "SUPPORT_L1",
  "FIELD_TECHNICIAN",
  "READ_ONLY",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  "device.read",
  "device.refresh",
  "device.bind",
  "wifi.read",
  "wifi.write",
  "optical.read",
  "device.reboot",
  "device.factory_reset",
  "wan.read",
  "wan.write",
  "firmware.read",
  "firmware.deploy",
  "batch.execute",
  "audit.read",
  "admin.users",
  "admin.adapters",
  "admin.integration",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissions = (...values: Permission[]): readonly Permission[] =>
  Object.freeze(values);

export const ROLE_PERMISSIONS: Readonly<
  Record<UserRole, readonly Permission[]>
> = Object.freeze({
  ADMIN: permissions(...PERMISSIONS),
  NOC: permissions(
    "device.read",
    "device.refresh",
    "device.bind",
    "wifi.read",
    "wifi.write",
    "optical.read",
    "device.reboot",
    "device.factory_reset",
    "wan.read",
    "wan.write",
    "firmware.read",
    "firmware.deploy",
    "batch.execute",
    "audit.read",
  ),
  SUPPORT_L2: permissions(
    "device.read",
    "device.refresh",
    "wifi.read",
    "wifi.write",
    "optical.read",
    "device.reboot",
    "wan.read",
    "firmware.read",
    "audit.read",
  ),
  SUPPORT_L1: permissions(
    "device.read",
    "device.refresh",
    "wifi.read",
    "wifi.write",
    "optical.read",
    "device.reboot",
  ),
  FIELD_TECHNICIAN: permissions(
    "device.read",
    "device.refresh",
    "wifi.read",
    "wifi.write",
    "optical.read",
    "device.reboot",
    "wan.read",
  ),
  READ_ONLY: permissions(
    "device.read",
    "wifi.read",
    "optical.read",
    "wan.read",
    "firmware.read",
    "audit.read",
  ),
});

export interface AuthorizationSubject {
  role: UserRole;
  isActive: boolean;
}

export class AuthorizationError extends Error {
  public readonly code = "FORBIDDEN_OPERATION";

  public constructor() {
    super("The actor is not allowed to perform this operation.");
    this.name = "AuthorizationError";
  }
}

export function hasPermission(
  subject: AuthorizationSubject,
  permission: Permission,
): boolean {
  if (!subject.isActive) return false;
  const configured = (
    ROLE_PERMISSIONS as Partial<Record<string, readonly Permission[]>>
  )[subject.role];
  return configured?.includes(permission) ?? false;
}

export function requirePermission(
  subject: AuthorizationSubject,
  permission: Permission,
): void {
  if (!hasPermission(subject, permission)) throw new AuthorizationError();
}

const PASSWORD_KEY_LENGTH = 64;
const SESSION_VERSION = "v1";

export interface SessionClaims {
  sub: string;
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encodedHash.split("$");
  const validFormat =
    algorithm === "scrypt" &&
    saltValue !== undefined &&
    hashValue !== undefined;
  const salt = validFormat
    ? Buffer.from(saltValue, "base64url")
    : Buffer.alloc(16);
  const expected = validFormat
    ? Buffer.from(hashValue, "base64url")
    : Buffer.alloc(PASSWORD_KEY_LENGTH);
  const actual = await scrypt(password, salt);
  return (
    validFormat &&
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

export function createSessionToken(
  userId: string,
  secret: string,
  expiresAt: Date,
): string {
  requireSessionSecret(secret);
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(expiresAt.valueOf() / 1000),
    }),
  ).toString("base64url");
  const unsigned = `${SESSION_VERSION}.${payload}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = new Date(),
): SessionClaims | null {
  requireSessionSecret(secret);
  const [version, payload, signature] = token.split(".");
  if (
    version !== SESSION_VERSION ||
    payload === undefined ||
    signature === undefined
  ) {
    return null;
  }
  const unsigned = `${version}.${payload}`;
  const expected = Buffer.from(sign(unsigned, secret), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    if (
      !isRecord(claims) ||
      typeof claims.sub !== "string" ||
      claims.sub.length === 0 ||
      typeof claims.exp !== "number" ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Math.floor(now.valueOf() / 1000)
    ) {
      return null;
    }
    return { sub: claims.sub, exp: claims.exp };
  } catch {
    return null;
  }
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new TypeError("Password must contain between 12 and 128 characters.");
  }
}

function requireSessionSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("Session secret must contain at least 32 bytes.");
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
