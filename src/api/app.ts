import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";
import path from "node:path";

import {
  createDashboardDataHandler,
  createDashboardPageHandler
} from "./handlers/dashboard";
import { createHealthHandler } from "./handlers/health";
import { createLimitHandler } from "./handlers/limit";
import { createRootHandler } from "./handlers/root";
import { LimiterService } from "../core/limiter-service";
import type { RedisClient } from "../store/redis";

interface CreateServerAppArgs {
  limiterService: LimiterService;
  redis: RedisClient;
  dashboardPublicDir: string;
}

export function createServerApp(args: CreateServerAppArgs): Express {
  const app = express();
  const staticDir = path.resolve(args.dashboardPublicDir);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/static", express.static(staticDir));

  app.get("/", createRootHandler());
  app.get("/health", createHealthHandler(args.redis));
  app.post("/check-limit", createLimitHandler(args.limiterService, false));
  app.post("/consume", createLimitHandler(args.limiterService, true));
  app.get(
    "/api/dashboard-data",
    createDashboardDataHandler(args.limiterService)
  );
  app.get("/dashboard", createDashboardPageHandler(staticDir));
  app.use((_request, response) => {
    response.status(404).json({
      error: "Route not found"
    });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      if (error instanceof Error) {
        response.status(400).json({
          error: error.message
        });
        return;
      }

      response.status(500).json({
        error: "Unexpected server error"
      });
    }
  );

  return app;
}
