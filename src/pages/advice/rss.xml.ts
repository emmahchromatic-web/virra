import type { APIRoute } from 'astro';
import { client } from '../../lib/sanity';
import { ALL_ARTICLES_FOR_RSS_QUERY } from '../../lib/queries';

export const GET: APIRoute = async () => {
  const articles = await client.fetch(ALL_ARTICLES_FOR_RSS_QUERY).catch(() => []);

  const items = articles
    .map((article: any) => {
      const pubDate = article.publishedDate
        ? new Date(article.publishedDate).toUTCString()
        : new Date().toUTCString();
      return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>https://virra.app/advice/${article.slug}</link>
      <guid>https://virra.app/advice/${article.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      ${article.dek ? `<description><![CDATA[${article.dek}]]></description>` : ''}
    </item>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>VIRRA — Run Hot</title>
    <link>https://virra.app/advice</link>
    <description>Evidence-based training, nutrition and cycle guidance for women who run.</description>
    <language>en-gb</language>
    <atom:link href="https://virra.app/advice/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
