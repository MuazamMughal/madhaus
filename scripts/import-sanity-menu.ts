import './load-env';
import { createClient } from 'next-sanity';
import { Client } from 'pg';
import { pgSslOptions } from '@/lib/db/ssl';
import { prepareMenuImport, type LegacyMenuDocument } from '@/lib/domain/menu-import';
import { importLegacyMenu } from '@/server/menu-import-service';

/** One-time content migration. Safe to rerun: imported records are never overwritten. */
async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.DATABASE_URL;
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (!connectionString || !projectId) throw new Error('Set DATABASE_URL and NEXT_PUBLIC_SANITY_PROJECT_ID.');
  const sanity = createClient({
    projectId, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? '2026-10-01',
    useCdn: false, perspective: 'published',
    token: process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN,
  });
  const documents = await sanity.fetch<LegacyMenuDocument[]>(`*[_type == 'menuItem'] {
    _id, title, 'slug': slug.current, 'category': category->title,
    description, dietaryTags, allergenNote, isFeatured,
    image{alt, asset->{_id, url, metadata{dimensions,lqip}}}
  }`);
  const items = prepareMenuImport(documents);
  const db = new Client({ connectionString, ...pgSslOptions(connectionString) });
  await db.connect();
  try {
    await db.query('BEGIN');
    const { imported, outcomes } = await importLegacyMenu(items, db, apply);
    const messages = { preserved: 'Preserved existing Admin content', merged: 'Merge content, preserve operational fields', draft: 'Create draft, price unset' };
    for (const result of outcomes) console.log(`${messages[result.outcome]}: ${result.name}`);
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(apply ? `Imported ${imported} records. Complete new drafts in /admin/menu.`
      : 'Dry run complete. Run npm run menu:import -- --apply to migrate.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { await db.end(); }
}

main().catch((error: unknown) => {
  console.error('Menu import failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
