import { z } from "zod";

export const limitRequestSchema = z
  .object({
    algorithm: z.enum(["token_bucket", "sliding_window", "leaky_bucket"]),
    route: z.string().trim().min(1).default("/"),
    method: z.string().trim().min(1).default("GET"),
    userId: z.string().trim().min(1).max(256).optional(),
    ip: z.string().trim().min(1).max(64).optional(),
    identifier: z.string().trim().min(1).max(256).optional(),
    scope: z.enum(["user", "ip", "hybrid", "custom"]).optional(),
    fingerprint: z.string().trim().min(1).max(256).optional(),
    cost: z.number().int().min(1).max(10).default(1),
    baseLimitPerMinute: z.number().int().min(10).max(10_000).optional(),
    metadata: z
      .object({
        userAgent: z.string().trim().optional()
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    if (!value.userId && !value.ip && !value.identifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of userId, ip, or identifier."
      });
    }

    if (value.scope === "hybrid" && (!value.userId || !value.ip)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hybrid scope requires both userId and ip."
      });
    }

    if (value.scope === "user" && !value.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User scope requires userId."
      });
    }

    if (value.scope === "ip" && !value.ip) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IP scope requires ip."
      });
    }

    if (value.scope === "custom" && !value.identifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom scope requires identifier."
      });
    }
  });
