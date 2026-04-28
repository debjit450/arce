import type { RequestHandler } from "express";

import { PROJECT_NAME } from "../../../configs/constants";

export function createRootHandler(): RequestHandler {
  return (_request, response) => {
    response.json({
      service: PROJECT_NAME,
      endpoints: [
        "/health",
        "/check-limit",
        "/consume",
        "/api/dashboard-data",
        "/dashboard"
      ]
    });
  };
}
