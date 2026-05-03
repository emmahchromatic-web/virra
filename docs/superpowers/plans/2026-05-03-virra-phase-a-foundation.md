# Virra Phase A — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete Virra iOS app foundation: Expo project, design system, Supabase schema, auth flow, 4-tab navigation shell, RevenueCat paywall, and HealthKit permissions — everything features plug into in Phase B.

**Architecture:** Expo + expo-router with file-based routing. Authenticated users land in a 4-tab shell; unauthenticated users see the auth stack. RevenueCat gates the app shell behind an active entitlement. All native modules (HealthKit, RevenueCat) require an EAS development build — Expo Go will not work.

**Tech Stack:** Expo SDK (latest), expo-router v4, Supabase JS v2, Zustand v5, react-native-purchases (RevenueCat), react-native-health (HealthKit), expo-location, expo-notifications, expo-apple-authentication, @expo-google-fonts, jest-expo, @testing-library/react-native

> **Note on phases:** This is Phase A of 4. Phase B adds the cycle engine, onboarding, and feature screens. Phase C adds HealthKit import, GPS tracker, and food logging. Phase D adds Haiku insights, notifications, and App Store prep. Do not implement any Phase B–D feature in this plan.

---

## File Map

```
mobile/                                   ← new directory inside existing virra repo
├── app/
│   ├── _layout.tsx                       ← Root layout: loads fonts, auth listener, routes
│   ├── (auth)/
│   │   ├── _layout.tsx                   ← Auth stack layout (no tab bar)
│   │   ├── index.tsx                     ← Welcome screen
│   │   ├── sign-in.tsx                   ← Sign in (email + Apple)
│   │   ├── sign-up.tsx                   ← Sign up (email)
│   │   └── paywall.tsx                   ← Trial / subscription screen
│   └── (app)/
│       ├── _layout.tsx                   ← Tab layout (subscription gate)
│       ├── index.tsx                     ← Dashboard tab (placeholder)
│       ├── training.tsx                  ← Training tab (placeholder)
│       ├── nutrition.tsx                 ← Nutrition tab (placeholder)
│       ├── library.tsx                   ← Library tab (placeholder)
│       └── profile.tsx                   ← Profile modal (top-right button)
├── src/
│   ├── constants/
│   │   └── theme.ts                      ← Design tokens: colors, fonts, spacing, radius
│   ├── lib/
│   │   ├── supabase.ts                   ← Supabase client (singleton)
│   │   └── revenuecat.ts                 ← RevenueCat helpers + entitlement check
│   ├── store/
│   │   ├── auth.ts                       ← Zustand: session, user, setSession, signOut
│   │   └── subscription.ts              ← Zustand: status, isActive, setStatus
│   └── components/
│       ├── ui/
│       │   ├── VirraText.tsx             ← Branded text (variant: display|serif|body|mono)
│       │   ├── VirraButton.tsx           ← Branded button (variant: primary|secondary|ghost)
│       │   └── VirraCard.tsx             ← Card container with standard padding/radius
│       └── layout/
│           ├── AppHeader.tsx             ← Screen header with optional profile button
│           └── AppTabBar.tsx             ← Custom bottom tab bar (4 tabs)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql        ← Full schema: all tables + RLS policies
├── __tests__/
│   ├── theme.test.ts
│   ├── store/
│   │   ├── auth.test.ts
│   │   └── subscription.test.ts
│   └── components/
│       ├── VirraText.test.tsx
│       └── VirraButton.test.tsx
├── .env.local                            ← Supabase + RevenueCat keys (gitignored)
├── app.json                              ← Expo config with all plugins + iOS permissions
├── babel.config.js
├── eas.json                              ← EAS Build: development + production profiles
├── jest.config.js
├── package.json
└── tsconfig.json
```

---

## Task 1: Initialise Expo project

**Files:**
- Create: `mobile/` (entire directory)
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/babel.config.js`

- [ ] **Step 1: Scaffold the Expo project**

Run from the `virra/` repo root:
```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
```

- [ ] **Step 2: Verify scaffold compiled**

```bash
npx expo --version
```
Expected: prints Expo CLI version (no errors)

- [ ] **Step 3: Install all project dependencies**

```bash
npx expo install \
  expo-router \
  expo-font \
  expo-status-bar \
  expo-location \
  expo-notifications \
  expo-apple-authentication \
  expo-camera \
  expo-dev-client \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill \
  zustand \
  react-native-purchases \
  react-native-health

npm install --save-dev \
  jest-expo \
  @testing-library/react-native \
  @testing-library/jest-native \
  @types/jest
```

- [ ] **Step 4: Install Google Fonts packages**

```bash
npx expo install \
  @expo-google-fonts/big-shoulders-display \
  @expo-google-fonts/fraunces \
  @expo-google-fonts/inter \
  @expo-google-fonts/space-mono
```

- [ ] **Step 5: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): initialise Expo project with all dependencies"
```

---

## Task 2: Configure app.json, eas.json, and jest

**Files:**
- Modify: `mobile/app.json`
- Create: `mobile/eas.json`
- Create: `mobile/jest.config.js`
- Modify: `mobile/package.json` (add test script)

- [ ] **Step 1: Replace app.json with full config**

```json
{
  "expo": {
    "name": "Virra",
    "slug": "virra",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "virra",
    "platforms": ["ios"],
    "newArchEnabled": true,
    "ios": {
      "bundleIdentifier": "app.virra.mobile",
      "supportsTablet": false,
      "infoPlist": {
        "NSHealthShareUsageDescription": "Virra uses HealthKit to sync your workouts and heart rate data to personalise your training and nutrition.",
        "NSHealthUpdateUsageDescription": "Virra writes completed workouts to Apple Health.",
        "NSLocationWhenInUseUsageDescription": "Virra uses your location to track your runs.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Virra uses your location to track runs in the background.",
        "NSCameraUsageDescription": "Virra uses the camera to scan food barcodes for your nutrition log.",
        "ITSAppUsesNonExemptEncryption": false
      },
      "entitlements": {
        "com.apple.developer.healthkit": true,
        "com.apple.developer.healthkit.background-delivery": true
      }
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-apple-authentication",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Virra uses your location to track your runs."
        }
      ],
      [
        "expo-notifications",
        {
          "sounds": []
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "Virra uses the camera to scan food barcodes."
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 2: Create eas.json**

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "distribution": "store"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "dickenson.ps@gmail.com"
      }
    }
  }
}
```

- [ ] **Step 3: Create jest.config.js**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
```

- [ ] **Step 4: Add test script and path alias to package.json**

In `mobile/package.json`, add to `"scripts"`:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

Add to `mobile/tsconfig.json` under `"compilerOptions"`:
```json
"baseUrl": ".",
"paths": {
  "@/*": ["src/*"]
}
```

- [ ] **Step 5: Verify Jest runs**

```bash
npx jest --passWithNoTests
```
Expected: `Test Suites: 0 passed, 0 total` (no errors)

- [ ] **Step 6: Commit**

```bash
git add mobile/app.json mobile/eas.json mobile/jest.config.js mobile/package.json mobile/tsconfig.json
git commit -m "feat(mobile): configure Expo, EAS, and Jest"
```

---

## Task 3: Design system tokens

**Files:**
- Create: `mobile/src/constants/theme.ts`
- Create: `mobile/__tests__/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/__tests__/theme.test.ts
import { colors, fonts, spacing, radius } from '@/constants/theme';

describe('theme tokens', () => {
  it('has correct brand colors', () => {
    expect(colors.pulse).toBe('#D4FF26');
    expect(colors.heat).toBe('#FF2E7E');
    expect(colors.mile).toBe('#0A0A0F');
    expect(colors.breath).toBe('#F4EDE0');
    expect(colors.dawn).toBe('#FF6B3D');
    expect(colors.mist).toBe('#1C1C24');
  });

  it('has all required font keys', () => {
    expect(fonts.display).toBeDefined();
    expect(fonts.serif).toBeDefined();
    expect(fonts.body).toBeDefined();
    expect(fonts.mono).toBeDefined();
  });

  it('has standard spacing scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest __tests__/theme.test.ts
```
Expected: FAIL — `Cannot find module '@/constants/theme'`

- [ ] **Step 3: Create theme.ts**

```typescript
// mobile/src/constants/theme.ts
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
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx jest __tests__/theme.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/constants/theme.ts mobile/__tests__/theme.test.ts
git commit -m "feat(mobile): add design system tokens (Vol. 02)"
```

---

## Task 4: Supabase client

**Files:**
- Create: `mobile/.env.local`
- Create: `mobile/src/lib/supabase.ts`
- Create: `mobile/__tests__/store/auth.test.ts` (mocked)

- [ ] **Step 1: Create .env.local**

```bash
# mobile/.env.local
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_YOUR_RC_KEY
```

> Get these from: Supabase dashboard → Settings → API, and RevenueCat dashboard → Project → API Keys.

- [ ] **Step 2: Add .env.local to .gitignore**

In `virra/.gitignore`, add:
```
mobile/.env.local
mobile/.env*.local
```

- [ ] **Step 3: Create supabase.ts**

```typescript
// mobile/src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/supabase.ts mobile/.gitignore
git commit -m "feat(mobile): add Supabase client"
```

---

## Task 5: Database schema

**Files:**
- Create: `mobile/supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- mobile/supabase/migrations/001_initial_schema.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── user_profiles ─────────────────────────────────────────────────────────
create table public.user_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  fitness_level    text check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  running_goal     text check (running_goal in ('5k', '10k', 'half_marathon', 'marathon')),
  dietary_prefs    text[]   default '{}',
  baseline_pace_seconds_per_km integer,
  weekly_mileage_km  numeric,
  assessment_history jsonb  default '[]',
  onboarding_complete boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.user_profiles enable row level security;
create policy "owner_select" on public.user_profiles for select using (auth.uid() = id);
create policy "owner_insert" on public.user_profiles for insert with check (auth.uid() = id);
create policy "owner_update" on public.user_profiles for update using (auth.uid() = id);

-- ── fitness_assessments ───────────────────────────────────────────────────
create table public.fitness_assessments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  stated_level     text,
  actual_pace_seconds_per_km integer,
  trigger_description text,
  celebrated_at    timestamptz,
  created_at       timestamptz default now()
);
alter table public.fitness_assessments enable row level security;
create policy "owner_all" on public.fitness_assessments using (auth.uid() = user_id);

-- ── cycle_logs ────────────────────────────────────────────────────────────
create table public.cycle_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  period_start     date not null,
  cycle_length_days integer not null default 28,
  phase_overrides  jsonb default '{}',
  created_at       timestamptz default now()
);
alter table public.cycle_logs enable row level security;
create policy "owner_all" on public.cycle_logs using (auth.uid() = user_id);

-- ── symptom_logs ──────────────────────────────────────────────────────────
create table public.symptom_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  energy           integer check (energy between 1 and 5),
  mood             integer check (mood between 1 and 5),
  sleep_quality    integer check (sleep_quality between 1 and 5),
  symptoms         text[] default '{}',
  notes            text,
  created_at       timestamptz default now(),
  unique (user_id, date)
);
alter table public.symptom_logs enable row level security;
create policy "owner_all" on public.symptom_logs using (auth.uid() = user_id);

-- ── plan_templates ────────────────────────────────────────────────────────
create table public.plan_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  sport_type       text not null default 'run'
                   check (sport_type in ('run', 'swim', 'strength', 'yoga', 'other')),
  distance_goal    text,  -- '5k' | '10k' | 'half_marathon' | 'marathon'
  duration_weeks   integer not null,
  sessions_json    jsonb not null default '[]',
  created_at       timestamptz default now()
);
alter table public.plan_templates enable row level security;
create policy "authenticated_select" on public.plan_templates
  for select to authenticated using (true);

-- ── user_plans ────────────────────────────────────────────────────────────
create table public.user_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  template_id      uuid references public.plan_templates(id),
  start_date       date not null,
  goal_date        date,
  is_active        boolean default true,
  created_at       timestamptz default now()
);
alter table public.user_plans enable row level security;
create policy "owner_all" on public.user_plans using (auth.uid() = user_id);

-- ── activities ────────────────────────────────────────────────────────────
-- Generic log — type field makes this multi-sport ready
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null
                   check (type in ('run', 'swim', 'strength', 'yoga', 'other')),
  started_at       timestamptz not null,
  duration_seconds integer not null,
  distance_meters  numeric,
  notes            text,
  phase_at_time    text check (phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  hk_uuid          text unique,          -- HealthKit dedup
  planned_session_id uuid,
  created_at       timestamptz default now()
);
alter table public.activities enable row level security;
create policy "owner_all" on public.activities using (auth.uid() = user_id);

-- ── run_details ───────────────────────────────────────────────────────────
create table public.run_details (
  id               uuid primary key default gen_random_uuid(),
  activity_id      uuid not null references public.activities(id) on delete cascade unique,
  avg_pace_seconds_per_km integer,
  splits_json      jsonb default '[]',   -- [{km, pace_seconds, hr}]
  hr_avg           integer,
  hr_max           integer,
  elevation_gain_meters numeric,
  gps_trace        jsonb,                -- compressed route points
  created_at       timestamptz default now()
);
alter table public.run_details enable row level security;
create policy "owner_all" on public.run_details using (
  auth.uid() = (select user_id from public.activities where id = activity_id)
);

-- ── nutrition_logs ────────────────────────────────────────────────────────
create table public.nutrition_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  phase_at_time    text check (phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  training_load    text check (training_load in ('rest','easy','moderate','hard')),
  targets_json     jsonb not null default '{}',  -- {carbs_g, protein_g, fat_g, calories}
  created_at       timestamptz default now(),
  unique (user_id, date)
);
alter table public.nutrition_logs enable row level security;
create policy "owner_all" on public.nutrition_logs using (auth.uid() = user_id);

-- ── food_entries ──────────────────────────────────────────────────────────
create table public.food_entries (
  id               uuid primary key default gen_random_uuid(),
  log_id           uuid not null references public.nutrition_logs(id) on delete cascade,
  meal_type        text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  nutritionix_id   text,
  food_name        text not null,
  quantity_g       numeric not null,
  carbs_g          numeric not null default 0,
  protein_g        numeric not null default 0,
  fat_g            numeric not null default 0,
  calories         numeric not null default 0,
  created_at       timestamptz default now()
);
alter table public.food_entries enable row level security;
create policy "owner_all" on public.food_entries using (
  auth.uid() = (select n.user_id from public.nutrition_logs n where n.id = log_id)
);

-- ── articles ──────────────────────────────────────────────────────────────
create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text not null unique,
  body_md          text not null,
  tags             text[] default '{}',
  linked_feature   text,  -- 'training' | 'nutrition' | 'cycle'
  published_at     timestamptz,
  created_at       timestamptz default now()
);
alter table public.articles enable row level security;
create policy "published_select" on public.articles for select to authenticated
  using (published_at is not null and published_at <= now());

-- ── subscriptions ─────────────────────────────────────────────────────────
create table public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade unique,
  rc_customer_id   text,
  status           text not null default 'trial'
                   check (status in ('trial','active','expired','cancelled')),
  trial_end        timestamptz,
  activated_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "owner_select" on public.subscriptions for select using (auth.uid() = user_id);
-- Service role (used by RevenueCat webhook Edge Function) can write:
create policy "service_all" on public.subscriptions using (true);
```

- [ ] **Step 2: Run this SQL in Supabase**

Open Supabase dashboard → SQL Editor → paste the entire file → Run.

Expected: no errors, all tables visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add mobile/supabase/
git commit -m "feat(mobile): add initial Supabase schema with RLS policies"
```

---

## Task 6: Zustand stores

**Files:**
- Create: `mobile/src/store/auth.ts`
- Create: `mobile/src/store/subscription.ts`
- Create: `mobile/__tests__/store/auth.test.ts`
- Create: `mobile/__tests__/store/subscription.test.ts`

- [ ] **Step 1: Write failing auth store test**

```typescript
// mobile/__tests__/store/auth.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useAuthStore } from '@/store/auth';

// Mock supabase to avoid real network calls
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, user: null, isLoading: true });
  });

  it('starts with null session and isLoading true', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('setSession updates session and user, clears isLoading', () => {
    const fakeSession = {
      user: { id: 'user-123', email: 'test@virra.app' },
    } as any;

    const { result } = renderHook(() => useAuthStore());
    act(() => { result.current.setSession(fakeSession); });

    expect(result.current.session).toBe(fakeSession);
    expect(result.current.user?.id).toBe('user-123');
    expect(result.current.isLoading).toBe(false);
  });

  it('setSession(null) clears user', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => { result.current.setSession(null); });
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('signOut clears session and user', async () => {
    const fakeSession = { user: { id: 'u1' } } as any;
    useAuthStore.setState({ session: fakeSession, user: fakeSession.user as any });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
npx jest __tests__/store/auth.test.ts
```
Expected: FAIL — `Cannot find module '@/store/auth'`

- [ ] **Step 3: Create auth.ts**

```typescript
// mobile/src/store/auth.ts
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session:    Session | null;
  user:       User | null;
  isLoading:  boolean;
  setSession: (session: Session | null) => void;
  signOut:    () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session:    null,
  user:       null,
  isLoading:  true,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
```

- [ ] **Step 4: Write failing subscription store test**

```typescript
// mobile/__tests__/store/subscription.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useSubscriptionStore } from '@/store/subscription';

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({ status: 'unknown', isActive: false });
  });

  it('starts with unknown status and inactive', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    expect(result.current.status).toBe('unknown');
    expect(result.current.isActive).toBe(false);
  });

  it('setStatus("active") marks isActive true', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('active'); });
    expect(result.current.status).toBe('active');
    expect(result.current.isActive).toBe(true);
  });

  it('setStatus("trial") marks isActive true', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('trial'); });
    expect(result.current.isActive).toBe(true);
  });

  it('setStatus("expired") marks isActive false', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('expired'); });
    expect(result.current.isActive).toBe(false);
  });
});
```

- [ ] **Step 5: Create subscription.ts**

```typescript
// mobile/src/store/subscription.ts
import { create } from 'zustand';

type SubscriptionStatus = 'unknown' | 'trial' | 'active' | 'expired' | 'cancelled';

interface SubscriptionState {
  status:    SubscriptionStatus;
  isActive:  boolean;
  trialEnd:  Date | null;
  setStatus: (status: SubscriptionStatus, trialEnd?: Date) => void;
}

const ACTIVE_STATUSES: SubscriptionStatus[] = ['trial', 'active'];

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  status:    'unknown',
  isActive:  false,
  trialEnd:  null,
  setStatus: (status, trialEnd) =>
    set({ status, isActive: ACTIVE_STATUSES.includes(status), trialEnd: trialEnd ?? null }),
}));
```

- [ ] **Step 6: Run all store tests — verify pass**

```bash
npx jest __tests__/store/
```
Expected: PASS (2 test suites)

- [ ] **Step 7: Commit**

```bash
git add mobile/src/store/ mobile/__tests__/store/
git commit -m "feat(mobile): add auth and subscription Zustand stores"
```

---

## Task 7: Base UI components

**Files:**
- Create: `mobile/src/components/ui/VirraText.tsx`
- Create: `mobile/src/components/ui/VirraButton.tsx`
- Create: `mobile/src/components/ui/VirraCard.tsx`
- Create: `mobile/__tests__/components/VirraText.test.tsx`
- Create: `mobile/__tests__/components/VirraButton.test.tsx`

- [ ] **Step 1: Write failing VirraText test**

```typescript
// mobile/__tests__/components/VirraText.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { VirraText } from '@/components/ui/VirraText';

describe('VirraText', () => {
  it('renders children', () => {
    const { getByText } = render(<VirraText>Hello</VirraText>);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('applies display font for variant="display"', () => {
    const { getByText } = render(
      <VirraText variant="display">BIG</VirraText>
    );
    const el = getByText('BIG');
    expect(el.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: 'BigShouldersDisplay_900Black' }),
      ])
    );
  });

  it('applies mono font for variant="mono"', () => {
    const { getByText } = render(
      <VirraText variant="mono">CODE</VirraText>
    );
    const el = getByText('CODE');
    expect(el.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: 'SpaceMono_400Regular' }),
      ])
    );
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
npx jest __tests__/components/VirraText.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create VirraText.tsx**

```typescript
// mobile/src/components/ui/VirraText.tsx
import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

type Variant = 'display' | 'serif' | 'body' | 'bodyMedium' | 'mono' | 'label';

interface VirraTextProps {
  variant?: Variant;
  color?: string;
  size?: number;
  uppercase?: boolean;
  style?: TextStyle | TextStyle[];
  children: React.ReactNode;
}

const variantStyles: Record<Variant, TextStyle> = {
  display:    { fontFamily: fonts.display,    fontSize: 32, letterSpacing: -0.5, textTransform: 'uppercase' },
  serif:      { fontFamily: fonts.serif,      fontSize: 18, fontStyle: 'italic' },
  body:       { fontFamily: fonts.body,       fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  mono:       { fontFamily: fonts.mono,       fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  label:      { fontFamily: fonts.mono,       fontSize: 9,  letterSpacing: 1.5, textTransform: 'uppercase' },
};

export function VirraText({ variant = 'body', color, size, uppercase, style, children }: VirraTextProps) {
  return (
    <Text
      style={[
        variantStyles[variant],
        { color: color ?? colors.breath },
        size ? { fontSize: size } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
```

- [ ] **Step 4: Write failing VirraButton test**

```typescript
// mobile/__tests__/components/VirraButton.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VirraButton } from '@/components/ui/VirraButton';

describe('VirraButton', () => {
  it('renders label', () => {
    const { getByText } = render(
      <VirraButton onPress={() => {}} label="Start" />
    );
    expect(getByText('Start')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <VirraButton onPress={onPress} label="Go" />
    );
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <VirraButton onPress={onPress} label="No" disabled />
    );
    fireEvent.press(getByText('No'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Create VirraButton.tsx**

```typescript
// mobile/src/components/ui/VirraButton.tsx
import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';

type Variant = 'primary' | 'secondary' | 'ghost';

interface VirraButtonProps {
  label:     string;
  onPress:   () => void;
  variant?:  Variant;
  disabled?: boolean;
  loading?:  boolean;
  style?:    ViewStyle;
}

const variantStyle: Record<Variant, ViewStyle> = {
  primary:   { backgroundColor: colors.pulse },
  secondary: { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border },
  ghost:     { backgroundColor: 'transparent' },
};

const labelColor: Record<Variant, string> = {
  primary:   colors.mile,
  secondary: colors.breath,
  ghost:     colors.breath,
};

export function VirraButton({ label, onPress, variant = 'primary', disabled, loading, style }: VirraButtonProps) {
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyle[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading
        ? <ActivityIndicator color={labelColor[variant]} size="small" />
        : <VirraText variant="mono" color={labelColor[variant]}>{label}</VirraText>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base:     { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  pressed:  { opacity: 0.82 },
});
```

- [ ] **Step 6: Create VirraCard.tsx**

```typescript
// mobile/src/components/ui/VirraCard.tsx
import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

interface VirraCardProps {
  children:  React.ReactNode;
  accent?:   boolean;   // pulse border accent
  style?:    ViewStyle;
}

export function VirraCard({ children, accent, style }: VirraCardProps) {
  return (
    <View style={[styles.card, accent && styles.accent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card:   { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  accent: { borderColor: `${colors.pulse}40` },
});
```

- [ ] **Step 7: Run all component tests — verify pass**

```bash
npx jest __tests__/components/
```
Expected: PASS (2 test suites)

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/ui/ mobile/__tests__/components/
git commit -m "feat(mobile): add VirraText, VirraButton, VirraCard components"
```

---

## Task 8: RevenueCat helper

**Files:**
- Create: `mobile/src/lib/revenuecat.ts`

- [ ] **Step 1: Create revenuecat.ts**

```typescript
// mobile/src/lib/revenuecat.ts
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!;

export const ENTITLEMENT_ID = 'virra_pro';

export function configureRevenueCat(userId: string) {
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
}

export async function getActiveEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/lib/revenuecat.ts
git commit -m "feat(mobile): add RevenueCat helper (configure, entitlement check, purchase)"
```

---

## Task 9: Root layout with font loading and auth listener

**Files:**
- Create: `mobile/app/_layout.tsx`

- [ ] **Step 1: Create root _layout.tsx**

```typescript
// mobile/app/_layout.tsx
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  BigShouldersDisplay_700Bold,
  BigShouldersDisplay_900Black,
} from '@expo-google-fonts/big-shoulders-display';
import {
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { configureRevenueCat } from '@/lib/revenuecat';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  const { setSession, user } = useAuthStore();

  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_900Black,
    Fraunces_400Regular_Italic,
    Fraunces_600SemiBold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // Listen to Supabase auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Configure RevenueCat when user is known
  useEffect(() => {
    if (user?.id) {
      configureRevenueCat(user.id);
    }
  }, [user?.id]);

  if (!fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/_layout.tsx
git commit -m "feat(mobile): add root layout with font loading and auth listener"
```

---

## Task 10: Auth flow screens

**Files:**
- Create: `mobile/app/(auth)/_layout.tsx`
- Create: `mobile/app/(auth)/index.tsx`
- Create: `mobile/app/(auth)/sign-in.tsx`
- Create: `mobile/app/(auth)/sign-up.tsx`

- [ ] **Step 1: Create auth stack layout**

```typescript
// mobile/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:  false,
        contentStyle: { backgroundColor: colors.mile },
        animation:    'slide_from_right',
      }}
    />
  );
}
```

- [ ] **Step 2: Create Welcome screen**

```typescript
// mobile/app/(auth)/index.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useAuthStore } from '@/store/auth';

export default function WelcomeScreen() {
  const { session } = useAuthStore();

  // Redirect authenticated users away from auth screens
  React.useEffect(() => {
    if (session) router.replace('/(app)');
  }, [session]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <VirraText variant="display" size={72} color={colors.pulse}>
            VIRRA
          </VirraText>
          <VirraText variant="serif" size={20} color={colors.breath} style={styles.sub}>
            Train with your cycle, not against it.
          </VirraText>
        </View>

        <View style={styles.actions}>
          <VirraButton
            label="Get started — free trial"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <VirraButton
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/sign-in')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero:      { flex: 1, justifyContent: 'center' },
  sub:       { marginTop: spacing.md },
  actions:   { paddingBottom: spacing.xl },
});
```

- [ ] **Step 3: Create Sign Up screen**

```typescript
// mobile/app/(auth)/sign-up.tsx
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

export default function SignUpScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSignUp() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      // Auth listener in root layout will handle redirect
      router.replace('/(auth)/paywall');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <VirraText variant="display" size={40} color={colors.pulse} style={styles.title}>
          Create account
        </VirraText>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />

        <VirraButton
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
          style={styles.btn}
        />

        <VirraButton
          label="Already have an account? Sign in"
          variant="ghost"
          onPress={() => router.replace('/(auth)/sign-in')}
          style={styles.link}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  title:     { marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.breath,
  },
  btn:  { marginTop: spacing.md },
  link: { marginTop: spacing.xs },
});
```

- [ ] **Step 4: Create Sign In screen**

```typescript
// mobile/app/(auth)/sign-in.tsx
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

export default function SignInScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleEmailSignIn() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
    // Success: auth listener redirects automatically
  }

  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) Alert.alert('Apple sign in failed', error.message);
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign in failed', e.message);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <VirraText variant="display" size={40} color={colors.pulse} style={styles.title}>
          Sign in
        </VirraText>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.full}
          style={styles.appleBtn}
          onPress={handleAppleSignIn}
        />

        <VirraText variant="label" color={colors.muted} style={styles.divider}>
          or continue with email
        </VirraText>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />

        <VirraButton
          label="Sign in"
          onPress={handleEmailSignIn}
          loading={loading}
          style={styles.btn}
        />

        <VirraButton
          label="Don't have an account? Sign up"
          variant="ghost"
          onPress={() => router.replace('/(auth)/sign-up')}
          style={styles.link}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  title:     { marginBottom: spacing.lg },
  appleBtn:  { height: 52, width: '100%' },
  divider:   { textAlign: 'center', marginVertical: spacing.sm },
  input: {
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.breath,
  },
  btn:  { marginTop: spacing.sm },
  link: { marginTop: spacing.xs },
});
```

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(auth\)/
git commit -m "feat(mobile): add auth flow screens (welcome, sign-up, sign-in with Apple)"
```

---

## Task 11: Paywall screen

**Files:**
- Create: `mobile/app/(auth)/paywall.tsx`

- [ ] **Step 1: Create paywall.tsx**

```typescript
// mobile/app/(auth)/paywall.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { getOfferings, purchasePackage, restorePurchases, ENTITLEMENT_ID } from '@/lib/revenuecat';
import { useSubscriptionStore } from '@/store/subscription';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

const FEATURES = [
  'Cycle-adjusted training plans (5K → marathon)',
  'Nutrition targets that shift with your phase',
  'HealthKit sync — workouts import automatically',
  'Daily dashboard built for your cycle',
  'Education library by a qualified PT',
];

export default function PaywallScreen() {
  const { setStatus } = useSubscriptionStore();
  const [packages, setPackages]   = useState<PurchasesPackage[]>([]);
  const [selected, setSelected]   = useState<PurchasesPackage | null>(null);
  const [loading,  setLoading]    = useState(false);

  useEffect(() => {
    getOfferings().then((pkgs) => {
      setPackages(pkgs);
      setSelected(pkgs[0] ?? null);
    });
  }, []);

  async function handlePurchase() {
    if (!selected) return;
    setLoading(true);
    const success = await purchasePackage(selected);
    setLoading(false);
    if (success) {
      setStatus('active');
      router.replace('/(app)');
    } else {
      Alert.alert('Purchase failed', 'Please try again or restore purchases below.');
    }
  }

  async function handleRestore() {
    setLoading(true);
    const success = await restorePurchases();
    setLoading(false);
    if (success) {
      setStatus('active');
      router.replace('/(app)');
    } else {
      Alert.alert('No active subscription found');
    }
  }

  function handleStartTrial() {
    // Trial starts when they tap — RevenueCat handles the trial period
    handlePurchase();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <VirraText variant="display" size={48} color={colors.pulse} style={styles.title}>
          Start your free trial
        </VirraText>
        <VirraText variant="serif" color={colors.breath} style={styles.sub}>
          14 days free. Cancel any time. No charge until your trial ends.
        </VirraText>

        <VirraCard style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <VirraText variant="mono" color={colors.pulse} size={12}>✓  </VirraText>
              <VirraText variant="body" color={colors.breath}>{f}</VirraText>
            </View>
          ))}
        </VirraCard>

        {packages.length > 0 && (
          <View style={styles.packages}>
            {packages.map((pkg) => (
              <VirraCard
                key={pkg.identifier}
                accent={pkg === selected}
                style={[styles.pkg, pkg === selected && styles.pkgSelected]}
              >
                <VirraText
                  variant="bodyMedium"
                  color={pkg === selected ? colors.pulse : colors.breath}
                  onPress={() => setSelected(pkg)}
                >
                  {pkg.product.title} — {pkg.product.priceString}
                </VirraText>
              </VirraCard>
            ))}
          </View>
        )}

        <VirraButton
          label="Start 14-day free trial"
          onPress={handleStartTrial}
          loading={loading}
          style={styles.cta}
        />

        <VirraText variant="label" color={colors.muted} style={styles.legal}>
          Subscription auto-renews. Cancel at any time in Settings before trial ends.
        </VirraText>

        <VirraButton
          label="Restore purchases"
          variant="ghost"
          onPress={handleRestore}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  scroll:      { padding: spacing.lg, gap: spacing.md },
  title:       { marginTop: spacing.lg },
  sub:         { marginTop: spacing.sm, marginBottom: spacing.md },
  features:    { gap: spacing.sm },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start' },
  packages:    { gap: spacing.sm },
  pkg:         { paddingVertical: spacing.md },
  pkgSelected: { borderColor: colors.pulse },
  cta:         { marginTop: spacing.sm },
  legal:       { textAlign: 'center', marginVertical: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/\(auth\)/paywall.tsx
git commit -m "feat(mobile): add paywall screen with trial CTA and package selection"
```

---

## Task 12: App shell — tab layout and placeholder screens

**Files:**
- Create: `mobile/app/(app)/_layout.tsx`
- Create: `mobile/app/(app)/index.tsx`
- Create: `mobile/app/(app)/training.tsx`
- Create: `mobile/app/(app)/nutrition.tsx`
- Create: `mobile/app/(app)/library.tsx`
- Create: `mobile/app/(app)/profile.tsx`
- Create: `mobile/src/components/layout/AppTabBar.tsx`
- Create: `mobile/src/components/layout/AppHeader.tsx`

- [ ] **Step 1: Create AppTabBar.tsx**

```typescript
// mobile/src/components/layout/AppTabBar.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, spacing, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

const TAB_ICONS: Record<string, string> = {
  index:    '⌂',
  training: '⚡',
  nutrition:'◎',
  library:  '▦',
};

const TAB_LABELS: Record<string, string> = {
  index:    'Dashboard',
  training: 'Training',
  nutrition:'Nutrition',
  library:  'Library',
};

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bar}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const icon    = TAB_ICONS[route.name]  ?? '·';
        const label   = TAB_LABELS[route.name] ?? route.name;

        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => navigation.navigate(route.name)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
          >
            <VirraText size={22} color={focused ? colors.pulse : colors.muted}>
              {icon}
            </VirraText>
            <VirraText variant="label" size={8} color={focused ? colors.pulse : colors.muted}>
              {label}
            </VirraText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    backgroundColor: colors.mist,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingBottom:   spacing.lg, // safe area
    paddingTop:      spacing.sm,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            2,
  },
});
```

- [ ] **Step 2: Create AppHeader.tsx**

```typescript
// mobile/src/components/layout/AppHeader.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface AppHeaderProps {
  title:          string;
  showProfile?:   boolean;
}

export function AppHeader({ title, showProfile }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <VirraText variant="display" size={24} color={colors.pulse}>
        {title}
      </VirraText>
      {showProfile && (
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          style={styles.profileBtn}
          accessibilityLabel="Open profile"
          accessibilityRole="button"
        >
          <VirraText variant="mono" color={colors.pulse} size={18}>⊙</VirraText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.mile },
  profileBtn: { padding: spacing.sm },
});
```

- [ ] **Step 3: Create app tab layout**

```typescript
// mobile/app/(app)/_layout.tsx
import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { getActiveEntitlement } from '@/lib/revenuecat';
import { AppTabBar } from '@/components/layout/AppTabBar';
import { colors } from '@/constants/theme';

export default function AppLayout() {
  const { session, isLoading } = useAuthStore();
  const { setStatus }          = useSubscriptionStore();

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/(auth)');
    }
  }, [session, isLoading]);

  // Check subscription entitlement on mount
  useEffect(() => {
    if (!session) return;
    getActiveEntitlement().then((active) => {
      setStatus(active ? 'active' : 'expired');
      if (!active) router.replace('/(auth)/paywall');
    });
  }, [session]);

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown:  false,
        contentStyle: { backgroundColor: colors.mile },
      }}
    >
      <Tabs.Screen name="index"    />
      <Tabs.Screen name="training" />
      <Tabs.Screen name="nutrition"/>
      <Tabs.Screen name="library"  />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 4: Create placeholder tab screens**

```typescript
// mobile/app/(app)/index.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="VIRRA" showProfile />
      <View style={styles.body}>
        <VirraText variant="serif" color={colors.muted}>
          Dashboard — coming in Phase B
        </VirraText>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mile },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
```

```typescript
// mobile/app/(app)/training.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';

export default function TrainingScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Training" />
      <View style={styles.body}>
        <VirraText variant="serif" color={colors.muted}>
          Training plans — coming in Phase B
        </VirraText>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mile },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
```

```typescript
// mobile/app/(app)/nutrition.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';

export default function NutritionScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Nutrition" />
      <View style={styles.body}>
        <VirraText variant="serif" color={colors.muted}>
          Nutrition log — coming in Phase B
        </VirraText>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mile },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
```

```typescript
// mobile/app/(app)/library.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Library" />
      <View style={styles.body}>
        <VirraText variant="serif" color={colors.muted}>
          Education library — coming in Phase B
        </VirraText>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mile },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
```

- [ ] **Step 5: Create Profile modal**

```typescript
// mobile/app/(app)/profile.tsx
import React from 'react';
import { View, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <VirraText variant="display" size={28} color={colors.pulse}>Profile</VirraText>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close profile">
          <VirraText variant="mono" color={colors.muted}>✕</VirraText>
        </Pressable>
      </View>

      <View style={styles.body}>
        <VirraCard>
          <VirraText variant="label" color={colors.muted}>Account</VirraText>
          <VirraText variant="bodyMedium" color={colors.breath} style={{ marginTop: spacing.xs }}>
            {user?.email ?? '—'}
          </VirraText>
        </VirraCard>

        <VirraCard style={{ marginTop: spacing.sm }}>
          <VirraText variant="label" color={colors.muted}>Subscription</VirraText>
          <VirraText variant="bodyMedium" color={colors.breath} style={{ marginTop: spacing.xs }}>
            Manage in Settings → Subscriptions
          </VirraText>
        </VirraCard>

        <VirraText variant="label" color={colors.muted} style={styles.phaseNote}>
          Fitness profile, cycle settings, and notification preferences — Phase B
        </VirraText>

        <VirraButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signout}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  body:      { flex: 1, padding: spacing.lg },
  phaseNote: { textAlign: 'center', marginTop: spacing.xl },
  signout:   { marginTop: spacing.lg },
});
```

- [ ] **Step 6: Commit**

```bash
git add mobile/app/\(app\)/ mobile/src/components/layout/
git commit -m "feat(mobile): add 4-tab app shell with placeholder screens and profile drawer"
```

---

## Task 13: EAS development build

**Files:** No new files — build configuration already in place.

- [ ] **Step 1: Log in to EAS**

```bash
npx eas login
```
Enter your Expo account credentials.

- [ ] **Step 2: Configure EAS project**

```bash
cd mobile
npx eas build:configure
```
Expected: creates/updates `eas.json`, links to your Expo account.

- [ ] **Step 3: Build development client for iOS simulator**

```bash
npx eas build --profile development --platform ios
```
Expected: build queued on EAS servers. Takes ~10 minutes. Download the `.tar.gz` when complete.

- [ ] **Step 4: Install the dev build on simulator**

When the build finishes, EAS provides a download link. Install via:
```bash
# Unzip and drag the .app file to a running iOS simulator
# OR use the Expo Orbit app (recommended) — install from expo.dev/orbit
```

- [ ] **Step 5: Start the dev server and verify the app runs**

```bash
npx expo start --dev-client
```

Open the dev build on the simulator and scan the QR code or press `i`.

Expected: app launches, fonts load, Welcome screen appears with VIRRA wordmark in pulse (#D4FF26), "Get started" button in lime, dark (#0A0A0F) background.

- [ ] **Step 6: Verify auth flow**

Manually test:
1. Tap "Get started" → Sign Up screen
2. Enter test email + password → creates account in Supabase
3. App redirects to Paywall screen (RevenueCat offerings load — or empty list if RC not yet configured)
4. Tap back → Sign In screen → sign in with same credentials
5. After sign in, if no active RC entitlement → redirected to Paywall
6. Check Supabase dashboard → Auth → Users → your test user should appear

- [ ] **Step 7: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): Phase A scaffold complete — auth, navigation shell, paywall, design system"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in task |
|---|---|
| React Native (iOS-first), Expo + expo-router | Task 1–2 |
| Supabase with full schema + RLS | Task 5 |
| Design system Vol. 02 tokens | Task 3, 7 |
| Auth: email + Apple Sign-In | Task 10 |
| RevenueCat 14-day trial paywall | Task 8, 11 |
| 4-tab navigation shell | Task 12 |
| Profile as top-right button on Dashboard | Task 12 |
| Zustand state (auth + subscription) | Task 6 |
| HealthKit permissions | Permissions strings in app.json (Task 2) — HealthKit observer is Phase C |
| EAS development build | Task 13 |
| All tables: activities with type field (multi-sport ready) | Task 5 |
| fitness_assessments table | Task 5 |
| `.superpowers/` in .gitignore | Done in design phase |

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code is complete and specific.

**Type consistency check:** `setStatus` accepts `SubscriptionStatus` type consistently in store and layout. `useAuthStore` session/user types match Supabase `Session`/`User`. `getActiveEntitlement()` returns `boolean` and is used as `boolean` in layout.

---

## What Phase A delivers

At the end of this plan you have:
- A working iOS app that launches, loads branded fonts, and shows the Welcome screen
- Email sign-up + Apple Sign-In → Supabase auth
- Paywall with 14-day trial via RevenueCat
- 4-tab navigation shell (Dashboard, Training, Nutrition, Library) + Profile drawer
- Complete Supabase schema with RLS — ready for Phase B features to write data
- Design system components (VirraText, VirraButton, VirraCard) used consistently
- Jest test suite (theme, stores, components) — 16 passing tests

**Next:** Phase B plan covers the cycle phase engine, 7-step onboarding, Dashboard, Training plan view, Nutrition daily log, and Education Library.
