<div align="center">

<img src="docs/banner.png" alt="DeepSeek Harness 与 Better Context Engine" width="480" />

# dsh-bce

**为 DeepSeek Harness Composer 提供基于工作区上下文的提示增强，复用你已配置的 Better Context Engine MCP。**

[![npm](https://img.shields.io/npm/v/dsh-bce?color=4D6BFE)](https://www.npmjs.com/package/dsh-bce) [![License](https://img.shields.io/badge/license-MIT-3DA639)](#许可) [![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=node.js&logoColor=white)](#环境要求) [![Platform](https://img.shields.io/badge/DeepSeek%20Harness-web%20%7C%20Desktop-1F2937)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) · 简体中文

[演示](#演示) · [功能](#功能) · [工作原理](#工作原理) · [安装](#安装) · [使用](#使用) · [常见问题](#常见问题)

</div>

---

`dsh-bce` 在 Composer 附件按钮旁增加一个增强图标。点击后，插件通过当前 profile 已配置的 Better Context Engine（BCE）MCP 对工作区做增量索引，再把草稿重写为带有上下文的提示词。

> [!NOTE]
> 插件不保存 BCE 服务地址或 Token。凭证仅存在于当前 profile 的 MCP 配置中，不会进入浏览器。

## 演示

<div align="center">
  <img src="docs/demo.gif" alt="点击增强图标，等待索引完成后，草稿被替换为增强后的提示词" width="100%" />
  <br />
  <sub>1.5 倍速播放 · <a href="docs/demo.mp4">下载 MP4</a></sub>
</div>

## 功能

- **一键增强**：图标位于插槽 `conversation.input.left`（order `-40`），紧挨附件按钮。
- **感知工作区**：先增量 `search_context`，再 `enhance_prompt`，增强结果基于你的代码。
- **状态清晰**：草稿为空时禁用；进行中显示 **提示增强中**、边缘流动光环，并锁定重复点击。
- **可还原**：增强成功后可点 **还原** 恢复原稿。
- **零额外配置**：复用 profile 中的 bce-tool MCP，不提供插件内 BCE 配置页。
- **单一产物**：web 与 Desktop 共用同一客户端构建。

## 概览

| 项目 | 说明 |
| :--- | :--- |
| 宿主 | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`web` / Desktop） |
| 引擎 | [Better Context Engine](https://github.com/linqiu919/better-context-engine) |
| MCP 服务 | [bce-tool](https://github.com/linqiu919/bce-tool-rs)（`search_context`、`enhance_prompt`） |
| 客户端平台 | `dsh.client.platform: web`（web 与 Desktop 共用） |
| 增强超时 | 90 秒（`ENHANCE_TIMEOUT_MS`） |
| 索引超时 | MCP `toolCallTimeoutMs` |

## 工作原理

```mermaid
sequenceDiagram
  participant UI as Composer（增强图标）
  participant Host as dsh-bce Host RPC
  participant MCP as bce-tool MCP
  participant BCE as Better Context Engine
  UI->>Host: dsh-bce.enhance（草稿、工作区）
  Host->>MCP: search_context
  MCP->>BCE: 增量索引与检索
  Host->>MCP: enhance_prompt
  MCP->>BCE: 重写提示词
  Host-->>UI: 增强结果
  UI->>UI: setDraft（保留原稿供还原）
```

1. 客户端读取 Composer 草稿并解析工作区路径。
2. Host RPC `dsh-bce.enhance` 发现 `mcp__*__search_context` 与 `mcp__*__enhance_prompt`，优先使用名称含 `bce` 的服务。
3. `search_context` 执行增量索引与检索。
4. `enhance_prompt` 重写提示词，超过 90 秒自动中止。
5. 增强文本替换草稿，**还原** 可写回增强前的原文。

> [!IMPORTANT]
> bce-tool 必须带 `--no-webbrowser-enhance-prompt` 启动，否则 `enhance_prompt` 会阻塞在本地审查页，最终超时。

## 环境要求

| 组件 | 约束 |
| :--- | :--- |
| Node.js | `^22.19` 或 `>=24` |
| DeepSeek Harness | web CLI 或官方 Desktop |
| BCE | 可访问的 HTTP API 与有效 Token |
| bce-tool MCP | 与插件位于同一 profile，并带 `--no-webbrowser-enhance-prompt` |
| 工作区 | Git 仓库；非 Git 目录需 MCP 启用 `--allow-non-git` |

web 与 Desktop 的 MCP 和插件安装相互隔离，需要分别配置。

## 安装

### 1. 注册 bce-tool MCP

将以下内容加入目标 profile 的 `cordis.patch.yml`：

```yaml
- insert:
  - id: mcp-bce
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: bce
      transport: stdio
      command: npx
      args:
        - -y
        - bce-tool
        - --base-url
        - 'https://your-bce-host'
        - --token
        - '***'
        - --allow-non-git
        - --no-webbrowser-enhance-prompt
      env:
        PATH: /usr/local/bin:/usr/bin
      toolCallTimeoutMs: 120000
      failOnStartupError: false
```

| 字段 | 说明 |
| :--- | :--- |
| `serverName` | 可自定义。按工具名后缀发现，名称含 `bce` 时优先。 |
| `command` | Desktop / Electron 建议使用 `npx` 绝对路径，图形界面的 `PATH` 通常不含 nvm。 |
| `toolCallTimeoutMs` | 索引超时，与插件 90 秒的增强中止相互独立。 |

### 2. 安装插件

直接从 npm 安装已构建好的包，无需本地构建。

```sh
# web
dsh plugin --profile web add dsh-bce

# 官方 Desktop：先启动一次，完全退出后再执行
dsh plugin --profile desktop add dsh-bce
```

若打包版 Desktop 实际启动的是其数据目录下的 `web` profile，请对该 profile 执行安装。

后续更新时，将包名换成 `dsh-bce@latest` 再执行一次即可。

### 3. 重启

完全退出 DeepSeek Harness 后重新启动。

> [!TIP]
> 宿主与客户端插件在进程启动时加载，仅刷新窗口不会生效。

### 从源码构建（可选）

```sh
git clone https://github.com/linqiu919/dsh-bce.git
cd dsh-bce
pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

## 使用

1. 打开工作区。
2. 在 Composer 中输入非空提示词。
3. 点击增强图标，状态显示 **提示增强中**。
4. 完成后草稿被替换；点击 **还原** 可恢复原文。

## 常见问题

| 现象 | 原因 | 处理 |
| :--- | :--- | :--- |
| 未检测到 BCE MCP | 当前 profile 未加载 `enhance_prompt` | 按上文添加 MCP（含 `--no-webbrowser-enhance-prompt`）后重启。web 与 Desktop 需分别配置。 |
| 请先打开一个工作区 | 会话未绑定工作区根目录 | 选择工作区后重试。 |
| 增强耗时较长 | 增强延迟与 BCE 引擎配置的增强模型直接相关：`enhance_prompt` 由该模型生成，耗时取决于模型推理速度、输出长度与上游负载 | 在 BCE 引擎中改用响应更快的增强模型，或检查模型服务的负载。插件本身只负责调用和写回，不影响生成耗时。 |
| 增强超时（90 秒） | 审查页阻塞，或 BCE 增强模型响应过慢 | 确认已加 `--no-webbrowser-enhance-prompt`；仍超时则在 BCE 引擎中更换更快的增强模型。索引耗时由 `toolCallTimeoutMs` 控制，不受 90 秒限制。 |
| 不是 Git 仓库 | bce-tool 默认行为 | 添加 `--allow-non-git`。 |
| 项目过大，无法索引 | bce-tool 体积限制 | 使用 `.gitignore` / `.bceignore` 缩小范围。 |
| 更新后点击无响应 | 进程未重新加载 | 完全退出后重启。 |
| Cmd/Ctrl+Z 无法撤销 | `setDraft` 不进入 Composer 撤销栈 | 使用 **还原**。 |
| 输入框不渲染 Markdown | Composer 是纯文本草稿加文件引用 chip | 增强结果使用纯文本。 |

**为什么不从浏览器直连 BCE？** BCE 服务端没有 CORS，且 Token 不能进入浏览器。增强图标通过 Host RPC 调用已配置的 MCP 工具。

## 许可

MIT
