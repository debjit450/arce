import path from "node:path";

import { runtimeConfig } from "../../configs/runtime";
import { createServerApp } from "../../src/api/app";
import { LimiterService } from "../../src/core/limiter-service";
import { BehaviorStore } from "../../src/store/behavior-store";
import { MetricsStore } from "../../src/store/metrics-store";
import { createRedisConnection } from "../../src/store/redis";
import { RedisRateLimiterStore } from "../../src/store/rate-limiter-store";

async function bootstrap(): Promise<void> {
  const redis = await createRedisConnection();
  const prefix = runtimeConfig.serviceName;
  const limiterStore = new RedisRateLimiterStore(redis, prefix);
  const behaviorStore = new BehaviorStore(redis, prefix);
  const metricsStore = new MetricsStore(redis, prefix);
  const limiterService = new LimiterService(
    limiterStore,
    behaviorStore,
    metricsStore
  );
  const dashboardPublicDir = path.join(
    process.cwd(),
    "apps",
    "dashboard",
    "public"
  );
  const app = createServerApp({
    limiterService,
    redis,
    dashboardPublicDir
  });

  const server = app.listen(runtimeConfig.port, () => {
    console.log(`ARCE listening on http://localhost:${runtimeConfig.port}`);
  });

  const shutdown = (): void => {
    server.close(async () => {
      await redis.quit();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("Failed to start ARCE:", error);
  process.exit(1);
});
