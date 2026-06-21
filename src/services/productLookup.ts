// Look up a scanned barcode against Open Food Facts — a free, open product
// database with strong UK coverage. Returns the product name/brand/image so the
// user doesn't have to type it. Expiry is NOT in the barcode, so we ask for that
// separately.

export interface ProductInfo {
  name: string;
  brand?: string;
  imageUrl?: string;
  category?: string;
}

const BASE = 'https://world.openfoodfacts.org/api/v2/product';

export async function lookupBarcode(barcode: string): Promise<ProductInfo | null> {
  const code = barcode.trim();
  if (!code) return null;
  try {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(code)}.json?fields=product_name,brands,image_front_small_url,categories`,
      { headers: { 'User-Agent': 'Larder/1.0 (expiry tracker)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name: string = (p.product_name || '').trim();
    if (!name) return null;

    const brand: string | undefined = p.brands
      ? String(p.brands).split(',')[0].trim()
      : undefined;
    const category: string | undefined = p.categories
      ? String(p.categories).split(',').pop()?.trim()
      : undefined;

    return {
      name,
      brand,
      imageUrl: p.image_front_small_url || undefined,
      category,
    };
  } catch {
    // Offline or lookup failed — caller falls back to manual entry.
    return null;
  }
}
