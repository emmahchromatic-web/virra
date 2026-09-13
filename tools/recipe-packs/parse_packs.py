import re, sys, json, subprocess, glob, os
from pathlib import Path

MACRO_HDR = re.compile(r'Prep\s+(?:Marinate\s+)?(?:Cook\s+)?Kcal\s+Fats\(g\)\s+Carbs\(g\)\s+Protein\(g\)(?:\s+Fibre\(g\))?')
HAS_FIBRE = re.compile(r'Fibre\(g\)')
SERVES    = re.compile(r'^\s*(?:Serves|Makes)\s+([0-9]+)', re.I)
# "20 mins", "1 hr", "4-6 hrs", "1 hr 30 mins". Hours must be stripped too or
# the hour count is mistaken for a macro.
TIME_TOK  = re.compile(r'\d+(?:-\d+)?\s*(?:mins?|minutes?|hrs?|hours?)', re.I)
TIMES     = re.compile(r'(\d+)(?:-\d+)?\s*(mins?|minutes?|hrs?|hours?)', re.I)
BARCODE   = re.compile(r'\b\d{7,9}\b')
NUMS      = re.compile(r'(\d+(?:\.\d+)?)')

def column_split(lines):
    """Find the gutter: the column where most non-blank lines have a run of spaces."""
    width = max((len(l) for l in lines), default=0)
    if width < 40: return None
    best, bestscore = None, 0
    for c in range(24, min(width, 70)):
        score = 0
        for l in lines:
            if not l.strip(): continue
            seg = l[max(0,c-3):c+3]
            if seg.strip() == '': score += 1
        if score > bestscore: best, bestscore = c, score
    live = sum(1 for l in lines if l.strip())
    return best if live and bestscore / live > 0.8 else None

def _mins(t):
    n, u = t
    return n * 60 if u.startswith(('hr','hour')) else n

def parse_page(page):
    lines = page.split('\n')
    m = [i for i,l in enumerate(lines) if MACRO_HDR.search(l)]
    if not m: return None
    hdr = m[0]
    # macro values are on the next non-blank line after the header
    vals = None
    for l in lines[hdr+1:hdr+5]:
        n = NUMS.findall(l)
        if len(n) >= 4: vals = l; break
    if not vals: return None
    times = [(int(n), u.lower()) for n, u in TIMES.findall(vals)]
    stripped = TIME_TOK.sub(' ', BARCODE.sub(' ', vals))
    stripped = re.sub(r'\(?overnight\)?', ' ', stripped, flags=re.I)
    nums  = [float(x) for x in NUMS.findall(stripped)]
    has_fibre = bool(HAS_FIBRE.search(lines[hdr]))
    need = 5 if has_fibre else 4
    if len(nums) < need: return None
    if has_fibre: kcal, fat, carb, prot, fib = nums[:5]
    else:         (kcal, fat, carb, prot), fib = nums[:4], None

    si = next((i for i,l in enumerate(lines) if SERVES.match(l)), None)

    # The title sits above the "Serves" line and wraps onto a second line on
    # about a third of the pages, so take every line above it rather than the
    # first: "Kale, Mushroom &" / "Goat Cheese Egg Cups" is one name.
    head = [re.sub(r'^\d+\s+', '', l.strip()) for l in lines[:si if si is not None else 6]]
    head = [h for h in head if h and not h.isdigit()]
    title = ' '.join(head[-3:]).strip() or None
    serves = int(SERVES.match(lines[si]).group(1)) if si is not None else 1

    body = lines[(si+1 if si is not None else 0):hdr]
    cut  = column_split(body)
    if cut:
        left  = [l[:cut].rstrip() for l in body]
        right = [l[cut:].rstrip() for l in body]
    else:
        left, right = body, []

    def clean(ls):
        out=[]
        for l in ls:
            t=l.strip()
            if not t: continue
            if re.fullmatch(r'[A-Z]{1,2}(\s+[A-Z]{1,2})*', t): continue   # tag row
            if 'myfitnesspal' in t.lower() or t.isdigit(): continue
            if t.startswith('*'): continue
            out.append(t)
        return out

    tagline = ' '.join(l.strip() for l in lines[hdr-6:hdr] if re.fullmatch(r'\s*(?:[A-Z]{1,2}\s+)*[A-Z]{1,2}\s*', l))
    tags = re.findall(r'\b(GF|DF|LC|HP|MP|Q|V|VG|N)\b', tagline)

    return dict(title=title, serves=serves,
                ingredients=clean(left), method=clean(right),
                kcal=kcal, fat_g=fat, carbs_g=carb, protein_g=prot, fibre_g=fib,
                prep_min=_mins(times[0]) if times else None,
                cook_min=_mins(times[-1]) if len(times)>1 else None,
                tags=sorted(set(tags)))

def parse_pack(path):
    txt = Path(path).read_text(encoding='utf-8', errors='replace')
    out=[]
    for page in txt.split('\f'):
        r = parse_page(page)
        if r: out.append(r)
    return out

if __name__ == '__main__':
    allr={}
    for f in sorted(glob.glob(sys.argv[1]+'/*.txt')):
        name=Path(f).stem
        rs=parse_pack(f)
        allr[name]=rs
        print(f"{len(rs):3d}  {name}")
    print("total:", sum(len(v) for v in allr.values()))
    Path(sys.argv[2]).write_text(json.dumps(allr, indent=1))
