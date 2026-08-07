# VIRRA logo assets

Production-ready SVGs for the VIRRA wordmark and monogram. All are vector, colour-baked,
and (wordmarks) transparent-background unless noted. Geometry is derived from the approved
master wordmark and the Vol.02 brand guidelines — the Fraunces italic *i* is preserved
exactly across every wordmark variant (never substitute a roman *i*).

## Wordmark

| File | Letters (V R R A) | Italic *i* | Use on |
|---|---|---|---|
| `virra-logo.svg` | Pulse | Heat | Master source (corrected artwork; true Heat *i*) |
| `virra-lockup-ink.svg` | Pulse `#D4FF26` | Heat `#FF2E7E` | Ink / dark backgrounds (default) |
| `virra-lockup-cream.svg` | Ink `#0A0A0F` | Heat `#FF2E7E` | Breath / cream backgrounds |
| `virra-lockup-magenta.svg` | Pulse `#D4FF26` | Breath `#F4EDE0` | Heat / magenta backgrounds |
| `virra-lockup-lime.svg` | Ink `#0A0A0F` | Heat `#FF2E7E` | Pulse / lime backgrounds |

(The cream and lime lockups share the same dark-wordmark treatment — both are provided
so each background has a correctly-named file.)

## Monogram (V)

Solid-background squircles — app-icon / favicon ready. Pulse V or Ink V, always with the
Heat baseline bar.

| File | What | Use on |
|---|---|---|
| `virra-monogram-dark.svg` | Pulse V + Heat bar on Ink | Dark backgrounds, dark app icon, favicon |
| `virra-monogram-light.svg` | Ink V + Heat bar on Breath | Light backgrounds, light app icon |

## Notes

- **Favicon / app icon**: uses the **V monogram** (the site's `/public/favicon.svg` is the
  dark version). Light + dark squircles are provided above for iOS/app-icon use.
- **Pulse Mark**: parked for now — not part of the current asset set.
- **Colours**: Pulse `#D4FF26` · Heat `#FF2E7E` · Ink/Mile `#0A0A0F` · Breath `#F4EDE0`.
  (The legacy pink `#FF3D6E` from the pre-Vol.02 MVP is retired — do not use.)
- On the website, the wordmark is rendered by `src/components/Logo.astro`, which recolours
  the master via CSS variables — these files are the standalone equivalents for off-web use
  (decks, social, print, partners).
