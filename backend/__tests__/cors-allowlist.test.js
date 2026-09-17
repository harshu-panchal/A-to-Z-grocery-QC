import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { parseAllowedOrigins, buildCorsOriginValidator } from "../app/config/cors.js";

// Regression test for audit finding H2: the CORS allow-list was computed
// from CORS_ALLOWED_ORIGINS/FRONTEND_URL but never actually applied — both
// the Express and Socket.IO CORS configs used `origin: true`, which
// reflects any requesting origin back with `credentials: true`.

describe("CORS allow-list (audit H2)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parses a comma-separated CORS_ALLOWED_ORIGINS list and expands localhost/127.0.0.1 aliases", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com, http://localhost:5173";
    const origins = parseAllowedOrigins();

    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://127.0.0.1:5173");
  });

  it("accepts a request whose Origin header is on the allow-list", () => {
    const validator = buildCorsOriginValidator(["https://app.example.com"]);
    const callback = jest.fn();

    validator("https://app.example.com", callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("rejects a request whose Origin header is not on the allow-list", () => {
    const validator = buildCorsOriginValidator(["https://app.example.com"]);
    const callback = jest.fn();

    validator("https://evil-attacker.example", callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, allowed] = callback.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(allowed).toBeUndefined();
  });

  it("allows requests with no Origin header (server-to-server, curl, health checks)", () => {
    const validator = buildCorsOriginValidator(["https://app.example.com"]);
    const callback = jest.fn();

    validator(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
