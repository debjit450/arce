import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";
import path from "node:path";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

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

  // Security and Logging middleware
  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({
    autoLogging: false,
    quietReqLogger: true
  }));

  // Global rate limiter for the ARCE endpoints themselves
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10000, // 10k requests per 15 mins per IP
    message: { error: "Too many requests to ARCE itself. Please slow down." }
  });
  app.use(globalLimiter);

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
      request: Request,
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
        request.log.error(error, "Unhandled error during request processing");
      }

      response.status(500).json({
        error: "Unexpected server error"
      });
    }
  );

  return app;
}
