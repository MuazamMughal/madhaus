import type { MenuPhoto } from './menu';

/** Published legacy CMS menu documents; customer and payment data never enter this flow. */
export interface LegacyMenuDocument {
  _id: string;
  title?: string;
  slug?: string;
  category?: string;
  description?: string | null;
  dietaryTags?: string[];
  allergenNote?: string | null;
  isFeatured?: boolean;
  image?: { alt?: string; asset?: { _id?: string; url?: string; metadata?: {
    dimensions?: { width: number; height: number }; lqip?: string;
  } } } | null;
}

export function prepareMenuImport(documents: LegacyMenuDocument[]) {
  const slugs = new Set<string>();
  return documents.map(doc => {
    const name = doc.title?.trim();
    const slug = doc.slug?.trim();
    const category = doc.category?.trim();
    if (!name || name.length < 2 || name.length > 120 || !slug || !/^[a-z0-9-]{1,96}$/.test(slug) || !category || category.length > 60) {
      throw new Error(`Menu document ${doc._id} needs a valid title, slug and category before import.`);
    }
    if (slugs.has(slug)) throw new Error(`Multiple Sanity items use slug ${slug}. Resolve the duplicate before import.`);
    slugs.add(slug);
    const asset = doc.image?.asset;
    const image: MenuPhoto | null = asset?._id && asset.url?.startsWith('https://cdn.sanity.io/images/') ? {
      assetId: asset._id, url: asset.url, alt: doc.image?.alt ?? '',
      width: asset.metadata?.dimensions?.width, height: asset.metadata?.dimensions?.height,
      lqip: asset.metadata?.lqip,
    } : null;
    return {
      sourceId: doc._id, slug, name, category,
      description: doc.description?.trim() || null,
      dietaryTags: [...new Set((doc.dietaryTags ?? []).filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()))],
      allergenNote: doc.allergenNote?.trim() || null,
      isFeatured: doc.isFeatured === true, image,
    };
  });
}
