# Recipe pack parser

Turns Emma's eight `#TeamFIT` recipe pack PDFs into structured recipes ready to
seed into `public.recipes` / `public.recipe_ingredients`.

Lives here rather than in a scratch directory because the decisions encoded in
it — how nut-free is derived, which US terms get anglicised, how a wrapped
ingredient line is rejoined — took longer to get right than the code did, and
they are not obvious from the output alone.

**Nothing here has been imported yet.** It is waiting on Emma choosing which of
the 138 are worth bringing in:
https://claude.ai/code/artifact/45bc343b-b5dc-4410-b148-bfb406218391

## Running it

The source PDFs are not in the repo; they live in `~/Downloads` as
`#TeamFIT * Recipe Pack.pdf`. Page 5 onward is where the recipes start, so the
cover, shopping list, contents and meal planner are skipped:

```bash
mkdir -p packs
for f in ~/Downloads/'#TeamFIT'*.pdf; do
  pdftotext -layout -f 5 "$f" "packs/$(basename "$f" .pdf | tr ' ' '_').txt"
done
python3 parse_packs.py packs parsed.json
```

`parse_packs.py` handles the page layout: it finds the gutter between the
ingredient and method columns, pulls the macro row, and joins titles that wrap
onto a second line. `ingredients.py` turns each ingredient line into
`(quantity, unit, food_name, note)`.

`derived.json` is the finished dataset: 138 recipes with dietary tags, parsed
ingredients, and a `needs_review` flag per ingredient.

## What the data is worth trusting on

**Macros are the packs' own, per serving.** 137 of 138 pass an Atwater check
(4C + 4P + 9F within 15% of stated calories). The exception is Protein Porridge
in the 5-Ingredient pack: 375 kcal stated against 314 from its own macros.

**Dietary tags** come from the packs' own key: GF, DF, V (vegetarian, not
vegan). Vegan is derived only for the three plant-based packs.

**Nut-free needs three signals to agree** — no `N` tag, no nut in the
ingredients, no nut in the method — because two recipes are mis-tagged by the
packs themselves: Majudara Bowl contains pine nuts and Pork Meatballs uses
walnuts, and neither carries the pack's own nut warning. Trusting the tag alone
would have certified both as safe. 90 of 138 qualify.

**87% of 1,415 ingredients** carry a real quantity in a unit the app knows
(`g`, `ml`, `tsp`, `tbsp`, `unit`). Cups fold into tablespoons, which is exact;
ounces and pounds into grams. The rest are genuinely unquantified: salt and
pepper, "to serve".

## Known gaps

- **31 ingredients are flagged `needs_review`**, where method text bled into the
  ingredient column on pages whose gutter was detected wrongly, producing notes
  like "maple syrup / 2.Divide between 4 serving bowls".
- **Meal types are not in the packs at all** and still need inferring. This is
  what put Fruity Cous Cous on the race-morning shelf, so the uncertain ones
  want flagging rather than guessing.
- **Collections** need a scheme: seven shelves will not hold this sensibly.
- **Intros are absent.** The column is nullable and the detail screen omits the
  paragraph when there is none, so recipes can ship without.
