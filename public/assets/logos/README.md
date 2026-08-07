# VIRRA logo assets

Production-ready SVGs for the VIRRA wordmark and marks. All are vector, colour-baked,
and transparent-background unless noted. Geometry is derived from the approved master
wordmark and the Vol.02 brand guidelines — the Fraunces italic *i* is preserved exactly
across every wordmark variant (never substitute a roman *i*).

## Wordmark

| File | Letters (V R R A) | Italic *i* | Use on |
|---|---|---|---|
| `virra-logo.svg` | Pulse | Heat | Master source (original supplied artwork) |
| `virra-lockup-ink.svg` | Pulse `#D4FF26` | Heat `#FF2E7E` | Ink / dark backgrounds (default) |
| `virra-lockup-cream.svg` | Ink `#0A0A0F` | Heat `#FF2E7E` | Breath / cream backgrounds |
| `virra-lockup-magenta.svg` | Pulse `#D4FF26` | Breath `#F4EDE0` | Heat / magenta backgrounds |
| `virra-lockup-lime.svg` | Ink `#0A0A0F` | Heat `#FF2E7E` | Pulse / lime backgrounds |

(The cream and lime lockups share the same dark-wordmark treatment — both are provided
so each background has a correctly-named file.)

## Marks

| File | What | Use on |
|---|---|---|
| `virra-monogram-v.svg` | V monogram — Pulse V + Heat baseline bar | Small spaces, avatars, favicon (on dark) |
| `virra-pulse-mark.svg` | Pulse Mark — Pulse ring + Heat pulse trace | App icons, watermarks, end stamps |

## Notes

- **Favicon**: the site currently uses the **V monogram** (`/public/favicon.svg`). The Vol.02
  guidelines nominate the Pulse Mark for the favicon slot; the monogram is a deliberate
  brand-owner choice. Swap by replacing `favicon.svg` if that ever changes.
- **Colours**: Pulse `#D4FF26` · Heat `#FF2E7E` · Ink/Mile `#0A0A0F` · Breath `#F4EDE0`.
- On the website, the wordmark is rendered by `src/components/Logo.astro`, which recolours
  the master via CSS variables — these files are the standalone equivalents for off-web use
  (decks, social, print, partners).
