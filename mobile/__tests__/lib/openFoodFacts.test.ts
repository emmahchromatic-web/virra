import { parseOFFProduct } from '@/lib/openFoodFacts';

const BARCODE = '5000112546415';

describe('parseOFFProduct', () => {
  it('returns null when status is not 1', () => {
    expect(parseOFFProduct({ status: 0 }, BARCODE)).toBeNull();
  });

  it('returns null when product has no name', () => {
    expect(parseOFFProduct({ status: 1, product: { nutriments: {} } }, BARCODE)).toBeNull();
  });

  it('returns null when product is missing entirely', () => {
    expect(parseOFFProduct({ status: 1 }, BARCODE)).toBeNull();
  });

  it('parses a well-formed UK product', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name_en: 'Whole Milk',
        brands: 'Arla, UK Dairy',
        nutriments: {
          'energy-kcal_100g': 67,
          'carbohydrates_100g': 4.7,
          'proteins_100g': 3.4,
          'fat_100g': 4.0,
          'fiber_100g': 0,
        },
      },
    }, BARCODE);
    expect(result).toEqual({
      id: `off-${BARCODE}`, name: 'Whole Milk', detail: 'Arla', serving_g: 100,
      calories: 67, carbs_g: 4.7, protein_g: 3.4, fat_g: 4.0, fibre_g: 0,
    });
  });

  it('falls back to product_name when product_name_en is absent', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Pain complet',
        nutriments: { 'energy-kcal_100g': 240, 'carbohydrates_100g': 44, 'proteins_100g': 8, 'fat_100g': 2 },
      },
    }, BARCODE);
    expect(result?.name).toBe('Pain complet');
    expect(result?.detail).toBeUndefined();
  });

  it('handles missing nutriments gracefully with zeros', () => {
    const result = parseOFFProduct({
      status: 1,
      product: { product_name: 'Mystery Food', nutriments: {} },
    }, BARCODE);
    expect(result?.calories).toBe(0);
    expect(result?.fibre_g).toBe(0);
  });

  it('uses fibre_100g as fallback when fiber_100g is absent', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Bran Flakes',
        nutriments: { 'energy-kcal_100g': 357, 'carbohydrates_100g': 67, 'proteins_100g': 10, 'fat_100g': 2, 'fibre_100g': 13 },
      },
    }, BARCODE);
    expect(result?.fibre_g).toBe(13);
  });

  it('rounds macro values to 1 decimal place', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Test Food',
        nutriments: { 'energy-kcal_100g': 123.456, 'carbohydrates_100g': 10.123, 'proteins_100g': 5.678, 'fat_100g': 3.999 },
      },
    }, BARCODE);
    expect(result?.calories).toBe(123.5);
    expect(result?.carbs_g).toBe(10.1);
    expect(result?.protein_g).toBe(5.7);
    expect(result?.fat_g).toBe(4.0);
  });
});
