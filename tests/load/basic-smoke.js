import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.ARCE_BASE_URL || "http://localhost:4000";

export const options = {
  vus: 5,
  duration: "30s"
};

export default function () {
  const payload = JSON.stringify({
    algorithm: "token_bucket",
    route: "/k6/orders",
    method: "GET",
    ip: `198.51.100.${__VU}`,
    scope: "ip",
    baseLimitPerMinute: 100,
    metadata: {
      userAgent: "k6-smoke"
    }
  });

  const response = http.post(`${BASE_URL}/consume`, payload, {
    headers: {
      "Content-Type": "application/json"
    }
  });

  check(response, {
    "status is 200 or 429": (res) => res.status === 200 || res.status === 429
  });

  sleep(1);
}
