import { describe, expect, it } from "vitest";
import {
  isPrivateRoute,
  isStaffRoute,
  requiresStaffSession,
} from "@/lib/auth/route-protection";

/**
 * Regression guard.
 *
 * `/admin/sign-in` sits under `/admin`. A naive prefix check protects it, so the sign-in
 * page redirects to the sign-in page and the dashboard becomes permanently unreachable.
 * That shipped once; this is here so it cannot ship again.
 */
describe("route protection", () => {
  it("lets the sign-in and sign-out routes through without a session", () => {
    expect(requiresStaffSession("/admin/sign-in")).toBe(false);
    expect(requiresStaffSession("/admin/sign-out")).toBe(false);
  });

  it("protects every other staff route", () => {
    for (const path of [
      "/admin",
      "/admin/bookings",
      "/admin/bookings/new",
      "/admin/payments",
      "/admin/cafe",
      "/admin/inquiries",
      "/admin/reports",
      "/admin/settings",
      "/studio",
      "/studio/desk/menuItem",
    ]) {
      expect(requiresStaffSession(path), path).toBe(true);
    }
  });

  it("leaves the public site alone", () => {
    for (const path of [
      "/",
      "/arena",
      "/arena/padel",
      "/book",
      "/cafe",
      "/menu",
      "/contact",
      "/privacy",
    ]) {
      expect(requiresStaffSession(path), path).toBe(false);
      expect(isStaffRoute(path), path).toBe(false);
    }
  });

  it("does not treat a lookalike path as a staff route", () => {
    // A marketing page that merely starts with the same letters must not be protected.
    expect(isStaffRoute("/administration")).toBe(false);
    expect(isStaffRoute("/studios")).toBe(false);
    expect(requiresStaffSession("/admin-guide")).toBe(false);
  });

  it("marks every page carrying personal data as private", () => {
    for (const path of [
      "/admin",
      "/studio",
      "/account",
      "/booking/MH-7F3K2Q9X",
      "/book/checkout/MH-7F3K2Q9X",
    ]) {
      expect(isPrivateRoute(path), path).toBe(true);
    }
  });

  it("does not mark the public booking funnel as private", () => {
    // /book itself is a normal, indexable-adjacent page; only the checkout step is private.
    expect(isPrivateRoute("/book")).toBe(false);
    expect(isPrivateRoute("/")).toBe(false);
    expect(isPrivateRoute("/menu")).toBe(false);
  });
});
