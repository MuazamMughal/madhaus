import { config } from "dotenv";

/**
 * Load environment for standalone scripts.
 *
 * Next loads `.env.local` itself; a plain `tsx` script does not, so migrations and seeds
 * read the same files in the same precedence Next uses: `.env.local` wins, `.env` fills
 * the gaps.
 */
config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
