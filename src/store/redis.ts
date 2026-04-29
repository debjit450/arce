import { createClient } from "redis";

import { runtimeConfig } from "../../configs/runtime";

export type RedisClient = ReturnType<typeof createClient>;

export async function createRedisConnection(): Promise<RedisClient> {
  const client = createClient({
    url: runtimeConfig.redisUrl,
    socket: {
      reconnectStrategy(retries: number) {
        if (retries > 10) {
          console.error(
            `Redis reconnection failed after ${retries} attempts. Giving up.`
          );
          return new Error("Redis reconnection limit reached.");
        }

        const delay = Math.min(retries * 200, 5_000);
        console.warn(
          `Redis connection lost. Retrying in ${delay}ms (attempt ${retries})...`
        );
        return delay;
      }
    }
  });

  client.on("error", (error) => {
    console.error("Redis client error:", error);
  });

  await client.connect();
  return client;
}
