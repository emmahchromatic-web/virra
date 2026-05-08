import { Resend } from 'resend';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export async function sendCoachingNotification(fields: {
  name: string;
  email: string;
  tier: string;
  level: string;
  goal: string;
  startMonth: string;
  referral: string;
  newsletter: boolean;
}) {
  await resend.emails.send({
    from: 'VIRRA <hello@virra.app>',
    to: [import.meta.env.EMMA_EMAIL],
    subject: `New coaching enquiry — ${fields.tier} — ${fields.name}`,
    html: `
      <h2>New coaching enquiry</h2>
      <table>
        <tr><td><b>Name</b></td><td>${fields.name}</td></tr>
        <tr><td><b>Email</b></td><td>${fields.email}</td></tr>
        <tr><td><b>Tier</b></td><td>${fields.tier}</td></tr>
        <tr><td><b>Level</b></td><td>${fields.level}</td></tr>
        <tr><td><b>Goal</b></td><td>${fields.goal}</td></tr>
        <tr><td><b>Start month</b></td><td>${fields.startMonth || '—'}</td></tr>
        <tr><td><b>Referral</b></td><td>${fields.referral || '—'}</td></tr>
        <tr><td><b>Newsletter</b></td><td>${fields.newsletter ? 'Yes' : 'No'}</td></tr>
      </table>
    `,
  });
}

export async function sendCoachingAutoReply(name: string, toEmail: string) {
  await resend.emails.send({
    from: 'Emma at VIRRA <hello@virra.app>',
    to: [toEmail],
    subject: "Got it — I'll be in touch soon.",
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for reaching out. I've received your enquiry and I'll come back to you within 48 hours with everything you need to know.</p>
      <p>In the meantime, if you haven't already — <a href="https://virra.app/advice">read the advice section</a>. There's a lot in there that might be useful while you wait.</p>
      <p>Emma<br>VIRRA</p>
    `,
  });
}

export async function sendContactNotification(fields: {
  name: string;
  email: string;
  message: string;
}) {
  await resend.emails.send({
    from: 'VIRRA <hello@virra.app>',
    to: [import.meta.env.EMMA_EMAIL],
    subject: `Contact form — ${fields.name}`,
    html: `
      <p><b>From:</b> ${fields.name} (${fields.email})</p>
      <p><b>Message:</b></p>
      <p>${fields.message.replace(/\n/g, '<br>')}</p>
    `,
  });
}
