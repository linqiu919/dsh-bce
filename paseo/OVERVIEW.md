BCE Prompt Enhance adds an enhance icon to the composer of a running agent. Click it to rewrite the draft with code context from Better Context Engine (BCE). The plugin refreshes the BCE index of the agent's folder, rewrites the draft, and writes the result back into the composer. A Restore original button brings back the draft you started with.

## How it works

Paseo plugins cannot call MCP servers that Claude Code or Codex own, so the plugin starts its own copy of your bce-tool MCP server on the daemon. It calls `search_context` to update the index and then `enhance_prompt` to rewrite the draft. Both calls share a 90 second limit. The bce-tool process starts in the background when you begin typing a draft, so the first click does not wait for it. It serves every agent and window on that daemon and stops after 10 idle minutes. Nothing runs when Paseo starts.

## Setup

- Configure bce-tool as a stdio MCP server in Claude Code (`~/.claude.json`) or Codex (`~/.codex/config.toml`). The plugin uses the entry whose name contains "bce", or the name you set in the plugin settings.
- Alternatively, enter the full bce-tool command line in the plugin settings. It takes priority over the Claude Code and Codex entries.
- The daemon host needs the command in that entry, usually `npx` from Node.js. The plugin adds the login shell PATH and common install folders when it starts the command.
- Requires Paseo 0.17.4 or later on the daemon and the app.

## Data and permissions

- Reads `~/.claude.json` and `~/.codex/config.toml` on the daemon host to find the bce entry, including the token in its arguments or environment. The token is passed only to the bce-tool child process. It is not stored by the plugin and is masked in errors and in the settings screen.
- Runs the configured command as a child process. If that command is `npx -y bce-tool`, npm may download bce-tool from the npm registry the first time.
- bce-tool sends the draft and the indexed project files to the BCE server named in your configuration.
- `--no-webbrowser-enhance-prompt` is added to bce-tool so a browser review page cannot block enhancement.

## Limits

- Works in the composer of a running agent. The draft composer of a new agent and the New workspace screen show a hint instead, because Paseo does not tell plugins which folder those drafts belong to.
- The plugin finds the agent by matching the draft text. If agents in different folders hold the identical draft, it asks you to edit the draft first.
- On phones and narrow windows Paseo places the icon in the composer overflow menu.
- bce-tool indexes Git repositories unless its own configuration allows other folders.
