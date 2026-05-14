# Privacy Policy — Virra

**Last updated:** 2026-05-14
**Effective:** From the date of first app launch
**Operator:** Paul Dickenson, United Kingdom
**Contact:** hello@virra.app

> This is a launch-ready first draft intended to be published at `virra.app/privacy`.
> Have it reviewed by a lawyer before going live, especially for UK GDPR + EU GDPR specifics.

---

## 1. Who we are

Virra ("we", "us", "our") is a mobile application that helps women runners train and fuel in tune with their menstrual cycle. The app is operated by Paul Dickenson, an individual developer based in the United Kingdom.

If you have any questions about this policy or about your data, email **hello@virra.app**.

---

## 2. The data we collect, why, and where it lives

### 2.1 Data you give us directly

| Data | Why we collect it | Where it is stored | How long we keep it |
|------|-------------------|--------------------|---------------------|
| Email address | Account creation and sign-in (or your Apple ID email-relay address if you Sign in with Apple) | Supabase (EU region) | Until you delete your account |
| Name (optional) | Profile display | Supabase | Until you delete your account |
| Avatar image (optional) | Profile display | Supabase Storage | Until you delete your account |
| Onboarding answers — fitness level, running goal, dietary preferences | Personalising your training plan and nutrition targets | Supabase | Until you delete your account |
| Cycle data — period start date, average cycle length, cycle profile | Computing the cycle phase that drives training and nutrition recommendations | Supabase + optionally Apple Health (your device) | Until you delete your account |
| Daily check-in entries — energy, mood, sleep, symptoms, notes | Generating insights and adjusting recommendations | Supabase | Until you delete your account |
| Food entries | Nutrition logging | Supabase + optionally Apple Health | Until you delete your account |

### 2.2 Data we read from Apple HealthKit (only with your permission)

When you grant HealthKit access, Virra reads the following data types from Apple Health. **Your raw HealthKit readings stay on your device.** Virra processes them locally to derive training and recovery signals.

| Apple HealthKit type | Used for |
|----------------------|----------|
| Workouts | Importing your runs and other activities |
| Heart rate | Effort context for workouts |
| Resting heart rate | Recovery signal |
| Heart rate variability (SDNN) | Recovery signal |
| Active energy burned | Training load |
| Apple exercise time | Dashboard activity ring + training load |
| Walking + running distance | Activity and step tracking |
| Step count | Dashboard activity ring |
| VO₂ max | Fitness baseline |
| Sleep analysis | Recovery signal |
| Body mass / weight | Optional, only if weight tracking is enabled |
| Menstrual flow | Computing your cycle phase |

When you grant write permission, Virra writes the following to Apple Health:
- Workouts (from the in-app run tracker and manual activity log)
- Dietary energy, carbohydrates, protein, fat, and fibre (from your food entries)

You can revoke HealthKit access at any time in iOS Settings → Privacy & Security → Health → Virra.

### 2.3 Location data

When you start a run in Virra's in-app run tracker, we collect precise location data from your device's GPS to map the route and measure pace. Location collection only happens while a run is active. The GPS trace is written to Apple HealthKit (under your control) and optionally to your account on Supabase so you can review the run later.

We never use location for advertising, third-party sharing, or background tracking beyond an active run.

### 2.4 Subscription data

We use **RevenueCat** to manage your subscription entitlement. RevenueCat receives:
- An anonymised customer ID linked to your Virra account
- The Apple App Store receipt for your subscription
- The product identifier you purchased

RevenueCat does not receive your name, email, health data, or location.

### 2.5 AI-generated insights

Virra generates weekly narrative insights about your training and cycle. To do this, a Supabase Edge Function sends **only aggregated summary metrics** to Anthropic's Claude Haiku API. The metrics sent are:

- Current cycle phase
- Day of cycle
- Adherence percentage (planned vs. completed sessions)
- Weekly kilometres
- Activity count
- Counts of upcoming sessions and events
- Average energy and mood scores from your daily check-ins
- Nutrition log count

**We never send:** raw heart rate samples, GPS traces, individual workout files, individual food entries, or any directly identifying information. The Anthropic API call uses the standard developer terms — Anthropic does not train its models on data sent through the API.

### 2.6 Open Food Facts

When you search for a food or scan a barcode, Virra sends the search query or barcode number to **Open Food Facts** (a non-profit open database). No personal data accompanies the request — just the food name or 13-digit barcode.

### 2.7 Data we do *not* collect

- We do not use any third-party advertising SDK.
- We do not use any third-party analytics SDK (no Firebase, no Mixpanel, no Segment).
- We do not track you across apps or websites and do not request App Tracking Transparency consent.
- We do not sell or rent your data to anyone.
- We do not store any of your health information in iCloud.

---

## 3. Third-party processors

The following services receive a defined subset of your data to operate Virra:

| Processor | Role | What they receive |
|-----------|------|-------------------|
| Supabase | Backend (Postgres, Auth, Storage, Edge Functions) | Account, profile, training, cycle, nutrition data — everything in §2.1 |
| RevenueCat | Subscription management | Apple receipt + anonymous customer ID |
| Anthropic (Claude Haiku) | AI-generated weekly insights | Aggregate metrics only — see §2.5 |
| Apple HealthKit | On-device health data store | Read-only and write-only access — data stays on your device |
| Open Food Facts | Food and barcode database | Barcode or food-name query only |

We do not authorise any of these processors to use your data for their own marketing, advertising, or model-training purposes.

---

## 4. Your rights

You have the right to:

- **Access** the data we hold about you — email hello@virra.app and we will provide a copy
- **Correct** anything inaccurate — most profile data is editable in the app; for anything else, email us
- **Delete** your account and all associated data — go to Profile → DELETE ACCOUNT in the app. This permanently removes your data from Supabase and revokes your auth record. Deletion is irreversible.
- **Withdraw consent** for HealthKit, Location, Notifications, or Camera at any time via iOS Settings
- **Object** to our processing or **restrict** our processing — email us
- **Data portability** — email us for a JSON export of your data
- **Complain** to your local data protection authority (in the UK, the Information Commissioner's Office at https://ico.org.uk)

---

## 5. Legal bases for processing (UK / EU GDPR)

| Purpose | Legal basis |
|---------|-------------|
| Account creation and sign-in | Contract — you cannot use Virra without an account |
| Personalising training and nutrition | Contract — you have asked us to provide this service |
| HealthKit, Location, Camera access | Consent — granted via iOS system dialogs; you can revoke at any time |
| AI-generated insights | Contract + consent — insights are part of the service you subscribed to; you can opt out by emailing us |
| Subscription management | Contract — to deliver the subscription you purchased |
| Notifications | Consent — granted via iOS system dialog; you can revoke per-slot in Settings or all at once in iOS Settings |

---

## 6. Where your data is processed

- **Supabase** hosts the EU region by default; your data lives on EU servers.
- **RevenueCat** operates from the United States.
- **Anthropic** processes API calls in the United States.
- **Apple HealthKit** data stays on your device; we only receive it transiently during processing on your device and never store the raw values on our servers.

When data is transferred outside the UK / EEA, we rely on Standard Contractual Clauses or equivalent safeguards under UK GDPR.

---

## 7. Children

Virra is not intended for children under 13. We do not knowingly collect data from children. If you believe a child has created an account, email hello@virra.app and we will delete it.

---

## 8. Security

All traffic between the app and our backends is encrypted in transit (TLS 1.2+). Data at rest in Supabase is encrypted by the platform. Supabase Row-Level Security restricts every database query to the authenticated user's own rows. Auth tokens are stored in encrypted local storage on your device.

No system is perfectly secure, but we follow industry best practices and will notify affected users in the event of a personal-data breach, as required by law.

---

## 9. Changes to this policy

We will update this policy from time to time. The "Last updated" date at the top reflects the most recent change. Significant changes will be flagged in the app at next launch.

---

## 10. Contact

Email **hello@virra.app** for any privacy question, data access request, complaint, or account deletion issue.
