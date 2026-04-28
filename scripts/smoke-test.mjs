const baseUrl = process.env.ARCE_BASE_URL ?? "http://localhost:4000";

async function run() {
  const response = await fetch(`${baseUrl}/consume`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      algorithm: "token_bucket",
      route: "/smoke-test",
      method: "GET",
      ip: "203.0.113.50",
      scope: "ip",
      baseLimitPerMinute: 100,
      metadata: {
        userAgent: "arce-smoke-test"
      }
    })
  });

  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
