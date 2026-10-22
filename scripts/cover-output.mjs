#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
export const DEFAULT_ROOT = process.cwd();
export const ASPECT_TOLERANCE = 0.01;

export function loadSharp(moduleDir) {
  try {
    return require(moduleDir ? path.resolve(moduleDir, 'sharp') : 'sharp');
  } catch {
    throw new Error('未找到 sharp。请通过工作区依赖工具取得 node_modules 路径并传入 --node-modules；本工具不会自动安装。');
  }
}

function dimensions(width = 1080, height = 460) {
  for (const [key, value] of [['width', width], ['height', height]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 16384) {
      throw new Error(`${key} 必须是 1–16384 之间的整数像素值`);
    }
  }
  return { width, height };
}

export function episodeLabel(value) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) {
    throw new Error('episode 必须是明确的正整数期数');
  }
  return String(Number(text)).padStart(2, '0');
}

export function topicLabel(value) {
  if (typeof value !== 'string') throw new Error('必须提供 topic 主题短名');
  const text = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 64).replace(/[_.]+$/g, '');
  if (!text) throw new Error('topic 不能是空白或仅包含无效文件名字符');
  return text;
}

async function readImage(input, sharp) {
  if (!input) throw new Error('必须提供 input 图片路径');
  const sourcePath = path.resolve(input);
  const data = await fs.readFile(sourcePath);
  const metadata = await sharp(data, { failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
    throw new Error('只支持可解码的单帧图片');
  }
  if (metadata.orientation && metadata.orientation !== 1) {
    throw new Error('源图带有方向标记，请先通过图像流程明确方向后再交付');
  }
  // Decode, rather than trusting a plausible PNG header on a damaged file.
  await sharp(data, { failOn: 'error' }).stats();
  return { sourcePath, data, metadata };
}

export async function inspectCover({ input, width = 1080, height = 460, moduleDir, sharp = loadSharp(moduleDir) }) {
  dimensions(width, height);
  const { sourcePath, metadata } = await readImage(input, sharp);
  return {
    path: sourcePath,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    expectedWidth: width,
    expectedHeight: height,
    valid: metadata.format === 'png' && metadata.width === width && metadata.height === height,
  };
}

export async function finalizeCover({
  input, account, episode, topic, width = 1080, height = 460,
  root = DEFAULT_ROOT, outputDir, moduleDir, allowUpscale = false,
  sharp = loadSharp(moduleDir),
}) {
  dimensions(width, height);
  if (typeof account !== 'string' || !account.trim()) throw new Error('必须提供 account 公众号名称');
  const accountName = topicLabel(account);
  const ep = episode == null ? '' : episodeLabel(episode);
  const shortTopic = topicLabel(topic);
  const { sourcePath, data, metadata } = await readImage(input, sharp);
  const ratioError = Math.abs((metadata.width / metadata.height) / (width / height) - 1);
  if (ratioError > ASPECT_TOLERANCE) {
    throw new Error(`源图宽高比与目标偏差 ${(ratioError * 100).toFixed(2)}%，超过 1%；请重新生成对应构图，不能拉伸或大幅裁切。`);
  }
  const upscale = metadata.width < width || metadata.height < height;
  if (upscale && !allowUpscale) {
    throw new Error('源图分辨率小于目标；请重新生成，或仅在用户允许时传 --allow-upscale。');
  }
  // Preserve the exact original bytes when the source already meets the output contract.
  const unchanged = metadata.format === 'png' && metadata.width === width && metadata.height === height;
  const outputData = unchanged ? data : await sharp(data, { failOn: 'error' })
    .resize(width, height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .png().toBuffer();
  const decoded = await sharp(outputData).metadata();
  if (decoded.format !== 'png' || decoded.width !== width || decoded.height !== height) {
    throw new Error('最终编码后的格式或尺寸不符合要求，未保存');
  }
  const directory = path.resolve(outputDir ?? path.join(root, accountName, shortTopic, '封面'));
  await fs.mkdir(directory, { recursive: true });
  const stem = `${accountName}${ep ? `_EP${ep}` : ''}_封面_${shortTopic}_${width}x${height}`;
  let version = 1;
  let savedPath;
  for (;;) {
    const suffix = version === 1 ? '' : `_V${version}`;
    const candidate = path.join(directory, `${stem}${suffix}.png`);
    let handle;
    try {
      // Exclusive creation prevents accidental overwrite, including concurrent runs.
      handle = await fs.open(candidate, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') { version += 1; continue; }
      throw error;
    }
    try {
      await handle.writeFile(outputData);
      await handle.sync();
    } catch (error) {
      await handle.close();
      // This path was created exclusively by this operation; never touch an existing asset.
      await fs.unlink(candidate).catch(() => {});
      throw error;
    }
    await handle.close();
    savedPath = candidate;
    break;
  }
  const result = await inspectCover({ input: savedPath, width, height, sharp });
  return {
    ...result, source: sourcePath, version, unchangedPixels: unchanged,
    sourceWidth: metadata.width, sourceHeight: metadata.height,
    aspectDifferencePercent: Number((ratioError * 100).toFixed(4)),
    upscaled: upscale,
  };
}

const HELP = `通用公众号封面输出工具（不生图、不联网、不覆盖）
inspect  --input <图片> [--width 1080 --height 460] --node-modules <依赖目录>
finalize --input <图片> --account <公众号名称> [--episode <明确要求显示的期数>] --topic <主题短名>
         [--width 1080 --height 460] [--root <公众号根目录>]
         [--output-dir <指定输出目录>] [--allow-upscale]
         --node-modules <依赖目录>
inspect 错尺寸/非PNG退出码为2；读取或参数错误退出码为1。`;

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    input: { type: 'string' }, account: { type: 'string' }, episode: { type: 'string' }, topic: { type: 'string' },
    width: { type: 'string', default: '1080' }, height: { type: 'string', default: '460' },
    root: { type: 'string' }, 'output-dir': { type: 'string' }, 'node-modules': { type: 'string' },
    'allow-upscale': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(HELP); return 0; }
  if (positionals.length !== 1 || !['inspect', 'finalize'].includes(positionals[0])) {
    throw new Error(HELP);
  }
  const config = {
    input: values.input, width: Number(values.width), height: Number(values.height),
    moduleDir: values['node-modules'],
  };
  const result = positionals[0] === 'inspect'
    ? await inspectCover(config)
    : await finalizeCover({ ...config, account: values.account, episode: values.episode, topic: values.topic,
      root: values.root, outputDir: values['output-dir'], allowUpscale: values['allow-upscale'] });
  console.log(JSON.stringify(result, null, 2));
  return result.valid ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}
