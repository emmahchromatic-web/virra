# Cutting a build

Builds are cut **locally** — pulled from git, archived from Xcode, uploaded to
App Store Connect. Not on EAS cloud. That one fact is why step 3 exists and why
skipping it silently breaks things.

**Build 14 shipped with a bug caused by missing step 3.** The instructions given
at the time did not mention it. This file exists so that cannot happen again.

---

## The whole sequence

### 1. Get the code you intend to ship

```bash
cd ~/dev/virra
git checkout main
git pull
```

Check what you are about to ship is actually merged. An unmerged PR is not in
the build, however finished it looks.

### 2. Bump the build number

`mobile/app.json` → `expo.ios.buildNumber`. Increment it. App Store Connect
rejects a build number it has already seen.

`expo.version` (currently `1.0.0`) is the user-facing version and changes only
when you decide it does — not every build.

Commit that bump, so the number in git matches the number in TestFlight.

### 3. Prebuild, CLEAN. This is the step that gets missed

```bash
cd mobile
npx expo prebuild --clean -p ios
```

**`--clean` is not optional, and leaving it off fails silently.**

`ios/` is gitignored and generated from `app.json`. `expo prebuild` **will not
overwrite an existing `ios/` directory** — without `--clean` it leaves whatever
is already on your machine and exits successfully, so nothing warns you.

That is exactly what happened on build 14: `app.json` had carried
`userInterfaceStyle: "dark"` since 29 August, the local `ios/` directory was
from 25 August, and the resulting app declared itself a *light* app while
painting itself dark. Every native surface — the keyboard, system dialogs,
native pickers — came out wrong, while the app's own screens looked fine
because they carry their own colours.

Anything configured in `app.json` has this property: permissions and their
usage strings, entitlements, plugins, icons, the splash screen, background
modes. A change to any of them reaches the app **only** through a clean
prebuild.

If `--clean` refuses or you would rather be certain:

```bash
rm -rf ios && npx expo prebuild -p ios
```

### 4. Verify the prebuild actually took

Do not skip this. It is five seconds and it is the difference between finding
the problem now and finding it in UAT.

```bash
grep -A1 UIUserInterfaceStyle ios/Virra/Info.plist
```

Expect `<string>Dark</string>`. If it says `Light`, step 3 did not happen —
go back and do it properly. Do not build.

Then spot-check whatever *you* changed in `app.json` this cycle. If you edited a
permission string, grep for that string. If the answer is not in the plist, it
will not be in the build.

### 5. Archive and upload

Paul's existing Xcode process: open `ios/Virra.xcworkspace`, archive, upload to
App Store Connect. Nothing about that changes here.

### 6. Things that do NOT ship in the build

This has caught people out repeatedly. Three separate delivery channels:

| What | How it ships | Does a build help? |
|---|---|---|
| App code (`app/`, `src/`) | The build | Yes |
| `app.json` config | The build, **via a clean prebuild** | Only with step 3 |
| Edge functions (`mobile/supabase/functions/`) | `supabase functions deploy <name>` | **No** |
| Database migrations | Applied to Supabase | **No** |

Real examples of this going wrong: the em-dash fix in `35e81d9` sat undeployed
in `estimate-meal` for eleven days while everyone assumed a build would carry
it, and `ca5e2ab` fixed a number in the insights narrative that needed a deploy
rather than a build.

**Before you archive**, check whether anything merged this cycle touched
`supabase/functions/` or `supabase/migrations/`. If it did, that half is your
job too and the build will not do it for you.

### 7. After it lands in TestFlight

Say which build number and which commit went up. UAT against a build nobody can
identify wastes everyone's time, and "the latest one" stops meaning anything the
moment two builds exist.

---

## The short version

1. `git pull` on `main`
2. Bump `ios.buildNumber` in `mobile/app.json`, commit
3. **`npx expo prebuild --clean -p ios`**
4. **Verify `Info.plist`** — `UIUserInterfaceStyle` should say `Dark`
5. Archive and upload
6. Deploy any changed edge functions and migrations SEPARATELY
7. Post the build number and commit
