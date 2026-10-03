import { describe, expect, it } from "vitest";
import { resolveLink, resolveLinks } from "@/lib/sanity/client";

/**
 * Regression guard.
 *
 * The Studio stores a link as `{ kind, path, url, label }`. The application wants
 * `{ label, href }`. Spreading the CMS object straight through produced `href: undefined`,
 * which React treats as a hard error — it took the whole homepage down the moment a
 * homepage document existed in the CMS. That shipped once; this is here so it cannot
 * ship again.
 */
describe("resolving a CMS link", () => {
  it("turns an internal link into a path", () => {
    expect(
      resolveLink({ _type: "link", kind: "internal", label: "Book your game", path: "/book" }),
    ).toEqual({ label: "Book your game", href: "/book" });
  });

  it("turns an external link into its URL", () => {
    expect(
      resolveLink({
        _type: "link",
        kind: "external",
        label: "Instagram",
        url: "https://instagram.com/themadhauspk",
      }),
    ).toEqual({ label: "Instagram", href: "https://instagram.com/themadhauspk" });
  });

  it("returns null rather than an undefined href for an incomplete link", () => {
    // Each of these would previously have produced `href: undefined` and crashed the page.
    expect(resolveLink({ kind: "internal", label: "No path" })).toBeNull();
    expect(resolveLink({ kind: "external", label: "No url" })).toBeNull();
    expect(resolveLink({ kind: "internal", path: "/book" })).toBeNull(); // no label
    expect(resolveLink({ label: "  ", kind: "internal", path: "/book" })).toBeNull();
    expect(resolveLink(null)).toBeNull();
    expect(resolveLink(undefined)).toBeNull();
    expect(resolveLink("not an object")).toBeNull();
    expect(resolveLink({})).toBeNull();
  });

  it("refuses an internal link that is not a path on this site", () => {
    // An editor pasting a full URL into the internal field would otherwise turn the
    // navigation into an open redirect.
    expect(resolveLink({ kind: "internal", label: "Evil", path: "https://evil.example" })).toBeNull();
    expect(resolveLink({ kind: "internal", label: "Evil", path: "//evil.example" })).toBeNull();
    expect(resolveLink({ kind: "internal", label: "Relative", path: "book" })).toBeNull();
  });

  it("drops unusable links from a list rather than failing the whole menu", () => {
    const resolved = resolveLinks([
      { kind: "internal", label: "Arena", path: "/arena" },
      { kind: "internal", label: "Broken" },
      { kind: "external", label: "Instagram", url: "https://instagram.com/x" },
      null,
    ]);

    expect(resolved).toEqual([
      { label: "Arena", href: "/arena" },
      { label: "Instagram", href: "https://instagram.com/x" },
    ]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(resolveLinks(undefined)).toEqual([]);
    expect(resolveLinks(null)).toEqual([]);
    expect(resolveLinks({})).toEqual([]);
  });

  it("never returns an object with a missing or empty href", () => {
    // The property this whole module exists to guarantee.
    const inputs: unknown[] = [
      { kind: "internal", label: "A", path: "/a" },
      { kind: "external", label: "B", url: "https://b.example" },
      { kind: "internal", label: "C" },
      { kind: "bogus", label: "D", path: "/d" },
      {},
      null,
    ];

    for (const input of inputs) {
      const link = resolveLink(input);
      if (link !== null) {
        expect(typeof link.href).toBe("string");
        expect(link.href.length).toBeGreaterThan(0);
      }
    }
  });
});
