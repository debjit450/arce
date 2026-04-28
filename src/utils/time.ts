export function bucketStart(timestampMs: number, windowMs = 60_000): number {
  return Math.floor(timestampMs / windowMs) * windowMs;
}
