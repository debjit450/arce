import type { RequestHandler } from "express";

import type { RedisClient } from "../../store/redis";
import { asyncHandler } from "../../utils/async-handler";

export function createHealthHandler(redis: RedisClient): RequestHandler {
  return asyncHandler(async (_request, response) => {
    const redisStatus = await redis.ping();
    response.json({
      status: "ok",
      redis: redisStatus,
      timestamp: new Date().toISOString()
    });
  });
}
