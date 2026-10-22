import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSharp, inspectCover, finalizeCover, episodeLabel, topicLabel } from './cover-output.mjs';

const sharp = loadSharp(process.env.WECHAT_COVER_NODE_MODULES);
const script = fileURLToPath(new URL('./cover-output.mjs', import.meta.url));

async function fixture(t, width = 1080, height = 460) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-cover-test-'));
  // Cleanup is limited to the exact directory returned by mkdtemp for this test.
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, '源图片.png');
  await sharp({ create: { width, height, channels: 3, background: '#00a9b5' } }).png().toFile(input);
  return { directory, input, root: path.join(directory, '公众号'), account: '测试账号', sharp };
}

test('inspect checks decoded PNG dimensions and leaves the directory unchanged', async t => {
  const f = await fixture(t);
  const before = await fs.readdir(f.directory);
  assert.equal((await inspectCover(f)).valid, true);
  assert.equal((await inspectCover({ ...f, width: 900, height: 383 })).valid, false);
  assert.deepEqual(await fs.readdir(f.directory), before);
});

test('exact-size copy preserves bytes and creates Chinese directory/filename', async t => {
  const f = await fixture(t);
  const source = await fs.readFile(f.input);
  const out = await finalizeCover({ ...f, topic: '中文 标题' });
  assert.equal(out.path, path.join(f.root, '测试账号', '中文_标题', '封面', '测试账号_封面_中文_标题_1080x460.png'));
  assert.equal(out.unchangedPixels, true);
  assert.deepEqual(await fs.readFile(out.path), source);
  assert.deepEqual(await fs.readFile(f.input), source);
});

test('small aspect deviation uses proportional resize to exact output', async t => {
  const f = await fixture(t, 1920, 819);
  const out = await finalizeCover({ ...f, episode: 21, topic: '测试' });
  assert.equal(out.valid, true);
  assert.equal(out.width, 1080);
  assert.equal(out.height, 460);
  assert.ok(out.aspectDifferencePercent > 0 && out.aspectDifferencePercent < 1);
});

test('large aspect deviation is rejected before any destination exists', async t => {
  const f = await fixture(t, 1536, 1024);
  await assert.rejects(finalizeCover({ ...f, episode: 21, topic: '禁止裁切' }), /超过 1%/);
  await assert.rejects(fs.access(f.root));
});

test('custom dimensions and output directory are respected', async t => {
  const f = await fixture(t, 1800, 766);
  const outputDir = path.join(f.directory, '指定目录');
  const out = await finalizeCover({ ...f, episode: 22, topic: '自定尺寸', width: 900, height: 383, outputDir });
  assert.equal(path.dirname(out.path), outputDir);
  assert.equal(out.width, 900);
  assert.equal(out.height, 383);
  await assert.rejects(fs.access(f.root));
});

test('upscale requires explicit permission flag', async t => {
  const f = await fixture(t, 540, 230);
  await assert.rejects(finalizeCover({ ...f, episode: 21, topic: '低分辨率' }), /分辨率小于/);
  const out = await finalizeCover({ ...f, episode: 21, topic: '低分辨率', allowUpscale: true });
  assert.equal(out.upscaled, true);
  assert.equal(out.valid, true);
});

test('revisions allocate V2 and V3 without changing the original', async t => {
  const f = await fixture(t);
  const config = { ...f, episode: 21, topic: '版本检查' };
  const one = await finalizeCover(config);
  const original = await fs.readFile(one.path);
  const two = await finalizeCover(config);
  const three = await finalizeCover(config);
  assert.match(two.path, /_V2\.png$/);
  assert.match(three.path, /_V3\.png$/);
  assert.deepEqual(await fs.readFile(one.path), original);
});

test('concurrent saves use distinct exclusive filenames', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 3 }, () => finalizeCover({ ...f, episode: 21, topic: '并发' })));
  assert.equal(new Set(results.map(r => r.path)).size, 3);
  assert.deepEqual(results.map(r => r.version).sort(), [1, 2, 3]);
});

test('bad episode, dimensions, topic and corrupt images are rejected', async t => {
  const f = await fixture(t);
  assert.throws(() => episodeLabel('../21'), /正整数/);
  assert.throws(() => episodeLabel(0), /正整数/);
  assert.throws(() => topicLabel('...'), /无效/);
  assert.equal(topicLabel('../../封面:新图'), '封面_新图');
  await assert.rejects(inspectCover({ ...f, width: -1 }), /整数像素/);
  const corrupt = path.join(f.directory, '损坏.png');
  await fs.writeFile(corrupt, Buffer.from('not a PNG'));
  await assert.rejects(inspectCover({ input: corrupt, sharp }));
});

test('CLI returns separate mismatch and failure exit codes', async t => {
  const f = await fixture(t);
  const modules = process.env.WECHAT_COVER_NODE_MODULES;
  const deps = modules ? ['--node-modules', modules] : [];
  const okay = spawnSync(process.execPath, [script, 'inspect', '--input', f.input, ...deps], { encoding: 'utf8' });
  assert.equal(okay.status, 0, okay.stderr);
  assert.equal(JSON.parse(okay.stdout).valid, true);
  const mismatch = spawnSync(process.execPath, [script, 'inspect', '--input', f.input, '--width', '1000', ...deps], { encoding: 'utf8' });
  assert.equal(mismatch.status, 2, mismatch.stderr);
  const failed = spawnSync(process.execPath, [script, 'inspect', '--input', path.join(f.directory, '不存在.png'), ...deps], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
});

test('account is required and episode is opt-in', async t => {
  const f = await fixture(t);
  await assert.rejects(finalizeCover({ ...f, account: undefined, topic: '测试' }), /公众号名称/);
  const plain = await finalizeCover({ ...f, topic: '测试' });
  assert.equal(path.basename(plain.path), '测试账号_封面_测试_1080x460.png');
  const numbered = await finalizeCover({ ...f, topic: '测试', episode: 7 });
  assert.equal(path.basename(numbered.path), '测试账号_EP07_封面_测试_1080x460.png');
});
