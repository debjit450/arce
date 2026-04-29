import type { RequestHandler } from "express";

import { runtimeConfig } from "../../../configs/runtime";

/**
 * API key authentication middleware.
 *
 * When `API_KEY` is set in the environment, all protected endpoints require
 * a matching `x-api-key` header. When `API_KEY` is not set, authentication
 * is disabled so local development remains frictionless.
 */
export function createAuthMiddleware(): RequestHandler {
  return (request, response, next) => {
    const configuredKey = runtimeConfig.apiKey;

    if (!configuredKey) {
      next();
      return;
    }

    const provided = request.header("x-api-key");

    if (!provided || provided !== configuredKey) {
      response.status(401).json({
        error: "Unauthorized. Provide a valid x-api-key header."
      });
      return;
    }

    next();
  };
}
