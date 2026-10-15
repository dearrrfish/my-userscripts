# Picviewer CE+ 转换记录

Picviewer CE+（Greasy Fork 24204）已生成 FireMonkey 静态候选；实际浏览器及脚本行为验收仍待进行。

| 项目 | 记录 |
| --- | --- |
| 上游 | https://greasyfork.org/zh-CN/scripts/24204-picviewer-ce |
| 上游版本 | 2026.9.29.1 |
| 目标 | FireMonkey 3.9 / Firefox 157.0 / ESLint 10.11.0 |
| 转换运行 | `1792082534645-6d9b35d7-8a7b-4280-83cd-6f24cf46b128` |
| 原始源码 SHA256 | `0583af3f0ab35df661b166c8588e034596e2cf96fdd31d1efb38d29088d8054d` |
| 候选 SHA256 | `13cb48ebe60a0d35480cafaa1e8bd63abaf0bf7bda7e29ff96c99fd366168630` |
| 本地候选 | `artifacts/converted/greasyfork-24204-settings-fix.user.js`（忽略的生成文件） |
| 状态 | `pending-browser`；parse、metadata、lint 通过；fixture、browser 待验收 |
| 发布 | 禁用；未提交 Git 或上传 |

## 配置与本地来源

[上游配置](../config/scripts.picviewer-ce.json)与[上游锁记录](../config/sources/greasyfork-24204.lock.json)保留原始下载入口及三个依赖哈希。
[适配配置](../config/scripts.picviewer-ce.adapted.json)使用本地 `.fm/adaptations/picviewer-ce/candidate.user.js`；活动 `source.lock.json` 绑定适配源码和四个依赖。
第三方源码、缓存、生成产物及原始报告保留在忽略的 `.fm/` / `artifacts/`。自编适配器、回归测试及可复现构建入口纳入 [scripts/adapters/picviewer-ce](../scripts/adapters/picviewer-ce/README.md)；构建拒绝变化的上游字节，并校验最终输出与人工测试版本哈希一致。

## 主要适配

- 保留名称、namespace、作者、原始元数据与同步存储调用；通过辅助函数保留宽松比较的转换顺序和语义。
- 整理花括号、未使用绑定等 lint 问题，保留有副作用的初始化、链式赋值顺序和自定义原型方法分派；未关闭或降低固定 lint 规则。
- 按用户批准，将 Video.js 8.23.3 固定为 `@require`，移除运行时下载后 `Function` 执行；JS 改为初始化时加载，CSS 仍按需加载。新增依赖 SHA256：`41f59413f148335cb442008aad4c619c909e4ec17edef88e94685f11fb70d440`。
- 新增 GM_config 日志回退所需的 `GM_log` grant。
- FireMonkey 的下载 API 接收 `(url, filename)`，与上游对象参数不同；候选使用原有 `urlToBlob` / `saveAs` 路径，保留请求头、重试及文件名处理。
- 修正转换器的局部 GM 标识符与 typeof 检测、脚本解析模式，并按已校验哈希的 `@require` 顶层声明识别库全局变量；补全有固定官方源码证据的 API profile。

## 已执行的验证与限制

完整 `pnpm test`、`pnpm typecheck`、profile/context 和隐私检查通过。882 组自建宽松比较对照测试及赋值顺序、方法分派、文件名过滤、下载适配测试通过；这些只执行自行编写的测试数据与辅助函数，未执行上游脚本、候选或下载的依赖。
真实 CLI 转换退出 0 并生成候选。静态通过允许保留警告，不等于完整行为等价证明。后续 `verify --static` 仍会因为缺少 fixture/browser 验收而退出 3。

```sh
node packages/cli/src/main.mjs verify --run 1792082534645-6d9b35d7-8a7b-4280-83cd-6f24cf46b128 --static
# VERIFY: 在实际目标 Firefox/FireMonkey 中检查悬浮看图、图库、缩放/旋转、下载、视频、设置重载和控制台；核实 window/globalThis 库导出、HTTP 页面剪贴板及 document.all 行为。
```

候选保留上游 downloadURL/updateURL；上游自动更新可能替换本地适配版本。安装测试时需要明确管理更新来源。发布保持禁用；依赖脚本的 release-preparation 路径还未接入新的依赖源码参数，后续启用发布前需补齐并测试。所有运行验收记录保持待完成。

## Gallery 人工反馈与修复

用户人工运行此前交付的候选时反馈 Gallery 启动报错：`GalleryC.style` 为 undefined，读取 `.sheet` 失败。具体浏览器环境和安装文件哈希未独立核验，未据此填写正式验收收据。

固定 FireMonkey 源码的 addStyle 方法插入样式但未返回 addElement 的结果；原脚本却依赖返回样式节点。新候选的共享 `_GM_addStyle` 直接创建 style、设置 textContent、插入 head（无 head 时使用 documentElement），并同步返回节点；Gallery 及其他样式消费者共用此修复。旧候选文件仍保留，新文件名为 `greasyfork-24204-gallery-fix.user.js`。

已运行自行编写的样式适配器回归测试，检查同步返回、节点身份、CSS 内容、sheet 使用、head/root 回退和重新插入；只执行适配器及测试数据，不执行供应脚本。回放生成、静态验证与 profile/context 检查通过。用户安装修复版并刷新后，反馈“Gallery 已正常启动”。该反馈确认本次启动错误已恢复；未据此补填完整 fixture/browser 验收，其他功能仍待验证。

## Open Settings 人工反馈与修复

用户反馈 Open Settings 无法打开，GM_config 的 iframe load 回调访问 contentDocument 失败；主脚本随后访问同一文档的 body 再次报错。未确定 iframe 不可访问的具体浏览器安全机制，不将其猜测为已证实原因。

新候选使用原库支持的自定义同文档 div 容器，无需 iframe。为分页提供容器内 getElementById（支持含点字段 ID），保留原有框架样式并约束固定按钮定位；在打开回调中绑定快捷键输入，去掉 iframe 移动、重载和定时 contentDocument 访问。三个原始库与 Video.js 的依赖哈希不变，没有修改远程库。Gallery 样式修复仍在，新文件为 `greasyfork-24204-settings-fix.user.js`。

自行编写的适配器测试覆盖分页字段查找、重复打开、关闭后重开、样式及不访问 iframe 文档；回放、静态检查、原 Gallery 和下载回归测试通过，未执行用户脚本或第三方库。用户安装修复版并刷新后确认“打开、分页、保存关闭后重开均正常”。本次 Open Settings 问题已由人工复测确认恢复；其他功能的完整 fixture/browser 验收仍保持待完成。
