import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./sanity/schemas";
import { singletonActionsFilter, structure } from "./sanity/structure";

/**
 * Sanity Studio, embedded at /studio.
 *
 * Reachable only behind the staff sign-in: `proxy.ts` bounces anyone without a session
 * cookie, and the route itself re-checks the `content.edit` permission on the server.
 *
 * Vision (the GROQ playground) is loaded in development only — it is a query console over
 * the whole dataset and does not belong on a production deployment.
 */
export default defineConfig({
  name: "madhaus",
  title: "MadHaus",
  basePath: "/studio",

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",

  plugins: [
    structureTool({ structure }),
    ...(process.env.NODE_ENV !== "production" ? [visionTool()] : []),
  ],

  schema: { types: schemaTypes },

  document: {
    actions: (actions, context) =>
      singletonActionsFilter({ schemaType: context.schemaType, actions }) as typeof actions,
  },
});
