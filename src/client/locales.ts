export type BceLocaleKey =
  | 'wand.label'
  | 'wand.enhancing'
  | 'wand.empty'
  | 'wand.noWorkspace'
  | 'wand.mcpMissing'
  | 'wand.notGit'
  | 'wand.tooLarge'
  | 'wand.timeout'
  | 'wand.indexFailed'
  | 'wand.indexTimeout'
  | 'wand.draftChanged'
  | 'wand.upstream'
  | 'wand.noIndex'
  | 'wand.done'
  | 'wand.noRpc'
  | 'wand.restore'

export const en: Record<BceLocaleKey, string> = {
  'wand.label': 'Enhance prompt with BCE',
  'wand.enhancing': 'Enhancing prompt…',
  'wand.empty': 'Enter a prompt first.',
  'wand.noWorkspace': 'Open a workspace first.',
  'wand.mcpMissing': 'BCE MCP was not found. Add bce-tool to this profile with --no-webbrowser-enhance-prompt.',
  'wand.notGit': 'This folder is not a Git repository. bce-tool only indexes Git projects.',
  'wand.tooLarge': 'This project is too large to index. Trim it with .gitignore or .bceignore.',
  'wand.timeout': 'Enhancement timed out (90s). Add --no-webbrowser-enhance-prompt to the bce-tool MCP args, or switch to a faster enhancement model in BCE.',
  'wand.indexFailed': 'Indexing failed. Check the bce-tool MCP logs.',
  'wand.indexTimeout': 'Indexing timed out. Raise toolCallTimeoutMs on the bce-tool MCP entry.',
  'wand.draftChanged': 'The draft changed while enhancing, so it was not replaced.',
  'wand.upstream': 'Enhancement failed. Check MCP tool permissions and bce-tool logs.',
  'wand.noIndex': 'Enhanced without a fresh index (search_context was not found).',
  'wand.done': 'Prompt enhanced.',
  'wand.noRpc': 'Enhancement is not available. Confirm dsh-bce is installed in this profile and restart.',
  'wand.restore': 'Restore original',
}

export const zh: Record<BceLocaleKey, string> = {
  'wand.label': '用 BCE 增强提示',
  'wand.enhancing': '提示增强中',
  'wand.empty': '请先输入提示。',
  'wand.noWorkspace': '请先打开一个工作区。',
  'wand.mcpMissing': '未检测到 BCE MCP。请在当前 profile 配置 bce-tool，并加上 --no-webbrowser-enhance-prompt。',
  'wand.notGit': '当前目录不是 Git 仓库。bce-tool 默认只索引 Git 项目。',
  'wand.tooLarge': '项目过大，无法索引。请用 .gitignore 或 .bceignore 排除大目录后再试。',
  'wand.timeout': '增强超时（90 秒）。请确认 MCP 启动参数包含 --no-webbrowser-enhance-prompt，或在 BCE 中换用更快的增强模型。',
  'wand.indexFailed': '索引失败。请查看 bce-tool MCP 日志。',
  'wand.indexTimeout': '索引超时。请在 bce-tool MCP 配置中调大 toolCallTimeoutMs。',
  'wand.draftChanged': '增强期间草稿已修改，未覆盖。',
  'wand.upstream': '增强失败。请检查 MCP 工具权限和 bce-tool 日志。',
  'wand.noIndex': '已增强，但未做索引（未找到 search_context）。',
  'wand.done': '提示已增强。',
  'wand.noRpc': '增强服务未就绪。请确认当前 profile 已安装 dsh-bce 并重启。',
  'wand.restore': '还原',
}
