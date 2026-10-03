"use client";

import { NextStudio } from "next-sanity/studio";
import config from "../../../../sanity.config";

/**
 * The embedded Sanity Studio.
 *
 * A Client Component by necessity: the Studio is a browser application, and importing its
 * config from the server graph breaks the build (see the layout for the detail).
 *
 * Access is gated in `src/app/studio/layout.tsx`, which runs on the server. Nothing here
 * is relied on for authorisation.
 */
export default function StudioPage() {
  return <NextStudio config={config} />;
}
