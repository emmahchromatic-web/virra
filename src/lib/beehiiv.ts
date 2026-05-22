// Adds an email to the Run Hot Beehiiv publication. Throws on a non-OK response.
export async function addSubscriber(email: string, source: string) {
  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${import.meta.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.BEEHIIV_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: source,
        utm_medium: 'website',
        utm_campaign: 'run-hot',
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Beehiiv ${res.status}: ${await res.text()}`);
  }
}
