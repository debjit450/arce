import { createClient } from "redis";

import { runtimeConfig } from "../../configs/runtime";

export type RedisClient = ReturnType<typeof createClient>;

export async function createRedisConnection(): Promise<RedisClient> {
  const client = createClient({
    url: runtimeConfig.redisUrl
  });

  client.on("error", (error) => {
    console.error("Redis client error:", error);
  });

  await client.connect();
  return client;
}
