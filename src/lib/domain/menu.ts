import type { ImageRef } from '@/lib/content/types';

export const MENU_STATUSES = ['draft', 'published', 'archived'] as const;
export type MenuStatus = typeof MENU_STATUSES[number];
export interface MenuPhoto extends ImageRef { assetId: string }
export interface MenuVariant {
  id?: string;
  name: string;
  priceMinor: number;
}

export function validateMenuPrice(price: number | null, status: MenuStatus) {
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 2_147_483_647)) {
    throw new RangeError('Enter a valid price in rupees.');
  }
  if (status === 'published' && price === null) {
    throw new RangeError('Set a price before publishing this item.');
  }
}

export function validateMenuPhoto(bytes: Uint8Array, mime: string) {
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    throw new RangeError('Choose a photo no larger than 2 MB.');
  }
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg) || (mime === 'image/webp' && webp))) {
    throw new RangeError('Choose a PNG, JPEG or WebP photo.');
  }
}
