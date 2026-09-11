# Edge functions

These run on **Deno**, in Supabase, not in the React Native app. They are a
different runtime with a different global environment: `Deno.env`, `jsr:`
imports, and no React Native or Node types.

## They are not type-checked by the app

`mobile/tsconfig.json` excludes this directory. Before that exclusion,
`npm run typecheck` reported 27 errors here on a clean `main` — every one of
them `Cannot find name 'Deno'` or an unresolved `jsr:` import — which meant the
command could not be used as a gate, because it was already failing before
anyone touched anything.

Same shape as `52005d7`, which stopped the ROOT tsconfig type-checking the
mobile app. A config should describe one runtime.

If these want checking, they want their own Deno-aware config and the Deno
toolchain, not the app's.

## They deploy separately

A change here does NOT ship in a TestFlight build. It ships on:

```
supabase functions deploy <name>
```

That has caught people out twice: the em-dash sweep in `35e81d9` sat undeployed
in `estimate-meal` for eleven days, and the card 216 fix in `ca5e2ab` needed a
deploy rather than a build. If you change a function, say so in the PR.
