import type { EnforcementResult, LimitRequestPayload } from "../types";

export interface ArceClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class ArceClient {
  constructor(private readonly options: ArceClientOptions) {}

  async checkLimit(payload: LimitRequestPayload): Promise<EnforcementResult> {
    return this.request("/check-limit", payload);
  }

  async consume(payload: LimitRequestPayload): Promise<EnforcementResult> {
    return this.request("/consume", payload);
  }

  private async request(
    path: string,
    payload: LimitRequestPayload
  ): Promise<EnforcementResult> {
    const request = this.options.fetchImpl ?? fetch;
    const response = await request(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.options.headers
      },
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as EnforcementResult;

    if (!response.ok && !("allowed" in data)) {
      throw new Error(`ARCE request failed with status ${response.status}.`);
    }

    return data;
  }
}
