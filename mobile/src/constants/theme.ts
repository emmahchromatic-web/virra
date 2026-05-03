export const colors = {
  pulse:   '#D4FF26',
  heat:    '#FF2E7E',
  mile:    '#0A0A0F',
  breath:  '#F4EDE0',
  dawn:    '#FF6B3D',
  mist:    '#1C1C24',
  muted:   'rgba(244, 237, 224, 0.35)',
  border:  'rgba(244, 237, 224, 0.08)',
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
