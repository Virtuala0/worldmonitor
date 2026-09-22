export interface ChifengNewsItem {
  title: string;
  link: string;
  publishedAt: string;
}

const CHIFENG_NEWS_HOST = 'www.chifeng.gov.cn';

export function isChifengGovernmentNewsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === CHIFENG_NEWS_HOST && url.pathname.startsWith('/ywdt/');
  } catch {
    return false;
  }
}

function decodeHtml(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp));/gi, (match, hex, dec, name) => {
    if (hex || dec) {
      const codePoint = Number.parseInt(hex || dec, hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[String(name).toLowerCase()] ?? match;
  });
}

function plainText(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function parseChifengGovernmentNews(html: string, pageUrl: string): ChifengNewsItem[] {
  const items: ChifengNewsItem[] = [];
  const listStart = html.search(/class=["']listArea_pub["']/i);
  const listHtml = listStart >= 0 ? html.slice(listStart) : html;
  const entryPattern = /<li[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>\s*<span[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>[\s\S]*?<\/a>\s*<\/li>/gi;

  for (const match of listHtml.matchAll(entryPattern)) {
    const href = match[1];
    const title = plainText(match[2] ?? '');
    const publishedAt = match[3];
    if (!href || !title || !publishedAt) continue;
    try {
      items.push({ title, link: new URL(href, pageUrl).href, publishedAt });
    } catch {
      // Ignore malformed links from the upstream page.
    }
  }
  return items;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function chifengGovernmentHtmlToRss(html: string, pageUrl: string, sourceName: string): string {
  const items = parseChifengGovernmentNews(html, pageUrl)
    .map((item) => `<item><title>${escapeXml(item.title)}</title><link>${escapeXml(item.link)}</link><pubDate>${new Date(`${item.publishedAt}T00:00:00+08:00`).toUTCString()}</pubDate><source>${escapeXml(sourceName)}</source></item>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(sourceName)}</title><link>${escapeXml(pageUrl)}</link>${items}</channel></rss>`;
}
