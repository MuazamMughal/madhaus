import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Studio",
  // Never indexed: it is the venue's content management system.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // What the Studio expects of its viewport.
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function StudioToolLayout({ children }: LayoutProps<"/studio/[[...tool]]">) {
  return children;
}
