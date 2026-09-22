/**
 * Personal Home — P1 shell.
 *
 * 个人情报首页（骨架阶段）。位置：#main 顶部、#mapSection 之前，
 * 挂载点写在 panel-layout.ts 的 renderLayout 模板里（一行 <section>）。
 *
 * 本轮只证明：页面顶部能看到该区域；地图与原有面板全部保留；
 * PC / iPad / 移动端不横向溢出；不接真实新闻数据。
 * 刻意不做（留给 P2）：读真实 feeds、排序挑选、AI 摘要、任何新请求。
 *
 * i18n：本轮不新增任何 i18n key。仓库存在已知的 locale 漂移
 * （4 个 key 缺在 25 个语言与 zh-TW 语料，见上一轮结论），
 * 因此占位中文先在模块内局部定义，P2 再统一接入 i18n。
 */

import { clearChildren, setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import type { AppModule } from '@/app/app-context';

import '../styles/personal-home.css';

/** 挂载点 id —— 必须与 panel-layout.ts 模板里的 <section> 保持一致。 */
export const PERSONAL_HOME_ID = 'personalHome';

/** 占位区块。P1 全部是静态结构，没有条目、没有请求。 */
const BLOCKS = [
  { id: 'top', title: '今日重点', empty: '暂无内容' },
  { id: 'china', title: '中国', empty: '暂无内容' },
  { id: 'chifeng', title: '赤峰', empty: '暂无内容' },
  { id: 'tech', title: 'AI / 科技', empty: '暂无重要内容' },
] as const;

/**
 * 快速入口。目标都是本页已存在的锚点，不新增路由：
 * #mapSection 与 #panelsGrid 由 panel-layout.ts 的模板渲染。
 * 面板锚点无法用 #id 直接定位到 data-panel 属性，故 赤峰新闻 先落在面板网格，
 * 用 data-panel-target 给 P2 留出精确滚动 / 高亮的钩子。
 */
const SHORTCUTS = [
  { label: '全球地图', href: '#mapSection', panel: '' },
  { label: '全部新闻', href: '#panelsGrid', panel: '' },
  { label: '赤峰新闻', href: '#panelsGrid', panel: 'chifeng' },
] as const;

function blockHtml(block: (typeof BLOCKS)[number]): string {
  return [
    `        <div class="personal-home__block" data-home-block="${block.id}">`,
    `          <h3 class="personal-home__block-title">${block.title}</h3>`,
    `          <p class="personal-home__empty">${block.empty}</p>`,
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

export class PersonalHome implements AppModule {
  private mounted = false;

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
  }

  destroy(): void {
    if (!this.mounted) return;
    const host = document.getElementById(PERSONAL_HOME_ID);
    if (host) clearChildren(host);
    this.mounted = false;
  }
}