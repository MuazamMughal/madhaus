import "server-only";
import { createClient } from 'next-sanity';
import { serverEnv } from '@/lib/env';
import { validateMenuPhoto, type MenuPhoto } from '@/lib/domain/menu';

export async function uploadMenuPhoto(file: File, alt: string): Promise<MenuPhoto> {
  if (alt.trim().length < 3 || alt.trim().length > 160) {
    throw new RangeError('Describe the photo in 3–160 characters.');
  }
  if (file.size > 2 * 1024 * 1024) throw new RangeError('Choose a photo no larger than 2 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  validateMenuPhoto(bytes, file.type);
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SANITY_PROJECT_ID || !env.SANITY_API_WRITE_TOKEN) {
    throw new RangeError('Photo uploads need a Sanity project and SANITY_API_WRITE_TOKEN on the server.');
  }
  const client = createClient({
    projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    token: env.SANITY_API_WRITE_TOKEN,
    useCdn: false,
  });
  const asset = await client.assets.upload('image', bytes, { contentType: file.type });
  return {
    assetId: asset._id,
    url: asset.url,
    alt: alt.trim(),
    width: asset.metadata?.dimensions?.width,
    height: asset.metadata?.dimensions?.height,
  };
}
