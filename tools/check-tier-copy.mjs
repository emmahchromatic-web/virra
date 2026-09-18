#!/usr/bin/env node
// Card 314. The website mirrors the app's paywall lists. This fails when they
// drift, so a paywall change cannot quietly leave the site saying something else.
import { readFileSync } from 'node:fs';

const list = (src, name) => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]);
};

const app  = readFileSync(new URL('../mobile/src/lib/pro.ts', import.meta.url), 'utf8');
const site = readFileSync(new URL('../src/lib/appTiers.ts', import.meta.url), 'utf8');

let bad = 0;
for (const [appName, siteName] of [['PAYWALL_FREE_LIST', 'FREE_LIST'], ['PAYWALL_PRO_LIST', 'PRO_LIST']]) {
  const a = list(app, appName), s = list(site, siteName);
  if (JSON.stringify(a) !== JSON.stringify(s)) {
    bad++;
    console.error(`${siteName} differs from the app's ${appName}:`);
    console.error('  app :', a);
    console.error('  site:', s);
  }
}
console.log(bad ? 'Tier copy has drifted.' : 'Tier copy matches the app paywall.');
process.exit(bad ? 1 : 0);
