# DM-gzh-cover

**从标题到摄影风格公众号封面：自动选图、自然扩图、中文排版。**  
**Turn an article title into a photo-based WeChat cover with automatic photo selection, natural outpainting, and Chinese typography.**

DM-gzh-cover 是一套面向 Codex 的可复用封面制作技能。提供公众号名称和完整标题，即可按摄影封面流程制作默认 1080 × 460 PNG，并保留素材来源与历史版本。

DM-gzh-cover is a reusable cover-design skill for Codex. Supply an account name and the complete article title to create a 1080 × 460 PNG, with source attribution and versioned outputs.

## 案例 / Examples

### 浪潮工作室 / Wave Studio

**你不是懒，只是生命力被耗尽了**  
*You're not lazy—your vitality has been drained.*

![浪潮工作室封面 / Wave Studio cover](examples/wave-studio.png)

### 豆瓣时间 / Douban Time

**如果觉得生活没盼头，那就增加生活支点**  
*If life feels hopeless, give yourself more things to lean on.*

![豆瓣时间封面 / Douban Time cover](examples/douban-time.png)

以上为作者指定的历史制作案例，用于展示排版与摄影风格。案例中的公众号名称不代表官方合作或背书；历史案例不等于当前全部默认规则的验收样本。

These author-selected examples demonstrate typography and photographic style. Account names do not imply affiliation or endorsement. Historical examples are not compliance tests for every current default rule.

## 特点 / Features

| 中文 | English |
| --- | --- |
| 比较 5 张具体 Pexels 照片，自动择优 | Compare five specific Pexels photos and select the best fit |
| 向左自然延伸环境，保留主体与整体色调 | Extend the scene naturally to the left while preserving the subject and overall palette |
| 首次扩图检查通过后直接加标题，不默认回贴原图或修补接缝 | Add typography directly after the first outpaint passes inspection; no routine source-photo overlay or seam repair |
| 按语义和留白选择两行或三行标题 | Choose two or three title lines based on meaning and available space |
| 默认只显示公众号名称，不添加 EP 编号 | Show only the account name by default, without episode numbers |
| 检查实际尺寸，另存版本，避免覆盖 | Validate actual dimensions and save new versions without overwriting |

## 安装 / Installation

将本仓库完整目录放入 Codex 的 skills 目录，目录名称保留为 `DM-gzh-cover`。不要只复制 `SKILL.md`，参考图与输出工具同样需要保留。

Place the complete repository folder in your Codex skills directory and keep its folder name as `DM-gzh-cover`. Include the reference images and output utilities, not only `SKILL.md`.

```text
~/.codex/skills/DM-gzh-cover/
```

## 使用 / Usage

```text
使用 $DM-gzh-cover
公众号名称：你的公众号
标题：你的完整文章标题
```

```text
Use $DM-gzh-cover.
Account name: Your WeChat account
Title: Your complete Chinese article title
```

可以补充配色、尺寸、参考图、输出目录或指定换行；只有需要自己挑图时才加上“先给我选图”。

Optionally specify colors, dimensions, reference images, an output directory, or line breaks. Request “show photo candidates first” if you want to choose the photo yourself.

## 环境与流程 / Requirements and workflow

本技能面向具备网页检索、文件读写和内置图像生成能力的 Codex 环境。扩图使用 `imagegen`；字体排版可独立完成。输出工具需要 Node.js 与 `sharp`，不会自动安装依赖。优先使用环境提供的依赖路径。

This skill targets a Codex environment with web search, file access, and built-in image generation. It uses `imagegen` for outpainting and a separate typography step. Output utilities require Node.js and `sharp`; they do not install dependencies automatically. Prefer the runtime dependencies provided by your environment.

```text
node scripts/cover-output.mjs inspect --input cover.png --width 1080 --height 460 --node-modules <node_modules>
node scripts/cover-output.mjs finalize --input cover.png --account "公众号名称" --topic "主题短名" --width 1080 --height 460 --node-modules <node_modules>
```

AI 扩图不保证原照片像素完全不变。需对照检查主体、色调、透视和自然衔接，再叠加标题；不合格时调整提示重新扩图。详见 [SKILL.md](SKILL.md)。

AI outpainting does not guarantee pixel-identical preservation. Inspect the subject, palette, perspective, and transitions before adding text; revise the prompt and regenerate if needed. See [SKILL.md](SKILL.md) for the full workflow.

## 文件结构 / Repository structure

```text
SKILL.md                核心流程 / Core workflow
agents/                 技能元数据 / Skill metadata
assets/                 内置版式参考 / Built-in style references
references/             设计规范与验收 / Design and acceptance guidance
scripts/                尺寸检查与版本输出 / Dimension checks and versioned export
examples/               两张展示案例 / Two showcase examples
artifact-template.json  模板元数据 / Template metadata
```

## 测试 / Tests

在测试进程中将 `WECHAT_COVER_NODE_MODULES` 指向包含 `sharp` 的依赖目录，然后运行：

Set `WECHAT_COVER_NODE_MODULES` to the dependency directory containing `sharp` for the test process, then run:

```text
node --test scripts/cover-output.test.mjs
```

测试覆盖尺寸、比例、损坏文件、禁止默认放大、中文文件名及非覆盖版本保存；不替代视觉检查。

Tests cover dimensions, aspect ratios, corrupt files, upscaling restrictions, Chinese filenames, and collision-safe versioning. They do not replace visual inspection.

## 素材来源 / Image credits

- 浪潮工作室案例 / Wave Studio example: [SHVETS production / Pexels](https://www.pexels.com/photo/tired-housewife-resting-on-sofa-after-housework-7513211/).
- 豆瓣时间案例 / Douban Time example: [Pexels source photo](https://www.pexels.com/photo/cozy-coffee-setup-with-plants-and-books-30254787/).

照片及第三方品牌素材的权利归各自权利人所有。内置参考图用于指导风格，不应将旧标题或品牌自动沿用到新封面。

Photographs and third-party brand assets remain subject to their respective owners' rights. Built-in references guide style; their old titles and branding should not carry over to new covers automatically.
