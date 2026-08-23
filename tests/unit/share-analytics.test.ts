import { describe, expect, it } from "vitest";
import { resolveCountry } from "../../src/lib/share-analytics";

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/slug", { headers });
}

describe("share analytics country resolution", () => {
  it("prefers the Cloudflare cf-ipcountry header", () => {
    const req = requestWith({ "cf-ipcountry": "IN" });
    expect(resolveCountry(req, "103.21.244.1")).toBe("IN");
  });

  it("ignores malformed cf-ipcountry values", () => {
    const req = requestWith({ "cf-ipcountry": "India" });
    expect(resolveCountry(req, "8.8.8.8")).toBe("US");
  });

  it("classifies private ranges as Local", () => {
    for (const ip of ["10.0.0.5", "172.16.4.4", "192.168.1.20", "127.0.0.1", "::1"])
      expect(resolveCountry(requestWith(), ip)).toBe("Local");
  });

  it("geolocates public IPv4 addresses", () => {
    expect(resolveCountry(requestWith(), "8.8.8.8")).toBe("US");
  });

  it("returns Unknown for unknown addresses", () => {
    expect(resolveCountry(requestWith(), "unknown")).toBe("Unknown");
  });
});
