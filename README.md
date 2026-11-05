<div align="center">

<img src="docs/banner.png" alt="DeepSeek Harness and Better Context Engine" width="240" />

# dsh-bce

**Context-aware prompt enhancement for the DeepSeek Harness composer, powered by your Better Context Engine MCP.**

[![npm](https://img.shields.io/npm/v/dsh-bce?color=4D6BFE)](https://www.npmjs.com/package/dsh-bce) [![License](https://img.shields.io/badge/license-MIT-3DA639)](#license) [![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=node.js&logoColor=white)](#requirements) [![Platform](https://img.shields.io/badge/DeepSeek%20Harness-web%20%7C%20Desktop-1F2937)](https://github.com/deepseek-ai/deepseek-harness) [![DSH](https://img.shields.io/badge/DSH-0.1.1--rc.2%20~%200.2.2--rc.1-4D6BFE)](#requirements)

English · [简体中文](README.zh.md)

<sub>Friends · <a href="https://github.com/J3n5en/EnsoCode"><img src="docs/ensocode.png" alt="" width="18" height="18" valign="middle" /> EnsoCode</a></sub>

[Demo](#demo) · [Features](#features) · [How it works](#how-it-works) · [Installation](#installation) · [EnsoCode](#ensocode) · [Usage](#usage) · [FAQ](#faq)

</div>

---

`dsh-bce` adds an enhance icon next to the composer's attach button. One click incrementally indexes the current workspace through the Better Context Engine (BCE) MCP server already configured in your profile, then rewrites the draft into a context-rich prompt.

> [!NOTE]
> The plugin stores no BCE base URL or token. Credentials live only in the active profile's MCP entry and are used by bce-tool on the host; they are never sent to the UI (the web page or the Desktop window).

## Demo

<div align="center">
  <img src="docs/demo.gif" alt="Click the enhance icon, wait for indexing, and the draft is replaced by the enhanced prompt" width="100%" />
  <br />
  <sub>Played at 1.5× speed · <a href="docs/demo.mp4">Download MP4</a></sub>
</div>

## Features

- **One-click enhancement** – the icon sits on `conversation.input.left` (order `-40`), right next to the attach button.
- **Workspace-aware** – runs an incremental `search_context` before `enhance_prompt`, so the rewrite is grounded in your code.
- **Clear feedback** – disabled on an empty draft; while running it shows **Enhancing prompt…**, an animated edge ring, and locks further clicks.
- **Reversible** – **Restore original** brings back the pre-enhancement draft.
- **Zero extra config** – reuses the profile's bce-tool MCP; no plugin-side BCE settings form.
- **One bundle** – web and Desktop share the same client build.

## Overview

| Item | Value |
| :--- | :--- |
| Host | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`web` / Desktop) |
| Engine | [Better Context Engine](https://github.com/linqiu919/better-context-engine) |
| MCP server | [bce-tool](https://github.com/linqiu919/bce-tool-rs) (`search_context`, `enhance_prompt`) |
| Client platform | `dsh.client.platform: web` (shared by web and Desktop) |
| Enhance timeout | 90 s (`ENHANCE_TIMEOUT_MS`) |
| Index timeout | MCP `toolCallTimeoutMs` |

## How it works

```mermaid
sequenceDiagram
  participant UI as Composer (enhance icon)
  participant Host as dsh-bce Host RPC
  participant MCP as bce-tool MCP
  participant BCE as Better Context Engine
  UI->>Host: dsh-bce.enhance(draft, workspace)
  Host->>MCP: search_context
  MCP->>BCE: incremental index + retrieval
  Host->>MCP: enhance_prompt
  MCP->>BCE: rewrite prompt
  Host-->>UI: enhanced prompt
  UI->>UI: setDraft (original kept for Restore)
```

1. The client reads the composer draft and resolves the workspace path.
2. Host RPC `dsh-bce.enhance` locates `mcp__*__search_context` and `mcp__*__enhance_prompt`; servers whose name contains `bce` are preferred.
3. `search_context` performs incremental indexing and retrieval.
4. `enhance_prompt` rewrites the prompt, aborted after 90 s.
5. The enhanced text replaces the draft. **Restore original** writes back the previous prompt.

> [!IMPORTANT]
> bce-tool must be started with `--no-webbrowser-enhance-prompt`. Without it, `enhance_prompt` waits on a local review page and the request times out.

## Requirements

| Component | Constraint |
| :--- | :--- |
| Node.js | `^22.19` or `>=24` |
| DeepSeek Harness | `0.1.1-rc.2` – `0.2.2-rc.1`, web CLI or official Desktop |
| BCE | Reachable HTTP API and a valid token |
| bce-tool MCP | Same profile as the plugin, with `--no-webbrowser-enhance-prompt` |
| Workspace | Git repository, unless the MCP is started with `--allow-non-git` |

Web and Desktop profiles do not share MCP servers or plugin installs. Configure each one separately.

## Installation

### 1. Register the bce-tool MCP

Add the following to the target profile's `cordis.patch.yml`:

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

| Field | Notes |
| :--- | :--- |
| `serverName` | Any name. Discovery matches tool-name suffixes; names containing `bce` are preferred. |
| `command` | On Desktop / Electron, use an absolute `npx` path — the GUI `PATH` usually omits nvm. |
| `toolCallTimeoutMs` | Indexing budget, independent of the plugin's 90 s enhance abort. |

### 2. Install the plugin

Install the prebuilt package from npm. No local build is required.

```sh
# web
dsh plugin --profile web add dsh-bce

# official Desktop: launch once, quit completely, then run
dsh plugin --profile desktop add dsh-bce
```

If the packaged Desktop app boots the `web` profile under its own data directory, install into that profile instead.

To update later, run the same command with `dsh-bce@latest`.

### 3. Restart

Quit DeepSeek Harness completely and start it again.

> [!TIP]
> Host and client plugins load at process start. A soft reload of the window is not enough.

### Build from source (optional)

```sh
git clone https://github.com/linqiu919/dsh-bce.git
cd dsh-bce
pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

## EnsoCode

The same enhance icon is also an [EnsoCode](https://github.com/J3n5en/EnsoCode) plugin in [`enso/`](enso/). It keeps the DeepSeek Harness interaction — the sparkle "B" icon, the conic-gradient ring, status colors, restore, and the zh/en copy — uses a 25px rounded-square button that matches Enso's native composer buttons, and calls Enso's plugin APIs instead of the DSH host RPC. It needs EnsoCode **0.2.13** or newer. The files in `enso/` are plain ESM, including `icon.png`, so installing from GitHub does not build this package. Enso 0.2.14 shows that icon in Settings.

### 1. Register the bce-tool MCP

In **Settings → MCP**, add bce-tool and enable it. On Desktop, point `command` at an absolute `npx` — the GUI `PATH` usually omits nvm.

| Field | Value |
| :--- | :--- |
| Command | `npx` |
| Args | `-y bce-tool --base-url https://your-bce-host --token *** --no-webbrowser-enhance-prompt` |

`--no-webbrowser-enhance-prompt` is required. Without it, `enhance_prompt` waits on a local review page and times out. Add `--allow-non-git` when the folder is not a Git repository. The BCE URL and token stay in this MCP entry; the plugin never reads them.

If more than one server exposes `enhance_prompt`, open the plugin settings (the gear on its row) and set **MCP server**. Leave it empty to prefer a server whose name contains `bce`, otherwise the first match.

### 2. Install and enable

Settings → Plugins → Enso plugins → paste this link:

```text
https://github.com/linqiu919/dsh-bce/tree/main/enso
```

A newly installed plugin stays off until you enable it. From a shell:

```sh
enso-server plugin install https://github.com/linqiu919/dsh-bce/tree/main/enso
enso-server plugin enable dsh.bce
```

The id is `dsh.bce`. Enso requires a dotted reverse-DNS id (`^[a-z][a-z0-9]*(\.[a-z0-9]+)+$`), so the bare name `dshbce` is rejected. Enso's update check compares the manifest `version` and does not install on its own.

### 3. Use it

Open a project, type a non-empty draft, and click the enhance icon on the left of the composer. **Restore original** puts back the first draft of this enhancement chain. Another click, without editing in between, keeps that same original.

### Differences from the DeepSeek Harness build

| | DeepSeek Harness | EnsoCode |
| :--- | :--- | :--- |
| Slot | `conversation.input.left` | `composer.left` |
| Workspace | Session cwd and the workspace registry | The session's `projectRoot`. A session with no local project shows **Open a workspace first.** |
| Draft write | `setDraft` (outside the undo stack) | `replaceDraft`, checked against the generation and rev read before the call. If the draft changed, or it contains file or session references, it is left as it is. |
| Index and enhance budget | Indexing follows MCP `toolCallTimeoutMs`; the rewrite is aborted at 90s | One 90s cap for the whole click (`timeoutMs: 90000`). The plugin reports the timeout 1.5s early so the message stays specific. `mcp.call` still has no abort handle, so the in-flight tool is cancelled when that 90s host budget fires. |
| Drafts with references, or over 32KB | `setDraft` writes the text | `readDraft` returns plain text only, plus `hasReferences`. There is no segment, patch, or partial-edit API, and `replaceDraft` refuses drafts that contain file or session references. `setText` would drop the chips. The plugin then leaves the draft alone and offers **Copy enhanced text** (host clipboard, 1MB). |
| Language | Profile locale (zh / en) | `enso.locale` when the host exposes one. Enso 0.2.13 does not, so the button uses the page language, then the browser language. |
| Install | `dsh plugin add` | The GitHub directory link above. Install and enable are separate steps. |

Cmd/Ctrl+Z still does not undo a replaced draft. Use **Restore original**.

## Usage

1. Open a workspace.
2. Type a non-empty prompt in the composer.
3. Click the enhance icon. The status reads **Enhancing prompt…**
4. When it finishes, the draft is replaced. Click **Restore original** to go back.

## FAQ

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| BCE MCP was not found | `enhance_prompt` is not loaded in this profile | Add the MCP entry above with `--no-webbrowser-enhance-prompt`, then restart. Configure web and Desktop separately. |
| Open a workspace first | The session has no workspace root | Select a workspace and retry. |
| Enhancement is slow | Latency is tied directly to the enhancement model configured in the BCE engine: `enhance_prompt` is generated by that model, so duration depends on its inference speed, output length, and upstream load | Switch to a faster enhancement model in the BCE engine, or check the model service load. The plugin only calls the tool and writes back the result; it does not affect generation time. |
| Enhancement timed out (90 s) | Review page blocking, or a slow BCE enhancement model | Make sure `--no-webbrowser-enhance-prompt` is set; if it still times out, switch to a faster enhancement model in the BCE engine. Indexing is governed by `toolCallTimeoutMs`, not the 90 s cap. |
| Not a Git repository | bce-tool default | Add `--allow-non-git`. |
| Project too large to index | bce-tool size limit | Narrow the tree with `.gitignore` / `.bceignore`. |
| No response after an update | Stale process | Quit completely and reopen. |
| Cmd/Ctrl+Z does not revert | `setDraft` is outside the composer undo stack | Use **Restore original**. |
| Markdown is not rendered in the composer | The composer is a plain-text draft with file-reference chips | Keep enhancer output as plain text. |

**Why doesn't the UI call BCE directly?** The BCE service has no CORS layer, and the token must stay on the host. The enhance icon calls the host RPC, which executes the configured MCP tools.

## License

MIT
