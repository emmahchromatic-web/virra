import { google } from 'googleapis';

type ServiceAccountCreds = { client_email: string; private_key: string };

function parseServiceAccount(raw: string): ServiceAccountCreds {
  // Strip a leading BOM and any surrounding whitespace.
  let s = raw.replace(/^﻿/, '').trim();

  // If the value got wrapped in extra quotes (e.g. pasted as a quoted string), unwrap once.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }

  const attempts: Array<{ name: string; transform: (v: string) => string }> = [
    { name: 'raw', transform: (v) => v },
    // Some pasters convert real newlines inside the JSON string body into literal \n.
    // That breaks private_key signing but not parsing; this is a safety pass after parse anyway.
    { name: 'unescape-newlines', transform: (v) => v.replace(/\\n/g, '\n') },
    // Some editors smart-quote the JSON: convert curly quotes back to straight ones.
    { name: 'straight-quotes', transform: (v) => v.replace(/[‘’]/g, "'").replace(/[“”]/g, '"') },
  ];

  let lastErr: unknown;
  for (const { transform } of attempts) {
    try {
      const parsed = JSON.parse(transform(s)) as ServiceAccountCreds;
      if (parsed.private_key?.includes('\\n')) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }

  // Final fallback: log a sanitised hint about what's actually at the start of the string,
  // so we can diagnose without leaking the private key.
  const hint = JSON.stringify(s.slice(0, 60));
  const codes = Array.from(s.slice(0, 8)).map((c) => `${c}(${c.charCodeAt(0)})`).join(' ');
  throw new Error(
    `GOOGLE_SERVICE_ACCOUNT failed to parse as JSON: ${(lastErr as Error).message}. ` +
    `First 60 chars: ${hint}. First 8 char codes: ${codes}`,
  );
}

export async function appendCoachingEnquiry(fields: {
  name: string;
  email: string;
  helpWith: string;
  level: string;
  goal: string;
  startMonth: string;
  referral: string;
  newsletter: boolean;
}) {
  const raw = import.meta.env.GOOGLE_SERVICE_ACCOUNT;
  const sheetId = import.meta.env.GOOGLE_SHEET_ID;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID env var is missing');

  const credentials = parseServiceAccount(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        fields.name,
        fields.email,
        fields.helpWith,
        fields.level,
        fields.goal,
        fields.startMonth || '',
        fields.referral || '',
        fields.newsletter ? 'Yes' : 'No',
        new Date().toISOString(),
      ]],
    },
  });
}
