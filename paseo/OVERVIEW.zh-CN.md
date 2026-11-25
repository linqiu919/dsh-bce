BCE 提示词增强会在运行中 agent 的输入框里加一个增强图标。点击后，插件用 Better Context Engine（BCE）补全代码上下文：先刷新该 agent 目录的 BCE 索引，再改写草稿，并把结果写回输入框。「还原」按钮可以恢复增强前的原稿。

## 工作方式

Paseo 插件无法调用 Claude Code 或 Codex 自己持有的 MCP 服务，所以插件会在 daemon 上单独启动一个 bce-tool MCP 服务。它先调用 `search_context` 更新索引，再调用 `enhance_prompt` 改写草稿，两步共用 90 秒时限。bce-tool 进程在你开始输入草稿时于后台预先启动，第一次点击无需再等它启动；它供该 daemon 上的所有 agent 和窗口共用，空闲 10 分钟后自动退出。Paseo 启动时插件不做任何事。

## 配置

- 在 Claude Code（`~/.claude.json`）或 Codex（`~/.codex/config.toml`）中把 bce-tool 配置为 stdio MCP 服务。插件使用名称含 "bce" 的条目，或插件设置中指定名称的条目。
- 也可以在插件设置中直接填写完整的 bce-tool 命令行，它优先于 Claude Code 和 Codex 中的条目。
- daemon 所在机器需要能执行该条目中的命令，通常是 Node.js 自带的 `npx`。插件启动命令时会合并登录 shell 的 PATH 和常见安装目录。
- daemon 和客户端都需要 Paseo 0.17.4 或更高版本。

## 数据与权限

- 读取 daemon 所在机器上的 `~/.claude.json` 和 `~/.codex/config.toml` 来查找 bce 条目，包括其参数或环境变量中的 Token。Token 只传给 bce-tool 子进程，插件不保存，在错误信息和设置页中会打码。
- 以子进程方式运行配置的命令。如果命令是 `npx -y bce-tool`，首次运行时 npm 可能会从 npm 仓库下载 bce-tool。
- bce-tool 会把草稿和被索引的项目文件发送到配置中指定的 BCE 服务端。
- 插件会给 bce-tool 加上 `--no-webbrowser-enhance-prompt`，避免浏览器审查页阻塞增强。

## 限制

- 只在运行中 agent 的输入框里可用。新建 agent 的草稿框和新建工作区页面会显示提示，因为 Paseo 不会告诉插件这些草稿属于哪个目录。
- 插件通过草稿文本匹配所属 agent。如果不同目录的 agent 草稿完全相同，会提示先修改草稿。
- 在手机和窄窗口中，Paseo 会把图标放进输入框的溢出菜单。
- 除非 bce-tool 自身配置允许其他目录，否则它只索引 Git 仓库。
