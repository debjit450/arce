import { createHash } from "node:crypto";

export function hashValue(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}
