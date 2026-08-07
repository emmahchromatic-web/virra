import { parseOFFProduct, parseOFFSearchResults, searchByName } from '@/lib/openFoodFacts';

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
      // OFF sent no unit field for this fixture, so the name decides — milk is
      // sold by volume and must not come back as grams.
      unit: 'ml',
      calories: 67, carbs_g: 4.7, protein_g: 3.4, fat_g: 4.0, fibre_g: 0,
    });
  });

  it('takes the unit from OFF when it supplies one', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name_en: 'Greek Style Yogurt',
        brands: 'Fage',
        product_quantity_unit: 'g',
        nutriments: { 'energy-kcal_100g': 133 },
      },
    }, BARCODE);
    expect(result?.unit).toBe('g');
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

describe('parseOFFSearchResults', () => {
  it('returns empty array for malformed input', () => {
    expect(parseOFFSearchResults(null)).toEqual([]);
    expect(parseOFFSearchResults({})).toEqual([]);
    expect(parseOFFSearchResults({ products: 'nope' })).toEqual([]);
  });

  it('skips products missing code', () => {
    const out = parseOFFSearchResults({
      products: [
        { product_name: 'No code', nutriments: { 'energy-kcal_100g': 100 } },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips products with no usable kcal', () => {
    const out = parseOFFSearchResults({
      products: [
        { code: '111', product_name: 'Empty', nutriments: {} },
        { code: '222', product_name: 'Zero kcal', nutriments: { 'energy-kcal_100g': 0 } },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips products missing a name', () => {
    const out = parseOFFSearchResults({
      products: [
        { code: '333', nutriments: { 'energy-kcal_100g': 200 } },
      ],
    });
    expect(out).toEqual([]);
  });

  it('parses a mixed list, returning only usable products with stable ids', () => {
    const out = parseOFFSearchResults({
      products: [
        {
          code: '5000112546415',
          product_name_en: 'Skyr Natural',
          brands: 'Arla',
          nutriments: { 'energy-kcal_100g': 63, 'carbohydrates_100g': 4, 'proteins_100g': 11, 'fat_100g': 0.2 },
        },
        { code: '999', product_name: 'Garbage', nutriments: {} },
        {
          code: '4006',
          product_name: 'Wholemeal Bread',
          brands: 'Hovis, UK',
          nutriments: { 'energy-kcal_100g': 217, 'carbohydrates_100g': 42, 'proteins_100g': 9.4, 'fat_100g': 2.5, 'fiber_100g': 6 },
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'off-5000112546415', name: 'Skyr Natural', detail: 'Arla', calories: 63 });
    expect(out[1]).toMatchObject({ id: 'off-4006', name: 'Wholemeal Bread', detail: 'Hovis', fibre_g: 6 });
  });
});

describe('searchByName', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns empty array for empty query without calling fetch', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await searchByName('   ')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('hits the OFF cgi/search.pl endpoint with relevance sort and parses the response', async () => {
    let calledUrl = '';
    global.fetch = (async (url: string) => {
      calledUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          products: [{
            code: '12345',
            product_name: 'Test Bar',
            nutriments: { 'energy-kcal_100g': 350, 'carbohydrates_100g': 50, 'proteins_100g': 10, 'fat_100g': 12 },
          }],
        }),
      };
    }) as unknown as typeof fetch;

    const out = await searchByName('test bar', { pageSize: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'off-12345', name: 'Test Bar', calories: 350 });

    expect(calledUrl).toContain('https://world.openfoodfacts.org/cgi/search.pl');
    expect(calledUrl).toContain('search_terms=test%20bar');
    expect(calledUrl).toContain('search_simple=1');
    expect(calledUrl).toContain('action=process');
    expect(calledUrl).toContain('json=1');
    expect(calledUrl).toContain('sort_by=unique_scans_n');
    expect(calledUrl).toContain('page_size=5');
  });

  it('returns empty array on non-ok response', async () => {
    global.fetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await searchByName('anything')).toEqual([]);
  });

  it('returns empty array when OFF responds with HTML rate-limit page', async () => {
    global.fetch = (async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    })) as unknown as typeof fetch;
    expect(await searchByName('anything')).toEqual([]);
  });

  it('propagates AbortError when signal aborts', async () => {
    global.fetch = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    const ctrl = new AbortController();
    const p = searchByName('anything', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toThrow('aborted');
  });
});
