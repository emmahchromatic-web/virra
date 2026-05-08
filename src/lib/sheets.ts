import { google } from 'googleapis';

export async function appendCoachingEnquiry(fields: {
  name: string;
  email: string;
  tier: string;
  level: string;
  goal: string;
  startMonth: string;
  referral: string;
  newsletter: boolean;
}) {
  const credentials = JSON.parse(import.meta.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: import.meta.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        fields.name,
        fields.email,
        fields.tier,
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
