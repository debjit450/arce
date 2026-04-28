import type { Request, RequestHandler } from "express";

import { ArceClient } from "./client";
import type {
  LimitRequestPayload,
  RateLimitAlgorithm,
  ScopeMode
} from "../types";

interface MiddlewareOptions {
  client: ArceClient;
  algorithm?: RateLimitAlgorithm;
  scope?: ScopeMode;
  baseLimitPerMinute?: number;
  resolveUserId?: (request: Request) => string | undefined;
  resolveIp?: (request: Request) => string | undefined;
  resolveFingerprint?: (request: Request) => string | undefined;
}

function defaultIpResolver(request: Request): string | undefined {
  return request.ip || request.socket.remoteAddress || undefined;
}

export function createArceMiddleware(
  options: MiddlewareOptions
): RequestHandler {
  return async (request, response, next) => {
    const payload: LimitRequestPayload = {
      algorithm: options.algorithm ?? "token_bucket",
      scope: options.scope,
      route: request.originalUrl,
      method: request.method,
      userId: options.resolveUserId?.(request),
      ip: options.resolveIp?.(request) ?? defaultIpResolver(request),
      fingerprint:
        options.resolveFingerprint?.(request) ??
        `${request.method}:${request.originalUrl}`,
      baseLimitPerMinute: options.baseLimitPerMinute,
      metadata: {
        userAgent:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : undefined
      }
    };

    try {
      const result = await options.client.consume(payload);
      response.setHeader(
        "x-rate-limit-remaining",
        result.decision.remaining.toString()
      );
      response.setHeader(
        "x-rate-limit-reset-ms",
        result.decision.resetAfterMs.toString()
      );

      if (!result.allowed) {
        response.status(429).json(result);
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
