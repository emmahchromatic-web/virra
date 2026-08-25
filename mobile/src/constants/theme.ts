export const colors = {
  pulse:   '#D4FF26',
  heat:    '#FF2E7E',
  mile:    '#0A0A0F',
  breath:  '#F4EDE0',
  dawn:    '#FF6B3D',
  mist:    '#1C1C24',
  slate:   '#9DB8AC',
  sage:    '#94B062',
  peach:   '#F5A077',
  muted:   'rgba(244, 237, 224, 0.5)',
  // Decorative hairlines: card edges, dividers, separators. WCAG 1.4.11 does
  // not apply to these, since they carry no meaning and are not interactive.
  border:  'rgba(244, 237, 224, 0.08)',
  // The edge of something you can actually tap: inputs, pickers, steppers,
  // date selectors. WCAG 1.4.11 wants 3:1 for a UI component boundary, and
  // `border` measures 1.24:1 on a card and 1.17:1 on the page, so a control
  // wearing it does not read as a control at all. This is 3.21:1 on mist and
  // 3.17:1 on mile. Card 218.
  control: 'rgba(244, 237, 224, 0.38)',
} as const;

export const fonts = {
  display:      'BigShouldersDisplay_900Black',
  displayBold:  'BigShouldersDisplay_700Bold',
  serif:        'Fraunces_400Regular_Italic',
  serifSemi:    'Fraunces_600SemiBold_Italic',
  body:         'Inter_400Regular',
  bodyMedium:   'Inter_500Medium',
  bodySemi:     'Inter_600SemiBold',
  mono:         'SpaceMono_400Regular',
  monoBold:     'SpaceMono_700Bold',
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const radius = {
  sm:   6,
  md:   10,
  lg:   16,
  full: 999,
} as const;

export type ColorKey   = keyof typeof colors;
export type FontKey    = keyof typeof fonts;
export type SpacingKey = keyof typeof spacing;
export type RadiusKey  = keyof typeof radius;
