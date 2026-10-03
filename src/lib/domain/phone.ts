/**
 * Pakistan phone-number normalisation.
 *
 * Customers write their number every imaginable way: 0300 1234567, 3001234567,
 * +92-300-1234567, 0092 300 1234567. All of those are the same person, and the
 * customer record is keyed on phone, so they must normalise to one string.
 *
 * Output is always E.164: +923001234567.
 */

const PK_COUNTRY_CODE = "92";

/** Pakistani mobile networks all sit on 3xx, giving a 10-digit national number. */
const PK_MOBILE_NATIONAL_LENGTH = 10;

/** Landline national numbers run 9-10 digits (e.g. Sahiwal is area code 40). */
const PK_LANDLINE_MIN_NATIONAL_LENGTH = 9;

export type PhoneKind = "mobile" | "landline";

export interface NormalisedPhone {
  /** E.164, e.g. "+923001234567". Store this. */
  e164: string;
  /** National form for display, e.g. "0300 1234567". */
  national: string;
  kind: PhoneKind;
}

export class InvalidPhoneNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhoneNumberError";
  }
}

/**
 * Normalise a Pakistani phone number, or throw.
 *
 * Accepts, in order of preference: full E.164, 00-prefixed international,
 * 92-prefixed, 0-prefixed national, and bare national.
 */
export function normalisePakistaniPhone(input: string): NormalisedPhone {
  if (typeof input !== "string") {
    throw new InvalidPhoneNumberError("Phone number must be text.");
  }

  // Strip everything a human might add: spaces, dashes, brackets, dots.
  const digitsAndPlus = input.trim().replace(/[\s()./-]/g, "");
  if (digitsAndPlus === "") {
    throw new InvalidPhoneNumberError("Please enter a phone number.");
  }
  if (!/^\+?\d+$/.test(digitsAndPlus)) {
    throw new InvalidPhoneNumberError("Phone number can only contain digits.");
  }

  let national: string;

  if (digitsAndPlus.startsWith(`+${PK_COUNTRY_CODE}`)) {
    national = digitsAndPlus.slice(1 + PK_COUNTRY_CODE.length);
  } else if (digitsAndPlus.startsWith("+")) {
    throw new InvalidPhoneNumberError(
      "Only Pakistani numbers (+92) are accepted. Please call the venue for overseas bookings.",
    );
  } else if (digitsAndPlus.startsWith(`00${PK_COUNTRY_CODE}`)) {
    national = digitsAndPlus.slice(2 + PK_COUNTRY_CODE.length);
  } else if (digitsAndPlus.startsWith("00")) {
    throw new InvalidPhoneNumberError(
      "Only Pakistani numbers (+92) are accepted. Please call the venue for overseas bookings.",
    );
  } else if (digitsAndPlus.startsWith("0")) {
    national = digitsAndPlus.slice(1);
  } else if (
    // A bare 92-prefixed number, but only when what follows is a plausible national
    // number. This matters because 92 is not itself a valid national prefix, so an
    // 11-or-12-digit string starting 92 is far more likely to be a country code.
    digitsAndPlus.startsWith(PK_COUNTRY_CODE) &&
    digitsAndPlus.length >= PK_COUNTRY_CODE.length + PK_LANDLINE_MIN_NATIONAL_LENGTH
  ) {
    national = digitsAndPlus.slice(PK_COUNTRY_CODE.length);
  } else {
    national = digitsAndPlus;
  }

  // A leading zero can survive the country-code strip: +9203001234567.
  national = national.replace(/^0+/, "");

  if (national === "") {
    throw new InvalidPhoneNumberError("That does not look like a complete phone number.");
  }

  const kind: PhoneKind = national.startsWith("3") ? "mobile" : "landline";

  if (kind === "mobile") {
    if (national.length !== PK_MOBILE_NATIONAL_LENGTH) {
      throw new InvalidPhoneNumberError(
        "A Pakistani mobile number should be 10 digits after the 0, for example 0300 1234567.",
      );
    }
  } else if (
    national.length < PK_LANDLINE_MIN_NATIONAL_LENGTH ||
    national.length > PK_MOBILE_NATIONAL_LENGTH
  ) {
    throw new InvalidPhoneNumberError("That does not look like a valid Pakistani number.");
  }

  return {
    e164: `+${PK_COUNTRY_CODE}${national}`,
    national: formatNational(national, kind),
    kind,
  };
}

/** Non-throwing variant, for optional fields and search boxes. */
export function tryNormalisePakistaniPhone(input: string): NormalisedPhone | null {
  try {
    return normalisePakistaniPhone(input);
  } catch {
    return null;
  }
}

/** "3001234567" -> "0300 1234567"; landlines group as "040 1234567". */
function formatNational(national: string, kind: PhoneKind): string {
  const groupAt = kind === "mobile" ? 3 : 2;
  return `0${national.slice(0, groupAt)} ${national.slice(groupAt)}`;
}

/**
 * Build a click-to-chat WhatsApp link.
 *
 * This opens WhatsApp with a prefilled draft. It is NOT message delivery: nothing is
 * sent until the customer presses send, and the venue gets no delivery receipt. The UI
 * must never describe this as a notification having been sent.
 */
export function whatsappClickToChatUrl(e164: string, message?: string): string {
  const digits = e164.replace(/\D/g, "");
  const url = new URL(`https://wa.me/${digits}`);
  if (message) url.searchParams.set("text", message);
  return url.toString();
}
