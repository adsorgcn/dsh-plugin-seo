/**
 * dsh-plugin-seo — SEO 体检 for DeepSeek Harness.
 *
 * One skill, `seo-tijian`, loaded when the user says SEO 体检 / SEO 复检.
 * One tool, `seo_book`, that hands the model the bundled engineering book DSH-SEO
 * one part at a time (DSH trims tool results past 8192 characters, the book is longer).
 * The book ships inside this package and is read from disk only: no network requests,
 * no keys, nothing collected, nothing written outside the workspace.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'seo';
export const inject = ['skills', 'tools'];

export const SKILL_NAME = 'seo-tijian';
export const TOOL_NAME = 'seo_book';
const PLUGIN_NAME = 'dsh-plugin-seo';
const MARKER = '::ILANG::v5.0::ENGINEERING_BOOK';
const PART_LIMIT = 8000;          // stay under the 8192-character tool-result trim
const VERSION = readVersion();

function here() {
  return path.dirname(fileURLToPath(import.meta.url));
}

function pkgRoot() {
  return path.join(here(), '..');
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgRoot(), 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/* ---------- the bundled book ---------- */

export function bookPath() {
  return path.join(pkgRoot(), 'books', 'BOOK.md');
}

export function bookText() {
  return fs.readFileSync(bookPath(), 'utf8');
}

/** sha256 of the text with CRLF folded to LF: the digest the toolkit's registry records for a book. */
export function sha256Lf(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/* ---------- the skill ---------- */

export function skillPath() {
  return path.join(pkgRoot(), 'skills', SKILL_NAME, 'SKILL.md');
}

/** The skill ships as skills/seo-tijian/SKILL.md: a short front matter (name, description, whenToUse) and the body the model reads. */
export function skillContent() {
  return fs.readFileSync(skillPath(), 'utf8');
}

/** Split a SKILL.md into its front matter (one `key: value` per line, quotes optional) and the body. */
export function parseSkill(raw) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: text.slice(m[0].length).replace(/^\n+/, '') };
}

/* ---------- book splitting ---------- */

/** Split an iLang engineering book into head / modules / tail by its top-level blocks. */
export function splitBook(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('::') && !l.startsWith(MARKER)) starts.push(i);
  }
  const blocks = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const header = lines[s];
    const m = /^::([A-Z]+)\{([^|}]*)/.exec(header);
    return { kind: m ? m[1] : 'BLOCK', id: m ? m[2].trim() : header.slice(2, 40), start: s, end, text: lines.slice(s, end).join('\n').replace(/\n+$/, '') };
  });
  const firstModule = blocks.findIndex((b) => b.kind === 'MODULE');
  const lastModule = blocks.map((b) => b.kind).lastIndexOf('MODULE');
  const preamble = lines.slice(0, blocks.length ? blocks[0].start : lines.length).join('\n').replace(/\n+$/, '');
  const headBlocks = firstModule < 0 ? blocks : blocks.slice(0, firstModule);
  const modules = firstModule < 0 ? [] : blocks.slice(firstModule, lastModule + 1).filter((b) => b.kind === 'MODULE');
  const tailBlocks = firstModule < 0 ? [] : blocks.slice(lastModule + 1);
  const head = [preamble, ...headBlocks.map((b) => b.text)].filter(Boolean).join('\n\n');
  const tail = tailBlocks.map((b) => b.text).join('\n\n');
  const title = (/^\[ID:([^\]]+)\]/m.exec(text) || [])[1] || '';
  const version = (/^\[VERSION:([^\]]+)\]/m.exec(text) || [])[1] || '';
  return { title, version, head, modules, tail, chars: text.length };
}

function moduleTitle(b) {
  const m = /\|title:([^|}]*)/.exec(b.text.split('\n')[0]);
  return m ? m[1].trim() : '';
}

/** 分页：text 不超过 PART_LIMIT 返回单页；否则按行切成多页，切点只在 :: 开头的行之前或空行处。 */
export function pages(text) {
  if (text.length <= PART_LIMIT) return [text];
  const lines = text.split('\n');
  const out = [];
  let cur = [];
  let curLen = 0;
  const flush = () => { if (cur.length) { out.push(cur.join('\n')); cur = []; curLen = 0; } };
  for (const line of lines) {
    const lineLen = line.length + 1;
    const isBoundary = line.startsWith('::') || line.trim() === '';
    if (cur.length && curLen + lineLen > PART_LIMIT) {
      if (isBoundary) {
        flush();
      } else {
        // 找最后一行空行当切点：它之前成页，它和它之后的行开新页
        let k = cur.length - 1;
        while (k >= 0 && cur[k].trim() !== '') k--;
        if (k >= 0) {
          const carry = cur.slice(k);
          cur = cur.slice(0, k);
          flush();
          cur = carry.slice();
          curLen = carry.reduce((a, l) => a + l.length + 1, 0);
        } else {
          // 一个块本身就超过上限：块内按行硬切，上一页末尾留标记
          out.push(cur.join('\n') + '\n[seo: 本页在块中间切开 下一页接着]');
          cur = [];
          curLen = 0;
        }
      }
    }
    cur.push(line);
    curLen += lineLen;
  }
  flush();
  return out;
}

export function toc(book, extra = []) {
  const out = [];
  out.push(`书：${book.title || '?'}  版本 ${book.version || '?'}  共 ${book.chars} 字符；一次取一段，part 填下面的名字。`);
  const headPages = pages(book.head);
  const headInfo = headPages.length > 1 ? `，${headPages.length} 页 head#1 到 head#${headPages.length}` : '';
  out.push(`- head  （${book.head.length} 字符${headInfo}）：角色、来源、目标、边界、规矩。先读它。`);
  for (const b of book.modules) {
    const t = moduleTitle(b);
    const ps = pages(b.text);
    const pageInfo = ps.length > 1 ? `，${ps.length} 页 ${b.id}#1 到 ${b.id}#${ps.length}` : '';
    out.push(`- ${b.id}  （${b.text.length} 字符${pageInfo}）${t ? '：' + t : ''}`);
  }
  const tailPages = pages(book.tail);
  const tailInfo = tailPages.length > 1 ? `，${tailPages.length} 页 tail#1 到 tail#${tailPages.length}` : '';
  out.push(`- tail  （${book.tail.length} 字符${tailInfo}）：验收项（RUBRIC）、兜底（FALLBACK）、优先级。每一环做完对照一次。`);
  for (const line of extra) out.push(line);
  out.push('顺序：head → 模块按列出的次序 → tail。');
  return out.join('\n');
}

export function part(book, which) {
  const w = String(which || 'toc').trim();
  if (w === 'toc') return null;
  const hashIdx = w.indexOf('#');
  const base = (hashIdx < 0 ? w : w.slice(0, hashIdx)).trim();
  const pageNo = hashIdx < 0 ? null : parseInt(w.slice(hashIdx + 1).trim(), 10);
  let full;
  if (base === 'head') full = book.head;
  else if (base === 'tail') full = book.tail;
  else {
    const b = book.modules.find((x) => x.id === base || x.id.toLowerCase() === base.toLowerCase());
    full = b ? b.text : undefined;
  }
  if (full === undefined) {
    const ids = book.modules.map((x) => x.id).join('、');
    throw new Error(`seo: 没有叫「${w}」的段。可取的是 toc、head、tail 和模块：${ids}`);
  }
  const ps = pages(full);
  if (pageNo !== null) {
    if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > ps.length) {
      throw new Error(`seo: 没有第 ${pageNo} 页。可取的是 ${base}#1 到 ${base}#${ps.length}。`);
    }
    return ps[pageNo - 1];
  }
  if (ps.length > 1) return ps[0] + `\n[seo: 这段共 ${ps.length} 页 接着取 ${base}#2]`;
  return ps[0];
}

/** Last line of defence. A page is at most PART_LIMIT and may carry a one-line pointer to the next page, so the cut sits a little above PART_LIMIT and still under the 8192 trim. */
function render(text, name) {
  const limit = PART_LIMIT + 100;
  if (text.length > limit) {
    return text.slice(0, PART_LIMIT) + `\n\n[seo: ${name} 超过 ${PART_LIMIT} 字符，这里截断了；请按 toc 一段一段取]`;
  }
  return text;
}

/* ---------- the tool ---------- */

export function toolDefinition() {
  return {
    name: TOOL_NAME,
    description: '取「SEO 体检」的工程书 DSH-SEO（按 Google Search Central 官方页逐条判六个维度、一页报告、用户点头后改工作区里的站文件、复检）。书随插件带着，不联网。先 part=toc 看目录，再按段取：head、各模块、tail。只在 seo-tijian 技能让你取的时候调用。',
    parameters: {
      type: 'object',
      properties: { part: { type: 'string', description: 'toc（目录，默认）、head、tail，或模块名（如 M2_JUDGE）；多页时写 段名#页号' } },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { content: { type: 'array', items: {} } }, required: ['content'], additionalProperties: false },
      render(_args, value) { return value.content; },
    },
    async execute(args) {
      const book = splitBook(bookText());
      const which = args?.part;
      const extra = [`- 这本书是插件里带的 ${book.version || '?'} 版，从包里读，不联网取。`];
      const text = part(book, which);
      return { content: [{ type: 'text', text: text === null ? toc(book, extra) : render(text, String(which)) }] };
    },
  };
}

/* ---------- skill + plugin ---------- */

export function skillDefinition() {
  const { meta, body } = parseSkill(skillContent());
  return {
    name: SKILL_NAME,
    description: meta.description || 'SEO 体检：用户说「SEO 体检」并给网址、或说「SEO 复检」时加载。',
    whenToUse: meta.whenToUse || '用户说 SEO 体检、SEO 复检，或给了网址想让站在 Google 上被找到时。',
    source: 'runtime',
    content: body,
    metadata: { plugin: PLUGIN_NAME, version: VERSION },
  };
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = [];
    try {
      disposers.push(ctx.skills.register(skillDefinition()));
      disposers.push(ctx.tools.register(toolDefinition()));
      ctx.logger?.info?.('seo: skill ' + SKILL_NAME + ' and tool ' + TOOL_NAME + ' registered');
    } catch (err) {
      for (const d of disposers) { try { d(); } catch { /* ignore */ } }
      throw err;
    }
    return () => { for (const d of disposers) { try { d(); } catch { /* ignore */ } } };
  });
}
