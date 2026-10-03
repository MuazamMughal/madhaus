import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import { getSiteSettings, siteUrl } from "@/lib/content";
import "./globals.css";

/**
 * Root layout.
 *
 * Deliberately thin: `<html>`, `<body>`, the fonts and the site-wide metadata, and
 * nothing else.
 *
 * The public header, footer and mobile bar live in `(public)/layout.tsx` instead, because
 * the staff dashboard and the Sanity Studio must NOT inherit them — a "Book a court"
 * button and a marketing footer have no business wrapped around a refund screen.
 */

/**
 * Display face. Archivo has a real width axis, so the condensed poster weights the design
 * calls for come from one variable file rather than a second font download. Self-hosted
 * and subset by next/font: no request to Google at runtime, no layout shift.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

/** Body and, more importantly, the booking interface. Chosen for legibility at 14-16px. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = `${settings.brandName} — Padel, cricket and a café in ${settings.city}`;

  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s — ${settings.brandName}` },
    description: `${settings.brandName} is a sports arena and café in ${settings.city}: padel, cricket on a floodlit multipurpose court, and a kitchen open late. Book a court online.`,
    applicationName: settings.brandName,
    alternates: { canonical: siteUrl() },
    openGraph: {
      type: "website",
      siteName: settings.brandName,
      locale: "en_PK",
      url: siteUrl(),
      title,
    },
    twitter: { card: "summary_large_image" },
    // Sample content must never be indexed: placeholder copy in search results would
    // misrepresent the venue.
    robots: settings.isSampleContent
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#101010",
  // Pinch-zoom is left alone. Capping it is an accessibility failure, and the layout does
  // not need it.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-PK" className={`${archivo.variable} ${inter.variable}`}>
      <body className="bg-charcoal text-ivory antialiased">{children}</body>
    </html>
  );
}
