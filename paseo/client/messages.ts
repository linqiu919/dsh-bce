import { defineTranslations } from "@getpaseo/plugin/client";

const en = {
  label: "Enhance prompt with BCE",
  enhancing: "Enhancing prompt…",
  empty: "Enter a prompt first.",
  done: "Prompt enhanced.",
  noIndex: "Enhanced without a fresh index (search_context was not found).",
  restore: "Restore original",
  copy: "Copy enhanced text",
  copied: "Copied the enhanced prompt.",
  copyFailed: "Could not copy to the clipboard.",
  draftChanged: "The draft changed while enhancing, so it was not replaced.",
  writeFailed: "Could not write the enhanced prompt back into the composer.",
  unsupportedContext: "Send the first message, then enhance from the agent's composer. New drafts are not supported yet.",
  noWorkspace: "Could not find the agent folder for this draft.",
  ambiguousAgent: "Several agents in different folders have the same draft. Edit it slightly and try again.",
  mcpMissing: "BCE MCP was not found. Add bce-tool to Claude Code or Codex, or set a command in the plugin settings.",
  launchFailed: "bce-tool could not start. Check the command in the plugin settings and the plugin logs.",
  notGit: "This folder is not a Git repository. bce-tool only indexes Git projects.",
  tooLarge: "This project is too large to index. Trim it with .gitignore or .bceignore.",
  indexFailed: "Indexing failed. Check the plugin logs.",
  indexTimeout: "Indexing used up the 90s limit shared with enhancement.",
  timeout: "Timed out (90s). Indexing and enhancement share this limit. Switch to a faster enhancement model in BCE if this repeats.",
  upstream: "Enhancement failed. Check the plugin logs.",
  noRpc: "Enhancement is not available. Confirm the plugin is running in Settings → Plugins.",
  settingsTitle: "BCE",
  sectionLaunch: "bce-tool",
  serverLabel: "MCP server name",
  serverHint: "Optional. Name of the bce entry in ~/.claude.json or ~/.codex/config.toml. Empty uses a name containing \"bce\".",
  commandLabel: "Custom command",
  commandHint: "Optional. A full command line, such as npx -y bce-tool --base-url … --token …. It overrides the Claude Code / Codex entry.",
  save: "Save",
  saved: "Saved.",
  saveFailed: "Could not save the settings.",
  sectionDetect: "Detected command",
  detect: "Check",
  detectHint: "Shows the command the plugin will start. Secrets are masked.",
  detectNone: "Not checked yet.",
  loading: "Loading…",
} as const;

const zhCN: { [Key in keyof typeof en]: string } = {
  label: "用 BCE 增强提示",
  enhancing: "提示增强中",
  empty: "请先输入提示。",
  done: "提示已增强。",
  noIndex: "已增强，但未做索引（未找到 search_context）。",
  restore: "还原",
  copy: "复制增强结果",
  copied: "已复制增强后的提示。",
  copyFailed: "无法写入剪贴板。",
  draftChanged: "增强期间草稿已修改，未覆盖。",
  writeFailed: "无法把增强结果写回输入框。",
  unsupportedContext: "请先发送首条消息，再在会话输入框中增强。新建会话的草稿框暂不支持。",
  noWorkspace: "找不到这份草稿所属 agent 的目录。",
  ambiguousAgent: "多个不同目录的 agent 草稿相同，请稍作修改后再试。",
  mcpMissing: "未检测到 BCE MCP。请在 Claude Code 或 Codex 中配置 bce-tool，或在插件设置中填写启动命令。",
  launchFailed: "bce-tool 启动失败。请检查插件设置中的命令，并查看插件日志。",
  notGit: "当前目录不是 Git 仓库。bce-tool 默认只索引 Git 项目。",
  tooLarge: "项目过大，无法索引。请用 .gitignore 或 .bceignore 排除大目录后再试。",
  indexFailed: "索引失败。请查看插件日志。",
  indexTimeout: "索引用尽了与增强共用的 90 秒。",
  timeout: "已超时（90 秒）。索引和增强共用这个时限。如反复出现，请在 BCE 中换用更快的增强模型。",
  upstream: "增强失败。请查看插件日志。",
  noRpc: "增强服务未就绪。请在 设置 → 插件 中确认本插件正在运行。",
  settingsTitle: "BCE",
  sectionLaunch: "bce-tool",
  serverLabel: "MCP 服务名称",
  serverHint: "可选。~/.claude.json 或 ~/.codex/config.toml 中 bce 条目的名称。留空时使用名称含 \"bce\" 的条目。",
  commandLabel: "自定义命令",
  commandHint: "可选。完整命令行，例如 npx -y bce-tool --base-url … --token …。填写后优先于 Claude Code / Codex 中的条目。",
  save: "保存",
  saved: "已保存。",
  saveFailed: "设置保存失败。",
  sectionDetect: "检测到的命令",
  detect: "检测",
  detectHint: "显示插件将要启动的命令，敏感信息已打码。",
  detectNone: "尚未检测。",
  loading: "加载中…",
};

export const messages = defineTranslations({ resources: { en, "zh-CN": zhCN } });

export type MessageKey = keyof typeof en;

/** Server error code → message key. */
export function messageKeyFor(code: string): MessageKey {
  switch (code) {
    case "empty_prompt": return "empty";
    case "no_workspace": return "noWorkspace";
    case "ambiguous_agent": return "ambiguousAgent";
    case "mcp_missing": return "mcpMissing";
    case "launch_failed": return "launchFailed";
    case "not_git": return "notGit";
    case "too_large": return "tooLarge";
    case "index_failed": return "indexFailed";
    case "index_timeout": return "indexTimeout";
    case "timeout": return "timeout";
    case "no_rpc": return "noRpc";
    case "draft_changed": return "draftChanged";
    case "write_failed": return "writeFailed";
    case "unsupported_context": return "unsupportedContext";
    default: return "upstream";
  }
}
