# 纳管脚本清单与发布追踪

本目录用于追踪本工作区纳管的所有油猴/FireMonkey 脚本、其上游更新状态、兼容改写进度，以及面向浏览器插件的直接安装与自动更新地址。

---

## 插件直接安装与自动更新指南

所有已发布的兼容脚本均存放于仓库的 [`releases/`](../releases) 目录下，并被 Git 直接追踪。浏览器脚本管理器（以 **FireMonkey** 为主，亦兼容 Tampermonkey / Violentmonkey）支持直接使用 GitHub Raw URL 进行一键安装与全自动更新。

### 安装方法
1. 在 Firefox 或支持的浏览器中安装 [FireMonkey](https://addons.mozilla.org/firefox/addon/firemonkey/)。
2. 点击下方清单中的 **「安装链接 (.user.js)」**，或复制对应 Raw URL 到 FireMonkey 的 URL 导入栏中。
3. 扩展将自动弹出脚本安装界面，确认权限后点击安装即可。

### 自动更新机制
- 每个发布脚本的元数据中均显式注入了标准 `@downloadURL` 与 `@updateURL`：
  - `@downloadURL`: 指向 GitHub `master` 分支的 `releases/<scriptId>.user.js`
  - `@updateURL`: 指向轻量级的元数据文件 `releases/<scriptId>.meta.js`
- 浏览器插件在后台轮询更新时，只需请求极小的 `.meta.js` 检查 `@version`。当 GitHub 仓库合并更新后，插件检测到版本递增，即可无缝拉取最新脚本进行静默自动升级。

---

## 纳管脚本列表

| 编号 / ID | 脚本名称 | 上游来源 | 状态 | 一键安装 (.user.js) | 自动更新 (.meta.js) | 说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| `greasyfork-24204` | **Picviewer CE+ [FM-Compat]** (在线图片查看器) | [Greasy Fork 24204](https://greasyfork.org/zh-CN/scripts/24204-picviewer-ce) | ✅ 已适配发布 (v2026.9.29.1) | [安装链接](https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/greasyfork-24204.user.js) | [更新检查](https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/greasyfork-24204.meta.js) | [适配记录](picviewer-ce-conversion.md) |
| `greasyfork-454120` | **南加北加论坛强化脚本(凛+)** | [Greasy Fork 454120](https://greasyfork.org/zh-CN/scripts/454120) | ⏳ 追踪中 (候选适配待确认) | 待发布 | 待发布 | [配置说明](configuration.md) |

---

## 脚本详细状态与适配说明

### 1. Picviewer CE+ [FM-Compat] (`greasyfork-24204`)
- **上游作者**: NLF && ywzhaiqi && hoothin
- **当前发布版本**: `2026.9.29.1`
- **脚本名称与共存机制**: 发布元数据中所有 `@name`（及多语言 `@name:*`）均追加了 ` [FM-Compat]` 后缀，避免与用户浏览器中已安装的原版脚本冲突或覆盖，支持双版本并存调试。
- **上游快照 Hash**: `0583af3f0ab35df661b166c8588e034596e2cf96fdd31d1efb38d29088d8054d`
- **兼容改写要点**:
  - **Gallery 样式引用**: 修复 FireMonkey 下样式节点插入返回值规范，确保 Gallery 启动不报错。
  - **设置面板修复**: 适配同文档 iframe 嵌套环境下的设置面板加载、标签页切换、配置保存与关闭重开。
  - **全局声明与依赖绑定**: 显式引入 Video.js 8.23.3 `@require` 声明，补全 `pvcep_rules.js`、`pvcep_lang.js` 与 `GM_config` 的锁定摘要。
  - **静态校验**: 严格通过 ESLint 校验与 FireMonkey 3.9 / Firefox 157.0 策略约束。
- **发布产物**:
  - 完整脚本: [`releases/greasyfork-24204.user.js`](../releases/greasyfork-24204.user.js)
  - 检查头: [`releases/greasyfork-24204.meta.js`](../releases/greasyfork-24204.meta.js)
  - 证据清单: [`releases/greasyfork-24204.manifest.json`](../releases/greasyfork-24204.manifest.json)

### 2. 南加北加论坛强化脚本(凛+) (`greasyfork-454120`)
- **上游作者**: tousakarin
- **当前状态**: 上游版本已锁定（见 `config/sources/greasyfork-454120.lock.json`）。自动化定时更新工作流每周持续检测上游变动。待人工审查与高级特性适配后发布。

### 3. 静态保留脚本 (`legacy-static/`)
仓库历史静态脚本存放于 [`legacy-static/`](../legacy-static) 目录，未纳入自动化转换管线，保持原样：
- `miniflux.userscript.js` / `miniflux.userstyle.css`
- `html5player-ningmeng.js`
- `slack-web-helper.user.js` / `slack-web-sidebar-toggler.user.js`
- `spotify-web-sidebar-toggler.user.js` / `styles/spotify-side-mode.css`

---

## 自动化更新与发布全流程

本工作区实现了三段式自动化管线：

```
[上游 Greasy Fork]
       │ (每周定时 / 手动触发)
       ▼
1. 追踪上游更新 (.github/workflows/fm-scheduled-updates.yml)
   - 比较上游 content hash 与 source.lock.json
   - 发现更新时执行转换 / 适配脚本
       │
       ▼
2. 转换脚本，生成 PR
   - 产生候选脚本与检验报告 (updates/candidates/)
   - 自动推送到分支 automation/fm-updates 并创建 PR
   - 维护者在 PR 中审查代码变更与诊断信息
       │ (人工审查并合并 PR 到 master)
       ▼
3. 合并 PR 发布 (.github/workflows/fm-release.yml)
   - 触发自动化发布脚本 (pnpm publish-scripts)
   - 注入最新 @version、@downloadURL、@updateURL
   - 产出并提交 .user.js / .meta.js / .manifest.json 至 releases/
   - 浏览器插件检测到 master 分支 .meta.js 递增，静默完成自动更新
```
