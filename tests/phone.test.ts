import { describe, expect, it } from "vitest";
import {
  InvalidPhoneNumberError,
  normalisePakistaniPhone,
  tryNormalisePakistaniPhone,
  whatsappClickToChatUrl,
} from "@/lib/domain/phone";

describe("Pakistani phone normalisation", () => {
  it("normalises every common way a customer writes the same mobile", () => {
    // All of these are one person. The customer record is keyed on phone, so they must
    // collapse to one string or the same customer appears several times.
    const inputs = [
      "03001234567",
      "0300 1234567",
      "0300-123-4567",
      "+923001234567",
      "+92 300 1234567",
      "0092 300 1234567",
      "923001234567",
      "3001234567",
      "(0300) 1234567",
      " 0300.123.4567 ",
    ];

    for (const input of inputs) {
      expect(normalisePakistaniPhone(input).e164, `input: ${input}`).toBe("+923001234567");
    }
  });

  it("formats the national form for display", () => {
    expect(normalisePakistaniPhone("+923331234567").national).toBe("0333 1234567");
  });

  it("identifies mobiles by the 3xx prefix", () => {
    expect(normalisePakistaniPhone("03451234567").kind).toBe("mobile");
    // Sahiwal's landline area code is 40.
    expect(normalisePakistaniPhone("0404567890").kind).toBe("landline");
  });

  it("rejects a mobile with the wrong number of digits", () => {
    expect(() => normalisePakistaniPhone("030012345")).toThrow(InvalidPhoneNumberError);
    expect(() => normalisePakistaniPhone("0300123456789")).toThrow(InvalidPhoneNumberError);
  });

  it("rejects non-Pakistani international numbers with a useful message", () => {
    expect(() => normalisePakistaniPhone("+447700900123")).toThrow(/Pakistani numbers/);
    expect(() => normalisePakistaniPhone("0044 7700 900123")).toThrow(/Pakistani numbers/);
  });

  it("rejects letters and empty input", () => {
    expect(() => normalisePakistaniPhone("call me")).toThrow(InvalidPhoneNumberError);
    expect(() => normalisePakistaniPhone("")).toThrow(InvalidPhoneNumberError);
    expect(() => normalisePakistaniPhone("   ")).toThrow(InvalidPhoneNumberError);
  });

  it("returns null rather than throwing in the forgiving variant", () => {
    expect(tryNormalisePakistaniPhone("nonsense")).toBeNull();
    expect(tryNormalisePakistaniPhone("03001234567")?.e164).toBe("+923001234567");
  });

  it("builds a click-to-chat link with no plus and an encoded message", () => {
    const url = whatsappClickToChatUrl("+923001234567", "Hi there");
    expect(url).toContain("https://wa.me/923001234567");
    expect(url).toContain("text=Hi+there");
  });
});
