import {
  inferUnitFromName, toFoodUnit, foodUnit,
  per100Label, unitInputLabel, formatQuantity,
} from '@/lib/foodUnits';
import { unitForOFFProduct } from '@/lib/openFoodFacts';

describe('inferUnitFromName', () => {
  it.each([
    'Beer', 'Lager', 'Stella Artois lager', 'Cider', 'Red wine', 'Prosecco',
    'Olive oil', 'Whole milk', 'Orange juice', 'Sparkling water',
    'Black coffee', 'Green tea', 'Vegetable stock', 'Balsamic vinegar',
    'Double cream', 'Gin', 'Diet cola',
  ])('treats %s as millilitres', (name) => {
    expect(inferUnitFromName(name)).toBe('ml');
  });

  it.each([
    'Chicken breast', 'Greek yogurt', 'Tomato sauce', 'Cheddar',
    'Wholemeal bread', 'Porridge oats', 'Banana',
  ])('treats %s as grams', (name) => {
    expect(inferUnitFromName(name)).toBe('g');
  });

  // Solids whose names contain a liquid word. Getting these wrong is worse
  // than the status quo, because grams is at least right for them today.
  it.each([
    'Cream cheese, full fat',
    'Ice cream, vanilla',
    'Milk chocolate',
    'Cream crackers',
    'Coconut oil',
    'Tuna, canned in oil',
    'Sardines, canned in olive oil',
    'Teacake',
  ])('does not mistake %s for a liquid', (name) => {
    expect(inferUnitFromName(name)).toBe('g');
  });

  it('falls back to grams for an empty name', () => {
    expect(inferUnitFromName('')).toBe('g');
  });

  // "watercress" and "watermelon" contain "water" but have no word boundary
  // after it, so the pattern must not fire.
  it.each(['Watercress', 'Watermelon'])('does not fire on %s', (name) => {
    expect(inferUnitFromName(name)).toBe('g');
  });
});

describe('toFoodUnit', () => {
  it('accepts ml', () => {
    expect(toFoodUnit('ml')).toBe('ml');
  });

  it.each([null, undefined, '', 'g', 'oz', 42])('defaults %p to grams', (v) => {
    expect(toFoodUnit(v)).toBe('g');
  });
});

describe('foodUnit', () => {
  // A catalogue food with no unit is grams by definition — it must NOT fall
  // through to the name heuristic, or "Tuna, canned in oil" drifts to ml.
  it('treats a missing unit as grams', () => {
    expect(foodUnit({})).toBe('g');
  });

  it('uses an explicit unit', () => {
    expect(foodUnit({ unit: 'ml' })).toBe('ml');
  });
});

describe('labels', () => {
  it('formats the per-100 line', () => {
    expect(per100Label('g')).toBe('per 100g');
    expect(per100Label('ml')).toBe('per 100 ml');
  });

  it('names the quantity input', () => {
    expect(unitInputLabel('g')).toBe('GRAMS');
    expect(unitInputLabel('ml')).toBe('MILLILITRES');
  });

  it('formats a quantity with its unit', () => {
    expect(formatQuantity(500, 'ml')).toBe('500 ml');
    expect(formatQuantity(125, 'g')).toBe('125 g');
    expect(formatQuantity(33.33, 'ml')).toBe('33.3 ml');
  });
});

describe('unitForOFFProduct', () => {
  it('trusts product_quantity_unit', () => {
    expect(unitForOFFProduct({ product_quantity_unit: 'ml' }, 'Mystery')).toBe('ml');
    expect(unitForOFFProduct({ product_quantity_unit: 'g' }, 'Lager')).toBe('g');
  });

  it('accepts other volume units', () => {
    expect(unitForOFFProduct({ product_quantity_unit: 'L' }, 'x')).toBe('ml');
    expect(unitForOFFProduct({ product_quantity_unit: 'cl' }, 'x')).toBe('ml');
  });

  it('falls back to serving_quantity_unit', () => {
    expect(unitForOFFProduct({ serving_quantity_unit: 'ml' }, 'Mystery')).toBe('ml');
  });

  it('reads the pack size string when no unit field is present', () => {
    expect(unitForOFFProduct({ quantity: '500 ml' }, 'Mystery')).toBe('ml');
    expect(unitForOFFProduct({ quantity: '1L' },     'Mystery')).toBe('ml');
    expect(unitForOFFProduct({ quantity: '33 cl' },  'Mystery')).toBe('ml');
    expect(unitForOFFProduct({ quantity: '250 g' },  'Lager')).toBe('g');
  });

  it('falls back to the name when OFF knows nothing', () => {
    expect(unitForOFFProduct({}, 'Craft lager')).toBe('ml');
    expect(unitForOFFProduct({}, 'Greek yogurt')).toBe('g');
  });

  it('ignores a unit field that is empty or unrecognised', () => {
    expect(unitForOFFProduct({ product_quantity_unit: '  ' }, 'Craft lager')).toBe('ml');
    expect(unitForOFFProduct({ product_quantity_unit: 'oz' }, 'Craft lager')).toBe('ml');
  });
});
