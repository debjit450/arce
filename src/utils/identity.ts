import type { LimitRequestPayload } from "../types";

export function resolveSubject(payload: LimitRequestPayload): string {
  if (payload.scope === "hybrid") {
    return `hybrid:user:${payload.userId}:ip:${payload.ip}`;
  }

  if (payload.scope === "user" && payload.userId) {
    return `user:${payload.userId}`;
  }

  if (payload.scope === "ip" && payload.ip) {
    return `ip:${payload.ip}`;
  }

  if (payload.identifier) {
    return `custom:${payload.identifier}`;
  }

  if (payload.userId) {
    return `user:${payload.userId}`;
  }

  if (payload.ip) {
    return `ip:${payload.ip}`;
  }

  throw new Error("Unable to derive a subject key from the request payload.");
}

export function buildFingerprint(payload: LimitRequestPayload): string {
  return (
    payload.fingerprint?.trim() ||
    `${payload.method.toUpperCase()}:${payload.route}`
  );
}
