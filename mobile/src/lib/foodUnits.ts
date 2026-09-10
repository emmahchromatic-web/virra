/**
 * Foods are logged as a number plus a unit. The number is unchanged by this
 * module: for the drinks people log, 1 ml is close enough to 1 g that the
 * macros work out either way, but showing "500 g" for a pint is wrong, so the
 * unit travels with the food and with the logged entry.
 */
export type FoodUnit = 'g' | 'ml';

export const DEFAULT_FOOD_UNIT: FoodUnit = 'g';

/**
 * What a recipe ingredient is written in, which is a wider set than what a
 * food is LOGGED in. Spoons are how a cook reads small quantities — "1 tsp
 * vanilla" rather than "5 g vanilla" — but they are not a mass, so they must
 * never reach food_entries.quantity_unit, which is g/ml by constraint.
 *
 * Nothing is converted: an ingredient's macros are authored as absolute
 * figures for the stated quantity, so the unit is presentation only.
 */
export type IngredientUnit = FoodUnit | 'tsp' | 'tbsp' | 'unit';

export const INGREDIENT_UNITS: readonly IngredientUnit[] = ['g', 'ml', 'tsp', 'tbsp', 'unit'];

/**
 * 'unit' counts whole things: one red pepper, two eggs. It prints as "1x",
 * which reads as a count rather than a measure and sits in the same column as
 * "80 g" without looking like a weight that lost its unit.
 */
export const COUNTED_UNIT: IngredientUnit = 'unit';

/** Anything unrecognised falls back to grams, which is how it was authored. */
export function toIngredientUnit(value: unknown): IngredientUnit {
  return (INGREDIENT_UNITS as readonly string[]).includes(value as string)
    ? (value as IngredientUnit)
    : 'g';
}

/**
 * Words that mean the thing is sold and consumed by volume. Used only as a
 * fallback: the common-foods catalogue and OpenFoodFacts are both authoritative
 * and are consulted first.
 *
 * Deliberately conservative. A false 'ml' on a solid is more jarring than a
 * false 'g' on a liquid, which is the status quo, so anything ambiguous
 * (soup, yoghurt drinks, ice cream) is left out and stays in grams.
 */
/**
 * Solids whose names contain a volume word. Checked first so "cream cheese"
 * and "ice cream" don't get dragged into millilitres by the cream pattern.
 */
const MASS_OVERRIDES: RegExp[] = [
  /\bcream cheese\b/i,
  /\bice cream\b/i,
  /\bcream crackers?\b/i,
  /\bmilk chocolate\b/i,
  /\bmilk powder\b|\bpowdered milk\b/i,
  /\bcoconut oil\b/i,      // sold in jars by weight, unlike bottled oils
  /\bin (?:\w+ )?oil\b/i,  // "tuna, canned in oil" is a solid packed in oil
  /\btea ?(?:cakes?|loaf|bread)\b/i,
];

const VOLUME_PATTERNS: RegExp[] = [
  /\boils?\b/i,
  /\bmilks?\b/i,
  /\bcreams?\b/i,          // single/double/whipping cream, sold in ml
  /\bjuices?\b/i,
  /\bsmoothies?\b/i,
  /\bbeers?\b/i,
  /\blagers?\b/i,
  /\bales?\b/i,
  /\bstouts?\b/i,
  /\bciders?\b/i,
  /\bwines?\b/i,
  /\bprosecco\b|\bchampagne\b/i,
  /\bspirits?\b|\bvodka\b|\bgin\b|\brum\b|\bwhisk(?:e)?y\b|\btequila\b|\bbrandy\b/i,
  /\bcocktails?\b/i,
  /\bwater\b/i,
  /\bcoffee\b|\bespresso\b|\blatte\b|\bcappuccino\b|\bamericano\b/i,
  /\bteas?\b/i,
  /\bsquash\b|\bcordial\b/i,
  /\bcola\b|\blemonade\b|\btonic\b|\bsoda\b/i,
  /\bstock\b|\bbroth\b|\bbouillon\b/i,
  /\bvinegars?\b/i,
  /\bpints?\b|\bshots?\b/i,
];

/**
 * Best guess at a food's unit from its name alone. Only reach for this when
 * nothing better is known; returns 'g' whenever it isn't reasonably sure.
 */
export function inferUnitFromName(name: string): FoodUnit {
  if (!name) return DEFAULT_FOOD_UNIT;
  if (MASS_OVERRIDES.some((re) => re.test(name))) return DEFAULT_FOOD_UNIT;
  return VOLUME_PATTERNS.some((re) => re.test(name)) ? 'ml' : DEFAULT_FOOD_UNIT;
}

/** Narrow an arbitrary stored value to a FoodUnit, defaulting to grams. */
export function toFoodUnit(value: unknown): FoodUnit {
  return value === 'ml' ? 'ml' : DEFAULT_FOOD_UNIT;
}

/**
 * The unit for a catalogue food. A missing `unit` means grams; the catalogue
 * is complete, so this must NOT fall through to the name heuristic. "Tuna,
 * canned in oil" is grams and only the catalogue knows that for certain.
 */
export function foodUnit(food: { unit?: FoodUnit }): FoodUnit {
  return food.unit ?? DEFAULT_FOOD_UNIT;
}

/** The label for a quantity input, e.g. "GRAMS" / "MILLILITRES". */
export function unitInputLabel(unit: FoodUnit): string {
  return unit === 'ml' ? 'MILLILITRES' : 'GRAMS';
}

/** The per-100 line under a search result, e.g. "per 100 ml". */
export function per100Label(unit: FoodUnit): string {
  return `per 100${unit === 'ml' ? ' ml' : 'g'}`;
}

/** A quantity rendered with its unit, e.g. "500 ml" / "125 g". */
export function formatQuantity(quantity: number, unit: IngredientUnit): string {
  const rounded = Math.round(quantity * 10) / 10;
  // Whole things print as "1x"; the food name carries the noun.
  if (unit === COUNTED_UNIT) return `${rounded}x`;
  return `${rounded} ${unit}`;
}
