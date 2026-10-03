import { describe, expect, it } from "vitest";
import { applyBasisPoints, formatPkr, prorateHourlyRate, rupees, sumMinor } from "@/lib/domain/money";

describe("money", () => {
  it("pro-rates an hourly rate exactly for whole and part hours", () => {
    const rate = rupees(3000); // Rs 3,000/hr
    expect(prorateHourlyRate(rate, 60)).toBe(rupees(3000));
    expect(prorateHourlyRate(rate, 90)).toBe(rupees(4500));
    expect(prorateHourlyRate(rate, 30)).toBe(rupees(1500));
    expect(prorateHourlyRate(rate, 120)).toBe(rupees(6000));
  });

  it("rounds half-up on awkward durations and never drifts", () => {
    // 7 minutes of Rs 1000/hr is 116.666… paisa.
    expect(prorateHourlyRate(rupees(10), 7)).toBe(117);
    // Summing the parts of an hour must not lose or invent money beyond rounding.
    const parts = [13, 17, 30].map((minutes) => prorateHourlyRate(rupees(10), minutes));
    expect(sumMinor(parts)).toBe(1000);
  });

  it("refuses non-integer minor units rather than silently rounding", () => {
    expect(() => prorateHourlyRate(100.5, 60)).toThrow(TypeError);
    expect(() => prorateHourlyRate(100, 1.5)).toThrow(TypeError);
  });

  it("rounds a percentage discount down, so it never exceeds the stated rate", () => {
    expect(applyBasisPoints(rupees(999), 1000)).toBe(9990); // 10% of Rs 999 = Rs 99.90
    expect(applyBasisPoints(rupees(100), 3333)).toBe(3333);
    expect(applyBasisPoints(rupees(100), 0)).toBe(0);
    expect(applyBasisPoints(rupees(100), 10_000)).toBe(rupees(100));
  });

  it("rejects an out-of-range basis points value", () => {
    expect(() => applyBasisPoints(1000, 10_001)).toThrow(RangeError);
    expect(() => applyBasisPoints(1000, -1)).toThrow(RangeError);
  });

  it("formats whole rupees without decimals and part rupees with them", () => {
    expect(formatPkr(rupees(3000))).toBe("Rs 3,000");
    expect(formatPkr(rupees(1250))).toBe("Rs 1,250");
    expect(formatPkr(12_345)).toBe("Rs 123.45");
    expect(formatPkr(rupees(3000), { withSymbol: false })).toBe("3,000");
  });
});
