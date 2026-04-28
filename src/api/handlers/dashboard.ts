import path from "node:path";

import type { RequestHandler } from "express";

import { LimiterService } from "../../core/limiter-service";
import { asyncHandler } from "../../utils/async-handler";

export function createDashboardDataHandler(
  limiterService: LimiterService
): RequestHandler {
  return asyncHandler(async (_request, response) => {
    const snapshot = await limiterService.getDashboardSnapshot();
    response.json(snapshot);
  });
}

export function createDashboardPageHandler(
  dashboardPublicDir: string
): RequestHandler {
  return (_request, response) => {
    response.sendFile(path.join(dashboardPublicDir, "dashboard.html"));
  };
}
