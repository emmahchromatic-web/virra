# -*- coding: utf-8 -*-
"""Turn a pack's ingredient lines into (quantity, unit, food_name, note).

Two problems to solve. The PDF wraps long ingredients across two visual lines,
so "3.5 oz. (100g) cooked chicken" / "breast, chopped" arrives as two entries.
And the packs measure in whatever suits: metric in brackets, US cups, spoons,
or a bare count.

The app's vocabulary is g, ml, tsp, tbsp and 'unit', so cups fold into
tablespoons (exact: 1 cup is 16 tbsp) and ounces into grams. Anything with a
metric weight in brackets uses that and ignores the US figure entirely.
"""
import re

FRAC = {'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875}
NUMTOK = r'(?:\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞]|[½¼¾⅓⅔⅛⅜⅝⅞]|\d+(?:[./]\d+)?)'

def as_number(tok):
    tok = tok.strip()
    if tok in FRAC: return FRAC[tok]
    m = re.fullmatch(rf'(\d+)\s*([{"".join(FRAC)}])', tok)
    if m: return int(m.group(1)) + FRAC[m.group(2)]
    m = re.fullmatch(r'(\d+)/(\d+)', tok)
    if m: return int(m.group(1)) / int(m.group(2))
    try: return float(tok)
    except ValueError: return None

# Ingredients that genuinely carry no quantity. Without this list they look
# identical to a wrapped continuation line, which is the whole difficulty.
UNQUANTIFIED = re.compile(
    r'^\s*(salt\b|pepper\b|sea salt|black pepper|salt ?(&|and) ?pepper|'
    r'olive oil$|cooking spray|oil spray|spray oil|water\b|ice\b|'
    r'to serve|to taste|to garnish|fresh herbs|handful)', re.I)

# A line opening with a metric bracket starts a new ingredient too: the PDF
# wraps "... sliced 4 oz." / "(120g) rocket", and treating the second half as a
# continuation swallowed the rocket entirely.
STARTS_NEW = re.compile(rf'^\s*({NUMTOK}|a\s|an\s|\(\s*[\d.]+\s*(?:g|ml|kg|l)\s*\))', re.I)

def rejoin(lines):
    """Glue wrapped continuation lines back onto the ingredient above them."""
    out = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if out and not STARTS_NEW.match(line) and not UNQUANTIFIED.match(line):
            out[-1] = f'{out[-1]} {line}'
        else:
            out.append(line)
    return out

METRIC = re.compile(rf'\(\s*([\d.]+)\s*(g|ml|kg|l|litre|liter)\s*\)', re.I)
CUP    = re.compile(rf'^\s*({NUMTOK})\s*cups?\b\.?\s*(.*)$', re.I)
SPOON  = re.compile(rf'^\s*({NUMTOK})\s*(tbsp|tablespoons?|tsp|teaspoons?)\b\.?\s*(.*)$', re.I)
OUNCE  = re.compile(rf'^\s*({NUMTOK})\s*(oz|ounces?|lbs?|pounds?)\b\.?\s*(.*)$', re.I)
COUNT  = re.compile(rf'^\s*({NUMTOK})\s+(.*)$')
VAGUE  = re.compile(rf'^\s*({NUMTOK})\s*(handfuls?|pinch(?:es)?|splash(?:es)?|dash(?:es)?|'
                    rf'drizzles?|knobs?|sprigs?|bunch(?:es)?|glugs?)\b\.?\s*(.*)$', re.I)
LEADIN = re.compile(rf'^\s*{NUMTOK}\s*(?:x\s*)?(?:oz|ounces?|lbs?|pounds?|cups?)?\b\.?\s*', re.I)

def split_note(text):
    """"Red onion, chopped" -> ("Red onion", "chopped")."""
    text = text.strip().strip(',').strip()
    m = re.match(r'^([^,(]+?)\s*(?:,\s*(.+)|\((.+)\))\s*$', text)
    if not m:
        return text[:1].upper() + text[1:], None
    name = m.group(1).strip()
    note = (m.group(2) or m.group(3) or '').strip().rstrip('.')
    # Only close a bracket the note actually opened: blanket-stripping ")"
    # turned "chopped (optional)" into "chopped (optional".
    if note.count('(') > note.count(')'): note += ')'
    return name[:1].upper() + name[1:], (note or None)

def parse(line):
    """-> dict(quantity, unit, food_name, note) or None when unquantified."""
    m = METRIC.search(line)
    if m:
        q = as_number(m.group(1)); u = m.group(2).lower()
        if u == 'kg': q, u = q * 1000, 'g'
        if u in ('l','litre','liter'): q, u = q * 1000, 'ml'
        rest = METRIC.sub(' ', line)
        rest = LEADIN.sub('', rest, count=1)
        name, note = split_note(rest)
        return dict(quantity=round(q,1), unit=u, food_name=name, note=note)

    m = CUP.match(line)
    if m and as_number(m.group(1)) is not None:
        # 1 cup is 16 tablespoons exactly, and tbsp is a unit the app knows.
        name, note = split_note(m.group(2))
        return dict(quantity=round(as_number(m.group(1)) * 16, 1), unit='tbsp',
                    food_name=name, note=note)

    m = SPOON.match(line)
    if m and as_number(m.group(1)) is not None:
        unit = 'tbsp' if m.group(2).lower().startswith('tb') else 'tsp'
        name, note = split_note(m.group(3))
        return dict(quantity=round(as_number(m.group(1)),2), unit=unit, food_name=name, note=note)

    m = OUNCE.match(line)
    if m and as_number(m.group(1)) is not None:
        grams = as_number(m.group(1)) * (453.6 if m.group(2).lower().startswith(('lb','pound')) else 28.35)
        name, note = split_note(m.group(3))
        return dict(quantity=round(grams), unit='g', food_name=name, note=note)

    # "2 handfuls rocket" is not two of anything the app can scale, so the
    # measure stays in the note and the quantity stays empty.
    m = VAGUE.match(line)
    if m:
        name, _ = split_note(m.group(3))
        return dict(quantity=None, unit=None, food_name=name,
                    note=f'{m.group(1)} {m.group(2)}'.strip())

    m = COUNT.match(line)
    if m and as_number(m.group(1)) is not None:
        name, note = split_note(m.group(2))
        return dict(quantity=round(as_number(m.group(1)),2), unit='unit', food_name=name, note=note)

    name, note = split_note(line)
    return dict(quantity=None, unit=None, food_name=name, note=note)


# The packs are written in American English. Emma asked for that to go when the
# recipe book was first scoped; these are the terms that actually appear.
ANGLICISE = [
    ('cilantro', 'coriander'), ('arugula', 'rocket'), ('zucchini', 'courgette'),
    ('eggplant', 'aubergine'), ('scallions', 'spring onions'), ('scallion', 'spring onion'),
    ('green onions', 'spring onions'), ('green onion', 'spring onion'),
    ('shrimp', 'prawns'), ('garbanzo beans', 'chickpeas'), ('garbanzos', 'chickpeas'),
    ('all purpose flour', 'plain flour'), ('all-purpose flour', 'plain flour'),
    ('confectioners sugar', 'icing sugar'), ("confectioner's sugar", 'icing sugar'),
    ('powdered sugar', 'icing sugar'), ('heavy cream', 'double cream'),
    ('half and half', 'single cream'), ('ground beef', 'beef mince'),
    ('ground turkey', 'turkey mince'), ('ground pork', 'pork mince'),
    ('ground lamb', 'lamb mince'), ('skillet', 'frying pan'), ('broil', 'grill'),
    ('broiler', 'grill'), ('bell pepper', 'pepper'), ('snow peas', 'mangetout'),
    ('cornstarch', 'cornflour'), ('molasses', 'treacle'), ('canola oil', 'rapeseed oil'),
    ('chili powder', 'chilli powder'), ('chili flakes', 'chilli flakes'),
    ('red chili', 'red chilli'), ('green chili', 'green chilli'),
    ('beets', 'beetroot'), ('cookie', 'biscuit'), ('cookies', 'biscuits'),
    ('oatmeal', 'porridge oats'), ('broth', 'stock'), ('fava beans', 'broad beans'),
]

def anglicise(text, capitalise=False):
    if not text: return text
    out = text
    for us, uk in ANGLICISE:
        out = re.sub(rf'\b{re.escape(us)}\b', uk, out, flags=re.I)
    # The substitutions are case-insensitive and insert lowercase, so a food
    # name that started a sentence has to be put back.
    if capitalise and out: out = out[:1].upper() + out[1:]
    return out
