/**
 * Personal Home.
 *
 * P1：骨架（静态占位）；P1.1：桌面端网格定位修复（见 styles/personal-home.css）。
 *
 * P2.1：把「中国」「赤峰」两栏接上**已经加载好的**真实新闻。
 * 复用方式：只读已经渲染出来的 NewsPanel DOM（`a.item-title[href]`），
 * 不新增任何网络请求、不重抓 RSS、不复制现有新闻加载系统，也不改动面板自身
 * 的加载与渲染行为。面板会把条目按时间倒序渲染，因此取前 N 条即最新的 N 条。
 * 数据为空时保留「暂无内容」。
 *
 * 本轮仍未做（刻意留空）：「今日重点」排序、AI 摘要、「AI / 科技」数据、全球新闻。
 *
 * i18n：本轮不新增任何 i18n key，中文占位与栏目名仍在模块内局部定义。
 */

import { clearChildren, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import type { AppModule } from '@/app/app-context';

import '../styles/personal-home.css';

/** 挂载点 id —— 必须与 panel-layout.ts 模板里的 <section> 保持一致。 */
export const PERSONAL_HOME_ID = 'personalHome';

/** 每栏最多展示的条数。 */
const MAX_ITEMS = 3;

interface HomeBlock {
  id: string;
  title: string;
  empty: string;
  /** 要复用的现有面板根 id 候选（空数组 = 本轮不接数据）。 */
  panels: readonly string[];
}

const BLOCKS: readonly HomeBlock[] = [
  { id: 'top', title: '今日重点', empty: '暂无内容', panels: [] },
  { id: 'china', title: '中国', empty: '暂无内容', panels: ['china', 'china-news'] },
  { id: 'chifeng', title: '赤峰', empty: '暂无内容', panels: ['chifeng', 'chifeng-news'] },
  { id: 'tech', title: 'AI / 科技', empty: '暂无重要内容', panels: [] },
];

/**
 * 快速入口。目标都是本页已存在的锚点，不新增路由：
 * #mapSection 与 #panelsGrid 由 panel-layout.ts 的模板渲染。
 */
const SHORTCUTS = [
  { label: '全球地图', href: '#mapSection', panel: '' },
  { label: '全部新闻', href: '#panelsGrid', panel: '' },
  { label: '赤峰新闻', href: '#panelsGrid', panel: 'chifeng' },
] as const;

function blockHtml(block: HomeBlock): string {
  // 接数据的栏目多一个条目容器；空容器由 refresh() 填充。
  const body = block.panels.length
    ? [
        `          <div class="personal-home__items" data-home-items="${block.id}"></div>`,
        `          <p class="personal-home__empty" data-home-empty="${block.id}">${block.empty}</p>`,
      ]
    : [`          <p class="personal-home__empty">${block.empty}</p>`];

  return [
    `        <div class="personal-home__block" data-home-block="${block.id}">`,
    `          <h3 class="personal-home__block-title">${block.title}</h3>`,
    ...body,
    '        </div>',
  ].join('\n');
}

function shortcutHtml(item: (typeof SHORTCUTS)[number]): string {
  const target = item.panel ? ` data-panel-target="${item.panel}"` : '';
  return `            <a class="personal-home__link" href="${item.href}"${target}>${item.label}</a>`;
}

/** 纯静态结构：所有插值都来自本文件的常量，没有外部输入。 */
export function renderPersonalHomeShell(): string {
  return [
    '      <h2 class="personal-home__title" id="personalHomeTitle">今日情报</h2>',
    '      <div class="personal-home__grid">',
    BLOCKS.map(blockHtml).join('\n'),
    '        <div class="personal-home__block" data-home-block="shortcuts">',
    '          <h3 class="personal-home__block-title">快速入口</h3>',
    '          <div class="personal-home__links">',
    SHORTCUTS.map(shortcutHtml).join('\n'),
    '          </div>',
    '        </div>',
    '      </div>',
  ].join('\n');
}

/**
 * 找到该栏对应的**已存在**面板（只读）。
 *
 * 面板根是 `<div class="panel" data-panel="<key>">` —— **根元素没有 id 属性**
 * （components/Panel.ts:203-204 只设 className 与 dataset.panel；
 * 只有标题/内容子元素才带 id，如 `${key}Title` / `${key}Content`）。
 * 所以必须按 `data-panel` 定位，不能按 `#id` 定位，也不能依赖面板标题文字
 * （面板标题是 i18n 文案，与首页栏目名并不相等）。
 * 在 document 上查找，避免依赖面板恰好挂在 #panelsGrid 内。
 */
function findPanel(block: HomeBlock): HTMLElement | null {
  for (const key of block.panels) {
    const found = document.querySelector<HTMLElement>(`.panel[data-panel="${key}"]`);
    if (found) return found;
  }
  return null;
}

/** 读取面板里已经渲染好的条目（已按时间倒序，取前 MAX_ITEMS 条）。 */
function readHeadlines(panel: HTMLElement | null): Array<{ title: string; href: string }> {
  if (!panel) return [];

  const items: Array<{ title: string; href: string }> = [];
  for (const link of panel.querySelectorAll<HTMLAnchorElement>('a.item-title[href]')) {
    const title = link.textContent?.trim() ?? '';
    const href = link.getAttribute('href') ?? '';
    if (!title || !href) continue;
    items.push({ title, href });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/** 用 DOM API 建链接：标题走 textContent，href 原样复制已渲染的安全链接，不拼 HTML。 */
function itemNode(item: { title: string; href: string }): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'personal-home__item';
  link.textContent = item.title;
  link.setAttribute('href', item.href);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');
  return link;
}

export class PersonalHome implements AppModule {
  private mounted = false;
  private observer: MutationObserver | null = null;
  /** 每栏上次写入的条目指纹，避免面板自身的动画 tick 反复重写 DOM。 */
  private readonly rendered = new Map<string, string>();

  /**
   * 填充 panel-layout 已经渲染出来的挂载点。
   * 必须在 PanelLayoutManager.init() 之后调用 —— 它用 setTrustedHtml 整体重写
   * 容器内容，先挂进去会被那次重写抹掉。
   */
  init(): void {
    const host = document.getElementById(PERSONAL_HOME_ID);
    if (!host) return; // 非 dashboard 入口或骨架未就绪：静默跳过，不影响宿主

    setTrustedHtml(host, trustedHtml(renderPersonalHomeShell(), 'personal-home:static-shell'));
    this.mounted = true;

    this.refresh();
    this.watch();
  }

  /** 面板内容是异步渲染的：只观察 #panelsGrid，内容一到就重取一次。 */
  private watch(): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(grid, { childList: true, subtree: true });
  }

  /** 只读现有面板 DOM，把最新 N 条标题填进对应栏目。本函数不写 #panelsGrid。 */
  private refresh(): void {
    const host = document.getElementById(PERSONAL_HOME_ID);
    if (!host) return;

    for (const block of BLOCKS) {
      if (!block.panels.length) continue;

      const slot = host.querySelector<HTMLElement>(`[data-home-items="${block.id}"]`);
      const empty = host.querySelector<HTMLElement>(`[data-home-empty="${block.id}"]`);
      if (!slot || !empty) continue;

      const items = readHeadlines(findPanel(block));
      const fingerprint = items.map(item => item.href).join('\n');
      if (this.rendered.get(block.id) !== fingerprint) {
        this.rendered.set(block.id, fingerprint);
        slot.replaceChildren(...items.map(itemNode));
      }
      empty.hidden = items.length > 0;
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.rendered.clear();

    if (!this.mounted) return;
    const host = document.getElementById(PERSONAL_HOME_ID);
    if (host) clearChildren(host);
    this.mounted = false;
  }
}
