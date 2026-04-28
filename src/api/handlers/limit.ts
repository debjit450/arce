import type { RequestHandler } from "express";

import { limitRequestSchema } from "../schemas";
import { LimiterService } from "../../core/limiter-service";
import { asyncHandler } from "../../utils/async-handler";

export function createLimitHandler(
  limiterService: LimiterService,
  consume: boolean
): RequestHandler {
  return asyncHandler(async (request, response) => {
    const payload = limitRequestSchema.parse(request.body);
    const result = await limiterService.evaluate(payload, consume);
    response.status(result.allowed ? 200 : 429).json(result);
  });
}
