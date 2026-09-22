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
 * P2.2：「今日重点」汇总所有已渲染新闻面板的条目（见 readHighlights）。
 * 只做「去重 + 按面板轮转 + 每面板内取较新」，不做评分/AI/关键词模型，取前 5 条。
 *
 * P2.3：「AI / 科技」直接从 `ctx.newsByCategory.tech / .ai` 读（见 readCtxCategories），
 * 不依赖 NewsPanel 是否挂载。
 *
 * P3.1：「今日重点」「AI / 科技」两栏的英文标题复用项目**已有**的翻译链路
 * （`services/summarization` 的 `translateText`，即 NewsPanel「文」按钮用的同一条链）。
 * 只影响本模块的展示层：原始数据不改、链接不变、渲染不被阻塞、失败就显示英文原文。
 *
 * i18n：本轮不新增任何 i18n key，中文占位与栏目名仍在模块内局部定义。
 */

import { clearChildren, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { sanitizeUrl } from '@/utils/sanitize';
import type { AppContext, AppModule } from '@/app/app-context';

import '../styles/personal-home.css';

/** 挂载点 id —— 必须与 panel-layout.ts 模板里的 <section> 保持一致。 */
export const PERSONAL_HOME_ID = 'personalHome';

/** 中国 / 赤峰 / AI 科技每栏最多展示的条数。 */
const MAX_ITEMS = 3;
/** 「今日重点」最多展示的条数。 */
const MAX_HIGHLIGHTS = 5;
/** Personal Home 的目标语言：本模块的栏目名与占位文案都是中文。 */
const TARGET_LANG = 'zh';

/** Personal Home 只需要 AppContext 里的新闻缓存，不引入整个上下文的依赖面。 */
type PersonalHomeContext = Pick<AppContext, 'newsByCategory'>;

interface HomeBlock {
  id: string;
  title: string;
  empty: string;
  /**
   * DOM 复用来源：
   * - `'all'`  = 汇总所有已渲染的新闻面板（「今日重点」用）
   * - 字符串数组 = 指定面板 key，按顺序取并去重
   * - `[]`     = 不读 DOM
   */
  panels: readonly string[] | 'all';
  /** 直接从 `ctx.newsByCategory` 读取的 feed 类别（优先级高于 `panels`）。 */
  ctxCategories?: readonly string[];
  /** 该栏是否把英文标题换成中文（中国/赤峰本来就是中文，不需要）。 */
  localize?: boolean;
}

const BLOCKS: readonly HomeBlock[] = [
  { id: 'top', title: '今日重点', empty: '暂无内容', panels: 'all', localize: true },
  { id: 'china', title: '中国', empty: '暂无内容', panels: ['china', 'china-news'] },
  { id: 'chifeng', title: '赤峰', empty: '暂无内容', panels: ['chifeng', 'chifeng-news'] },
  {
    id: 'tech',
    title: 'AI / 科技',
    empty: '暂无重要内容',
    panels: [],
    ctxCategories: ['tech', 'ai'],
    localize: true,
  },
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
  const hasData =
    (block.ctxCategories?.length ?? 0) > 0 || block.panels === 'all' || block.panels.length > 0;
  const body = hasData
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
 * （components/Panel.ts:203-204 只设 className 与 dataset.panel）。
 * 所以必须按 `data-panel` 定位，不能按 `#id` 定位，也不能依赖面板标题文字
 * （面板标题是 i18n 文案，与首页栏目名并不相等）。
 */
function findPanel(keys: readonly string[]): HTMLElement | null {
  for (const key of keys) {
    const found = document.querySelector<HTMLElement>(`.panel[data-panel="${key}"]`);
    if (found) return found;
  }
  return null;
}

/** 读取单个面板里已经渲染好的条目（面板内已按时间倒序，取前 limit 条）。 */
function readHeadlines(panel: HTMLElement | null, limit = MAX_ITEMS): HomeItem[] {
  if (!panel) return [];

  const items: HomeItem[] = [];
  for (const link of panel.querySelectorAll<HTMLAnchorElement>('a.item-title[href]')) {
    const title = link.textContent?.trim() ?? '';
    const href = link.getAttribute('href') ?? '';
    if (!title || !href) continue;
    items.push({ title, href });
    if (items.length >= limit) break;
  }
  return items;
}

/** 标题归一化：小写 + 折叠空白；只用于去重与元数据兜底匹配，不做语义判断。 */
function titleKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 首页条目：标题 + 链接，外加可选的来源/时间元数据（纯展示）。 */
interface HomeItem {
  title: string;
  href: string;
  source?: string;
  /** 上游没有可解析 pubDate 时保持 undefined —— 不显示伪造的时间。 */
  pubDate?: Date;
}

interface NewsMeta {
  source: string;
  pubDate?: Date;
}

/**
 * P3.3：把已经加载在 `ctx.newsByCategory` 里的 NewsItem 元数据建成索引。
 *
 * DOM 抓取只能拿到 title + href，所以回联优先用 href 精确匹配、标题归一化作兜底
 * （绝不用已经翻译过的中文标题去匹配 —— 翻译只改我们自己 anchor 的 textContent）。
 * 全部读内存里已有的数据，不产生任何请求。
 */
function buildMetaIndex(ctx: PersonalHomeContext): {
  byHref: Map<string, NewsMeta>;
  byTitle: Map<string, NewsMeta>;
} {
  const byHref = new Map<string, NewsMeta>();
  const byTitle = new Map<string, NewsMeta>();

  for (const items of Object.values(ctx.newsByCategory)) {
    for (const item of items) {
      const title = item.title?.trim() ?? '';
      if (!title) continue;

      const meta: NewsMeta = {
        source: item.source ?? '',
        pubDate: item.pubDateMissing ? undefined : item.pubDate,
      };

      const href = sanitizeUrl(item.link);
      if (href && !byHref.has(href)) byHref.set(href, meta);

      const key = titleKey(title);
      if (key && !byTitle.has(key)) byTitle.set(key, meta);
    }
  }

  return { byHref, byTitle };
}

/** 用 ctx 元数据补齐 DOM 抓取的条目（href 优先，标题兜底，都没有就原样返回）。 */
function withMeta(items: HomeItem[], meta: ReturnType<typeof buildMetaIndex>): HomeItem[] {
  return items.map(item => {
    const found = meta.byHref.get(item.href) ?? meta.byTitle.get(titleKey(item.title));
    if (!found) return item;
    return { title: item.title, href: item.href, source: found.source, pubDate: found.pubDate };
  });
}

/**
 * 时间展示规则（浏览器本地时间，不引入任何日期库，不显示秒）：
 * - 有真实时间：今天 → `今天 18:20`；昨天 → `昨天 21:05`；
 *   今年更早 → `09-18 14:30`；非今年 → `2025-12-31`。
 * - 时间部分是 00:00：绝大多数上游 feed 的"只有日期"就是这个形态，
 *   显示成 `今天 00:00` 等于凭空造了一个午夜时间点，所以按 date-only 展示：
 *   今天 → `今天`；昨天 → `昨天`；今年更早 → `09-18`；非今年 → `2025-12-31`。
 * 无效日期返回空串。
 */
function formatWhen(date: Date | undefined): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // 00:00 视为 date-only（没有证据表明来源真的在该日午夜发布）。
  const hhmm = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  const timeOfDay = date.getHours() === 0 && date.getMinutes() === 0 ? '' : ` ${hhmm}`;

  if (sameDay(date, now)) return `今天${timeOfDay}`;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `昨天${timeOfDay}`;

  if (date.getFullYear() === now.getFullYear()) return `${mmdd}${timeOfDay}`;
  return `${date.getFullYear()}-${mmdd}`;
}

/** 元数据行：`来源 · 时间`；只有其一就只显示其一；两者都没有返回空串（不显示第二行）。 */
function metaLine(item: HomeItem): string {
  const source = item.source?.trim() ?? '';
  const when = formatWhen(item.pubDate);
  if (source && when) return `${source} · ${when}`;
  return source || when;
}

/**
 * 按给定面板 key 顺序取条目并去重（缺哪个面板就跳过哪个），最多 limit 条。
 */
function readFromPanels(keys: readonly string[], limit: number): HomeItem[] {
  const picked: HomeItem[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    for (const item of readHeadlines(findPanel([key]), limit)) {
      const itemKey = titleKey(item.title);
      if (!itemKey || seen.has(itemKey)) continue;
      seen.add(itemKey);
      picked.push(item);
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) break;
  }

  return picked;
}

/**
 * 直接从 `ctx.newsByCategory` 读给定 feed 类别（按顺序合并），去重后最多 limit 条。
 *
 * 这条路径不依赖任何面板是否挂载：data-loader 的 renderNewsForCategory 在
 * 「面板不存在就 return」之前就已经把条目写进 newsByCategory。
 * 每个类别内部已是时间倒序，所以按数组顺序取就是「较新优先」。
 */
function readCtxCategories(
  ctx: PersonalHomeContext,
  categories: readonly string[],
  limit: number,
): HomeItem[] {
  const picked: HomeItem[] = [];
  const seen = new Set<string>();

  for (const category of categories) {
    for (const item of ctx.newsByCategory[category] ?? []) {
      const title = item.title?.trim() ?? '';
      const href = sanitizeUrl(item.link);
      const itemKey = titleKey(title);
      if (!itemKey || !href || seen.has(itemKey)) continue;

      seen.add(itemKey);
      picked.push({
        title,
        href,
        // 这条路径本来就有完整 NewsItem，直接带出元数据，无需索引回联。
        source: item.source ?? '',
        pubDate: item.pubDateMissing ? undefined : item.pubDate,
      });
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) break;
  }

  return picked;
}

/**
 * 「今日重点」候选：汇总所有已渲染新闻面板的条目。
 *
 * 规则刻意保持轻量（无评分、无 AI、无关键词模型）：
 * 1. 每个面板内部已是时间倒序，所以直接按 DOM 顺序取，等于「较新的优先」；
 * 2. 按面板**轮转**取（第一轮每个面板各取 1 条），避免 5 条全部来自同一个面板；
 * 3. 标题归一化后去重，重复的只保留先取到的那条。
 */
function readHighlights(limit: number): HomeItem[] {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel[data-panel]'));
  // 每个面板最多取 limit 条，够轮转用；面板已按时间倒序。
  const lists = panels.map(panel => readHeadlines(panel, limit)).filter(list => list.length > 0);

  const picked: HomeItem[] = [];
  const seen = new Set<string>();

  for (let round = 0; picked.length < limit && round < limit; round++) {
    for (const list of lists) {
      const item = list[round];
      if (!item) continue;

      const key = titleKey(item.title);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      picked.push(item);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

/**
 * 用 DOM API 建条目：标题 +（有则）`来源 · 时间` 第二行。
 * href 只接受已消毒的链接，不拼 HTML；返回 titleEl 供翻译就地替换标题，
 * 这样译文不会连带抹掉下面的元数据行。
 */
function itemNode(item: HomeItem): { anchor: HTMLAnchorElement; titleEl: HTMLSpanElement } {
  const link = document.createElement('a');
  link.className = 'personal-home__item';
  link.setAttribute('href', item.href);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');

  const titleEl = document.createElement('span');
  titleEl.className = 'personal-home__item-title';
  titleEl.textContent = item.title;
  link.appendChild(titleEl);

  const meta = metaLine(item);
  if (meta) {
    const metaEl = document.createElement('span');
    metaEl.className = 'personal-home__item-meta';
    metaEl.textContent = meta;
    link.appendChild(metaEl);
  }

  return { anchor: link, titleEl };
}

/* ------------------------------------------------------------------ *
 * P3.1 标题中文化
 *
 * 复用项目**已有**的翻译链路：`services/summarization` 的 `translateText()`
 * —— 也就是 NewsPanel「文」按钮调用的同一个函数、同一条 provider 链。
 * 这里不接任何新的 API、不需要新的 key：链里可用的 provider 由项目原有配置决定，
 * 一个都没有时 `translateText` 直接返回 null，我们原样显示英文标题。
 *
 * 缓存：标题原文 → 译文（空串表示「已尝试过且拿不到」，用来避免反复请求）。
 * 因为 MutationObserver 会多次触发 refresh，缓存是"同一标题只翻译一次"的保证。
 * ------------------------------------------------------------------ */

/** 标题原文 → 译文；'' 表示翻译失败或没有可用 provider。 */
const translationCache = new Map<string, string>();
/** 正在翻译中的标题，避免同一标题并发请求。 */
const translationInflight = new Set<string>();
/** 翻译链路按需加载：Personal Home 是首屏模块，不想把它拖进初始 chunk。 */
let translateModule: Promise<typeof import('@/services/summarization')> | null = null;
function loadTranslateModule(): Promise<typeof import('@/services/summarization')> {
  translateModule ??= import('@/services/summarization');
  return translateModule;
}

/** 含中日韩文字：已经不需要翻译。 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

/** 只翻译「明显是英文」的标题：没有 CJK 字符，且字母数量够多。 */
function looksEnglish(title: string): boolean {
  if (CJK_PATTERN.test(title)) return false;
  return title.replace(/[^A-Za-z]/g, '').length >= 8;
}

/**
 * 异步把英文标题换成中文。非阻塞：先渲染原文，译文到了再就地替换。
 * 失败/无可用 provider → 保留英文原文；原始数据与链接都不动。
 */
function localizeHeadline(titleEl: HTMLElement, title: string): void {
  if (!looksEnglish(title)) return;

  const cached = translationCache.get(title);
  if (cached !== undefined) {
    if (cached) titleEl.textContent = cached;
    return;
  }
  if (translationInflight.has(title)) return;

  translationInflight.add(title);
  void loadTranslateModule()
    .then(mod => mod.translateText(title, TARGET_LANG))
    .then(translated => {
      const value = translated?.trim() ?? '';
      translationCache.set(title, value);
      if (value && titleEl.isConnected) titleEl.textContent = value;
    })
    .catch(() => {
      translationCache.set(title, '');
    })
    .finally(() => {
      translationInflight.delete(title);
    });
}

export class PersonalHome implements AppModule {
  private mounted = false;
  private observer: MutationObserver | null = null;
  /** 每栏上次写入的条目指纹，避免面板自身的动画 tick 反复重写 DOM。 */
  private readonly rendered = new Map<string, string>();

  constructor(private readonly ctx: PersonalHomeContext) {}

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

  /**
   * 新闻是异步到的：复用面板自己的渲染时机（#panelsGrid 的 DOM 变动）触发重取。
   * 这里只读 ctx 与已有 DOM，不发起任何请求；指纹比对保证没有变化时不重写 DOM。
   */
  private watch(): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(grid, { childList: true, subtree: true });
  }

  /** 只读现有 DOM 与 ctx.newsByCategory，把最新 N 条标题填进对应栏目。 */
  private refresh(): void {
    const host = document.getElementById(PERSONAL_HOME_ID);
    if (!host) return;

    // 元数据索引按需构建、每次 refresh 只建一次（DOM 路径的三栏共用）。
    let meta: ReturnType<typeof buildMetaIndex> | null = null;

    for (const block of BLOCKS) {
      const categories = block.ctxCategories;
      const keys = block.panels;
      if (!categories?.length && keys !== 'all' && keys.length === 0) continue;

      const slot = host.querySelector<HTMLElement>(`[data-home-items="${block.id}"]`);
      const empty = host.querySelector<HTMLElement>(`[data-home-empty="${block.id}"]`);
      if (!slot || !empty) continue;

      const items = categories?.length
        ? readCtxCategories(this.ctx, categories, MAX_ITEMS)
        : keys === 'all'
          ? readHighlights(MAX_HIGHLIGHTS)
          : readFromPanels(keys, MAX_ITEMS);
      const fingerprint = items.map(item => item.href).join('\n');
      if (this.rendered.get(block.id) !== fingerprint) {
        this.rendered.set(block.id, fingerprint);
        // ctx 路径本身带元数据；DOM 路径用 href / 标题回联 ctx 里已加载的 NewsItem。
        const enriched = categories?.length ? items : withMeta(items, (meta ??= buildMetaIndex(this.ctx)));
        const nodes = enriched.map(itemNode);
        slot.replaceChildren(...nodes.map(node => node.anchor));
        if (block.localize) {
          nodes.forEach((node, index) => {
            const item = enriched[index];
            if (item) localizeHeadline(node.titleEl, item.title);
          });
        }
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
