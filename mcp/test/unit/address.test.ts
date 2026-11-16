import { describe, expect, it } from "vitest";
import { limiterKey } from "../../src/address.ts";

describe("the rate limiter's key", () => {
  it("is the address itself for IPv4", () => {
    expect(limiterKey("203.0.113.7")).toBe("203.0.113.7");
    expect(limiterKey(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("is the /64 for IPv6, however the address is written", () => {
    for (const address of ["2001:db8:1:2:3:4:5:6", "2001:0db8:0001:0002::1", "2001:DB8:1:2::", "2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2:0:0:1.2.3.4"]) {
      expect(limiterKey(address)).toBe("2001:db8:1:2::/64");
    }
    expect(limiterKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(limiterKey("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(limiterKey("::1")).toBe("0:0:0:0::/64");
  });

  it("is the IPv4 address for an IPv4 client written as IPv6", () => {
    expect(limiterKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(limiterKey("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("falls back to the text as given when it is not an address, and to one shared key when there is none", () => {
    expect(limiterKey("2001:db8:1:2:3:4:5")).toBe("2001:db8:1:2:3:4:5");
    expect(limiterKey("zz::1")).toBe("zz::1");
    expect(limiterKey("1::2::3")).toBe("1::2::3");
    expect(limiterKey(null)).toBe("unknown");
    expect(limiterKey("")).toBe("unknown");
  });
});
