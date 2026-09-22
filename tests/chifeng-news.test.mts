import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chifengGovernmentHtmlToRss,
  isChifengGovernmentNewsUrl,
  parseChifengGovernmentNews,
} from '../src/shared/chifeng-news.ts';

const PAGE_URL = 'https://www.chifeng.gov.cn/ywdt/cfyw/';
const HTML = `
  <ul><li><a href="/navigation"><p>导航噪声</p><span>2020-01-01</span></a></li></ul>
  <div class="listArea_pub"><ul>
    <li>
      <a href="./202609/t20260922_2820615.html" target="_blank">
        <p><i></i>赤峰测试新闻 &amp; 最新进展</p>
        <span>2026-09-22</span>
      </a>
    </li>
  </ul></div>`;

describe('Chifeng government news adapter', () => {
  it('keeps the official title, original link and published date', () => {
    assert.deepEqual(parseChifengGovernmentNews(HTML, PAGE_URL), [{
      title: '赤峰测试新闻 & 最新进展',
      link: 'https://www.chifeng.gov.cn/ywdt/cfyw/202609/t20260922_2820615.html',
      publishedAt: '2026-09-22',
    }]);
  });

  it('converts only official Chifeng news pages into valid RSS items', () => {
    assert.equal(isChifengGovernmentNewsUrl(PAGE_URL), true);
    assert.equal(isChifengGovernmentNewsUrl('https://example.com/ywdt/cfyw/'), false);
    const rss = chifengGovernmentHtmlToRss(HTML, PAGE_URL, '赤峰市政府·要闻');
    assert.match(rss, /<title>赤峰测试新闻 &amp; 最新进展<\/title>/);
    assert.match(rss, /<pubDate>Mon, 21 Sep 2026 16:00:00 GMT<\/pubDate>/);
  });
});
