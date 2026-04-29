import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";
import path from "node:path";

import { ZodError } from "zod";

import {
  createDashboardDataHandler,
  createDashboardPageHandler
} from "./handlers/dashboard";
import { createHealthHandler } from "./handlers/health";
import { createLimitHandler } from "./handlers/limit";
import { createRootHandler } from "./handlers/root";
import { createAuthMiddleware } from "./middleware/auth";
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
  const auth = createAuthMiddleware();

  app.disable("x-powered-by");

  // Security headers
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("X-XSS-Protection", "1; mode=block");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use("/static", express.static(staticDir));

  // Public endpoints
  app.get("/", createRootHandler());
  app.get("/health", createHealthHandler(args.redis));
  app.get("/dashboard", createDashboardPageHandler(staticDir));

  // Protected endpoints
  app.post(
    "/check-limit",
    auth,
    createLimitHandler(args.limiterService, false)
  );
  app.post("/consume", auth, createLimitHandler(args.limiterService, true));
  app.get(
    "/api/dashboard-data",
    auth,
    createDashboardDataHandler(args.limiterService)
  );

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
      if (error instanceof ZodError) {
        response.status(400).json({
          error: "Validation failed",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
        return;
      }

      if (error instanceof Error) {
        console.error("Unhandled error:", error);
      }

      response.status(500).json({
        error: "Unexpected server error"
      });
    }
  );

  return app;
}
