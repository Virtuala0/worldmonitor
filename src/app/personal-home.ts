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
 * P2.3：「AI / 科技」先直接读已有的 tech / ai 面板（它们可能根本没挂载），
 * 无内容时再从 P2.2 已验证可用的同一批已渲染面板里，用一张极小的关键词表
 * 筛标题兜底（见 readTech）。不含评分 / NLP / embedding / LLM，宁缺毋滥。
 *
 * i18n：本轮不新增任何 i18n key，中文占位与栏目名仍在模块内局部定义。
 */

import { clearChildren, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import type { AppModule } from '@/app/app-context';

import '../styles/personal-home.css';

/** 挂载点 id —— 必须与 panel-layout.ts 模板里的 <section> 保持一致。 */
export const PERSONAL_HOME_ID = 'personalHome';

/** 中国 / 赤峰 / AI 科技每栏最多展示的条数。 */
const MAX_ITEMS = 3;
/** 「今日重点」最多展示的条数。 */
const MAX_HIGHLIGHTS = 5;
/** 兜底筛选时每个面板最多扫描的条目数（只是扫描深度，不代表展示数量）。 */
const TECH_SCAN_DEPTH = 20;

/**
 * 极小 AI / 科技关键词表 —— 只用于识别「明显」的 AI / 科技标题，不做评分。
 * 匹配对象是已归一化为小写的标题；ASCII 关键词要求词边界，
 * 避免 `ai` 误命中 said / against / Dubai 这类普通英文词。
 */
const TECH_PATTERN =
  /(?:^|[^a-z0-9])(?:ai|openai|chatgpt|deepseek|claude|anthropic|gemini|nvidia)(?![a-z0-9])|人工智能|英伟达|芯片|半导体|机器人|大模型/;

interface HomeBlock {
  id: string;
  title: string;
  empty: string;
  /**
   * 复用来源：
   * - `'all'`  = 汇总所有已渲染的新闻面板（「今日重点」用）
   * - `'tech'` = 先读 tech / ai 面板，空了再从同一批面板按关键词兜底（「AI / 科技」用）
   * - 字符串数组 = 指定面板 key，按顺序取并去重
   * - `[]`     = 本轮不接数据
   */
  panels: readonly string[] | 'all' | 'tech';
}

const BLOCKS: readonly HomeBlock[] = [
  { id: 'top', title: '今日重点', empty: '暂无内容', panels: 'all' },
  { id: 'china', title: '中国', empty: '暂无内容', panels: ['china', 'china-news'] },
  { id: 'chifeng', title: '赤峰', empty: '暂无内容', panels: ['chifeng', 'chifeng-news'] },
  { id: 'tech', title: 'AI / 科技', empty: '暂无重要内容', panels: 'tech' },
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
  const hasData = block.panels === 'all' || block.panels === 'tech' || block.panels.length > 0;
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
 * （components/Panel.ts:203-204 只设 className 与 dataset.panel；
 * 只有标题/内容子元素才带 id，如 `${key}Title` / `${key}Content`）。
 * 所以必须按 `data-panel` 定位，不能按 `#id` 定位，也不能依赖面板标题文字
 * （面板标题是 i18n 文案，与首页栏目名并不相等）。
 * 在 document 上查找，避免依赖面板恰好挂在 #panelsGrid 内。
 */
function findPanel(keys: readonly string[]): HTMLElement | null {
  for (const key of keys) {
    const found = document.querySelector<HTMLElement>(`.panel[data-panel="${key}"]`);
    if (found) return found;
  }
  return null;
}

/** 读取单个面板里已经渲染好的条目（面板内已按时间倒序，取前 limit 条）。 */
function readHeadlines(
  panel: HTMLElement | null,
  limit = MAX_ITEMS,
): Array<{ title: string; href: string }> {
  if (!panel) return [];

  const items: Array<{ title: string; href: string }> = [];
  for (const link of panel.querySelectorAll<HTMLAnchorElement>('a.item-title[href]')) {
    const title = link.textContent?.trim() ?? '';
    const href = link.getAttribute('href') ?? '';
    if (!title || !href) continue;
    items.push({ title, href });
    if (items.length >= limit) break;
  }
  return items;
}

/** 标题归一化：小写 + 折叠空白；只用于去重与关键词匹配，不做语义判断。 */
function titleKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 按给定面板 key 顺序取条目并去重（缺哪个面板就跳过哪个），最多 limit 条。
 */
function readFromPanels(
  keys: readonly string[],
  limit: number,
): Array<{ title: string; href: string }> {
  const picked: Array<{ title: string; href: string }> = [];
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
 * 「今日重点」候选：汇总所有已渲染新闻面板的条目。
 *
 * 规则刻意保持轻量（无评分、无 AI、无关键词模型）：
 * 1. 每个面板内部已是时间倒序，所以直接按 DOM 顺序取，等于「较新的优先」；
 * 2. 按面板**轮转**取（第一轮每个面板各取 1 条），避免 5 条全部来自同一个面板；
 * 3. 标题归一化后去重，重复的只保留先取到的那条。
 * 不新增任何请求，也不读取面板以外的数据。
 */
function readHighlights(limit: number): Array<{ title: string; href: string }> {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel[data-panel]'));
  // 每个面板最多取 limit 条，够轮转用；面板已按时间倒序。
  const lists = panels.map(panel => readHeadlines(panel, limit)).filter(list => list.length > 0);

  const picked: Array<{ title: string; href: string }> = [];
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
 * 「AI / 科技」候选。
 *
 * 1. 第一优先：已有的 tech / ai 新闻面板（它们可能没挂载或没条目 → 空结果）；
 * 2. 兜底：从**同一批已经渲染出来**的面板里（P2.2 已验证可用），
 *    按 TECH_PATTERN 过滤标题，去重后最多 limit 条。
 * 无论哪条路径都不发请求、不调用 AI；筛不到就返回空，界面显示「暂无重要内容」。
 */
function readTech(limit: number): Array<{ title: string; href: string }> {
  const direct = readFromPanels(['tech', 'ai'], limit);
  if (direct.length > 0) return direct;

  const picked: Array<{ title: string; href: string }> = [];
  const seen = new Set<string>();

  for (const panel of document.querySelectorAll<HTMLElement>('.panel[data-panel]')) {
    for (const item of readHeadlines(panel, TECH_SCAN_DEPTH)) {
      const key = titleKey(item.title);
      if (!key || seen.has(key)) continue;
      if (!TECH_PATTERN.test(key)) continue;

      seen.add(key);
      picked.push(item);
      if (picked.length >= limit) break;
    }
    if (picked.length >= limit) break;
  }

  return picked;
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
      const keys = block.panels;
      if (keys !== 'all' && keys !== 'tech' && keys.length === 0) continue;

      const slot = host.querySelector<HTMLElement>(`[data-home-items="${block.id}"]`);
      const empty = host.querySelector<HTMLElement>(`[data-home-empty="${block.id}"]`);
      if (!slot || !empty) continue;

      const items =
        keys === 'all'
          ? readHighlights(MAX_HIGHLIGHTS)
          : keys === 'tech'
            ? readTech(MAX_ITEMS)
            : readFromPanels(keys, MAX_ITEMS);
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
