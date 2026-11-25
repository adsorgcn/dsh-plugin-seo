import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apply, name, inject, SKILL_NAME, TOOL_NAME, skillDefinition, toolDefinition, parseSkill,
  splitBook, pages, toc, part, bookText, bookPath, skillPath, sha256Lf,
} from '../lib/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const LIMIT = 8192;
const PART_LIMIT = 8000;
const MARKER = '::ILANG::v5.0::ENGINEERING_BOOK';
/** DSH-SEO 1.0 as the owner signed it off on 2026-11-25: sha256 of the LF text. The book ships unchanged; one character off fails here. */
const BOOK_SHA256_LF = '82a64b168a37b7e1491bec9b7c556653143e1412cbfd089b4714e8899a21540a';
const MODULES = ['M0_READY', 'M1_FETCH', 'M2_JUDGE', 'M3_REPORT', 'M4_FIX', 'M5_RECHECK', 'REPORT'];
const SHIPPED_PROSE = ['README.md', 'CHANGELOG.md', 'package.json', 'cordis.patch.yml', path.join('lib', 'index.js'), path.join('skills', SKILL_NAME, 'SKILL.md')];

/** Blank lines are what the splitter spends between blocks; every other line must survive untouched and in order. */
const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '').join('\n');

const FIXTURE = [
  '::ILANG::v5.0::ENGINEERING_BOOK', '[TYPE:engineering_book]', '[ID:FIXTURE-BOOK]', '[VERSION:9.9]', '',
  '::STATE{user}', '  role: 学员', '', '::RULE{a then b|source:@SUN}', '',
  '::MODULE{M0_FIRST|title:第一步}', '  [STEP] one', '', '::MODULE{M1_SECOND}', '  [STEP] two', '',
  '::RUBRIC{scoring}', '  T:S1 ok', '', '::ILANG::v5.0::ENGINEERING_BOOK', '',
].join('\n');

function fakeCtx() {
  const skills = [], tools = [];
  let disposed = 0;
  const ctx = {
    skills: { register(s) { skills.push(s); return () => { disposed += 1; }; } },
    tools: { register(t) { tools.push(t); return () => { disposed += 1; }; } },
    logger: { info() {}, warn() {} },
    effect(fn) { ctx._dispose = fn(); },
  };
  return { ctx, skills, tools, disposed: () => disposed };
}

test('module shape', () => {
  assert.equal(name, 'seo');
  assert.deepEqual(inject, ['skills', 'tools']);
  assert.equal(SKILL_NAME, 'seo-tijian');
  assert.equal(TOOL_NAME, 'seo_book');
});

test('the bundled book is DSH-SEO 1.0 byte for byte: LF only, one trailing newline, the pinned sha256', () => {
  const buf = fs.readFileSync(bookPath());
  assert.ok(!buf.includes(0x0d), 'the book must be LF, no CR bytes');
  const text = buf.toString('utf8');
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'the book ends with exactly one newline');
  assert.equal(sha256Lf(text), BOOK_SHA256_LF, 'the book differs from the signed-off text');
  assert.ok(text.startsWith(MARKER) && text.trimEnd().endsWith(MARKER));
  assert.match(text, /^\[ID:DSH-SEO\]$/m);
  assert.match(text, /^\[VERSION:1\.0\]$/m);
  assert.equal(bookText(), text);
});

test('skill: the manifest ships, DSH gets the body without the front matter, and it names the tool and both commands', () => {
  assert.ok(fs.existsSync(skillPath()), 'skills/seo-tijian/SKILL.md missing');
  const raw = fs.readFileSync(skillPath(), 'utf8');
  const { meta, body } = parseSkill(raw);
  assert.equal(meta.name, SKILL_NAME);
  const s = skillDefinition();
  assert.equal(s.name, SKILL_NAME);
  assert.match(s.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(s.description, meta.description);
  assert.equal(s.whenToUse, meta.whenToUse);
  assert.ok(s.description.includes('SEO 体检') && s.description.includes('SEO 复检'));
  assert.equal(s.source, 'runtime');
  assert.equal(s.content, body);
  assert.ok(!s.content.startsWith('---'), 'front matter must not reach the model');
  for (const needle of [TOOL_NAME, 'part=toc', 'SEO 体检', 'SEO 复检', '一次只问']) assert.ok(s.content.includes(needle), 'skill body lacks ' + needle);
  assert.ok(s.content.length > 300 && s.content.length < LIMIT, 'body size ' + s.content.length);
  assert.ok(raw.replace(/\r\n/g, '\n').endsWith(body), 'body must be the file minus its front matter');
  assert.equal(s.metadata.plugin, 'dsh-plugin-seo');
});

test('parseSkill: no front matter, quoted values, CRLF', () => {
  assert.deepEqual(parseSkill('# x\nbody'), { meta: {}, body: '# x\nbody' });
  const p = parseSkill('---\r\nname: a-b\r\ndescription: "说「一句」"\r\nwhenToUse: \'when\'\r\n---\r\n\r\n# T\r\nline\r\n');
  assert.deepEqual(p.meta, { name: 'a-b', description: '说「一句」', whenToUse: 'when' });
  assert.equal(p.body, '# T\nline\n');
});

test('splitBook: head / modules / tail, every part pages under PART_LIMIT and joins back, the parts add up to the book', () => {
  for (const text of [FIXTURE, bookText()]) {
    const b = splitBook(text);
    assert.ok(b.modules.length >= 2, 'modules ' + b.modules.length);
    assert.ok(b.head.startsWith(MARKER) && b.head.includes('::'));
    assert.ok(b.tail.includes('::RUBRIC') && b.tail.trimEnd().endsWith(MARKER));
    const rebuilt = [b.head, ...b.modules.map((m) => m.text), b.tail].join('\n');
    assert.equal(norm(rebuilt), norm(text), 'parts do not add up to the book');
    for (const [label, s] of [['head', b.head], ['tail', b.tail], ...b.modules.map((m) => [m.id, m.text])]) {
      const ps = pages(s);
      for (const p of ps) assert.ok(p.length <= PART_LIMIT, `${label} page is ${p.length} chars`);
      assert.equal(ps.join('\n'), s, `${label} pages do not join back`);
    }
  }
  const b = splitBook(bookText());
  assert.equal(b.title, 'DSH-SEO');
  assert.equal(b.version, '1.0');
  assert.deepEqual(b.modules.map((m) => m.id), MODULES);
  for (const k of ['::STATE{@SOURCES', '::OBJECTIVE', '::BOUNDARY', '::RULE']) assert.ok(b.head.includes(k), 'head lacks ' + k);
  for (const k of ['::RUBRIC', '::FALLBACK', '::PRIORITY']) assert.ok(b.tail.includes(k), 'tail lacks ' + k);
  const t = toc(b, ['- extra line']);
  for (const id of ['head', 'tail', 'extra line', ...MODULES]) assert.ok(t.includes(id), 'toc lacks ' + id);
  assert.equal(part(b, 'toc'), null);
});

test('pages: a 20000-char module pages at block boundaries, toc labels pages, M#2 works, M#9 errors', () => {
  const steps = [];
  let n = 0;
  while (steps.join('\n').length < 20000) {
    n += 1;
    steps.push(`  [STEP] ${n} ${'x'.repeat(190)}`);
    steps.push('');
  }
  const text = '::ILANG::v5.0::ENGINEERING_BOOK\n[TYPE:engineering_book]\n[ID:PAGES-BOOK]\n[VERSION:1.0]\n\n'
    + '::STATE{user}\n  role: 学员\n\n'
    + '::MODULE{M|title:很长的一段}\n' + steps.join('\n') + '\n'
    + '::RUBRIC{scoring}\n  T:S1 ok\n\n::ILANG::v5.0::ENGINEERING_BOOK\n';
  const b = splitBook(text);
  const M = b.modules.find((x) => x.id === 'M');
  assert.ok(M.text.length > PART_LIMIT, 'module should exceed the limit, got ' + M.text.length);
  const ps = pages(M.text);
  assert.ok(ps.length >= 2, 'pages ' + ps.length);
  assert.equal(ps.join('\n'), M.text, 'pages do not join back');
  const t = toc(b);
  assert.ok(t.includes(`${ps.length} 页 M#1 到 M#${ps.length}`), 'toc lacks page labels: ' + t);
  const p1 = part(b, 'M#1');
  const p2 = part(b, 'M#2');
  assert.ok(p1.length <= PART_LIMIT && p2.length <= PART_LIMIT, `pages over limit: ${p1.length}/${p2.length}`);
  const first = part(b, 'M');
  assert.ok(first.includes('这段共') && first.includes('接着取 M#2'), 'first page lacks the hint: ' + first.slice(0, 120));
  assert.throws(() => part(b, 'M#9'), /没有第 9 页/);
});

test('seo_book: toc by default, every part on request, the pages reassemble the whole book, nothing over the trim', async () => {
  const tool = toolDefinition();
  assert.equal(tool.name, TOOL_NAME);
  const t = (await tool.execute({}, {})).content[0].text;
  for (const id of ['DSH-SEO', '版本 1.0', 'head', 'tail', '插件里带的', '不联网', ...MODULES]) assert.ok(t.includes(id), 'toc lacks ' + id);
  assert.ok(t.length < LIMIT);
  const got = [];
  for (const which of ['head', ...MODULES, 'tail']) {
    let text = (await tool.execute({ part: which }, {})).content[0].text;
    assert.ok(text.length < LIMIT, `${which} is ${text.length} chars`);
    const hint = new RegExp(`\\n\\[seo: 这段共 (\\d+) 页 接着取 ${which}#2\\]$`).exec(text);
    if (hint) {
      const n = Number(hint[1]);
      const ps = [];
      for (let i = 1; i <= n; i++) {
        const p = (await tool.execute({ part: `${which}#${i}` }, {})).content[0].text;
        assert.ok(p.length <= PART_LIMIT, `${which}#${i} is ${p.length} chars`);
        ps.push(p);
      }
      text = ps.join('\n');
    }
    got.push(text);
  }
  assert.equal(norm(got.join('\n')), norm(bookText()), 'what the tool hands out does not add up to the book');
  assert.ok((await tool.execute({ part: 'm2_judge' }, {})).content[0].text.startsWith('::MODULE{M2_JUDGE'));
  await assert.rejects(tool.execute({ part: 'NOPE' }, {}), /没有叫「NOPE」/);
  await assert.rejects(tool.execute({ part: 'head#9' }, {}), /没有第 9 页/);
  assert.equal(tool.output.render({}, { content: [{ type: 'text', text: 'x' }] })[0].text, 'x');
});

test('apply registers one skill and one tool, dispose removes both', () => {
  const { ctx, skills, tools, disposed } = fakeCtx();
  apply(ctx, {});
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, SKILL_NAME);
  assert.deepEqual(tools.map((t) => t.name), [TOOL_NAME]);
  ctx._dispose();
  assert.equal(disposed(), 2);
});

test('package.json ships the book, the skill and the patch; the patch names this package; nothing else is wired in', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dsh-plugin-seo');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, 'lib/index.js');
  for (const f of ['lib/*.js', 'skills/**', 'books/**', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LICENSE']) assert.ok(pkg.files.includes(f), 'files lacks ' + f);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml');
  assert.ok(!Object.keys(pkg).some((k) => /dependencies/i.test(k)), 'no dependencies of any kind');
  const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes("name: 'dsh-plugin-seo'") && patch.includes('id: dsh-plugin-seo'));
  assert.ok(!/https?:\/\//.test(patch) && !/pass|token|secret/i.test(patch), 'the patch carries no address and no secret');
  const lib = fs.readFileSync(path.join(root, 'lib', 'index.js'), 'utf8');
  assert.ok(!/fetch\(|https?:\/\//.test(lib), 'the plugin makes no network request');
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.ok(license.startsWith('MIT License'));
});

test('what ships names no vendor, no mailbox, no promise; the README lists every Google page the book relies on', () => {
  const forbidden = [/@gmail\.com/, /ilang\.cn/, /保证/, /必上/, /一定能/, /包上首页/, /X-Pass/i];
  for (const rel of SHIPPED_PROSE) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const w of forbidden) assert.ok(!w.test(text), `${rel} matches ${w}`);
  }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const sources = /^::STATE\{@SOURCES,([^\n]*)\}$/m.exec(bookText())[1];
  const urls = [...sources.matchAll(/https?:\/\/[^\s,}]+/g)].map((m) => m[0]);
  assert.equal(urls.length, 18, 'the book lists 18 official pages');
  assert.equal(new Set(urls).size, 18);
  for (const u of urls) assert.ok(readme.includes(u), 'README lacks ' + u);
  for (const m of readme.matchAll(/https?:\/\/[^\s)）>]+/g)) {
    assert.ok(/^https:\/\/(developers\.google\.com|support\.google\.com|dsh\.ilang\.guide)\//.test(m[0]), 'README links only to Google and the toolkit site: ' + m[0]);
  }
  for (const k of ['技术地基', '你是谁', '站点聚焦', '页面可读', '信任与站外', '数据', '不抓 Google 结果页', '不批量产页', '不做外链', '不动线上', '不承诺排名', 'dsh-plugin-seo', 'SEO 复检']) assert.ok(readme.includes(k), 'README lacks ' + k);
  assert.ok(!readme.includes('您'), 'README says 你, not 您');
});
