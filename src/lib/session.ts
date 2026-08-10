import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const SESSION_COOKIE_NAME = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per design doc

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
}

export function createSessionCookieValue(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

function isValidSessionValue(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

// For use in the proxy (edge-adjacent request context), which reads the
// cookie off the incoming NextRequest rather than via next/headers.
export function isValidSessionCookie(value: string | undefined): boolean {
  return isValidSessionValue(value);
}

export async function getSession(): Promise<{ authenticated: boolean }> {
  const store = await cookies();
  return { authenticated: isValidSessionValue(store.get(SESSION_COOKIE_NAME)?.value) };
}

export async function setSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

// Defense in depth for Server Actions: proxy.ts gates page requests, but
// Next.js docs warn a matcher change could silently stop covering a
// Server Function, so every mutating action re-checks auth itself too.
export async function requireAuthenticated() {
  const { authenticated } = await getSession();
  if (!authenticated) {
    throw new Error("Unauthorized");
  }
}
