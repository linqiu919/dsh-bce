// Enhance icon in the composer toolbar: same flow as the DSH and EnsoCode
// versions. Paseo's composer API does not say which agent a composer belongs
// to, so the click matches this draft against each running agent's composer
// and lets the daemon resolve that agent's folder.

import {
  useAgents,
  useComposer,
  useRpc,
  useTranslation,
  type PluginComposerItemProps,
} from "@getpaseo/plugin/client";
import { Icon, copyText } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import {
  MAX_AGENT_CANDIDATES,
  STATUS_CLEAR_MS,
  WARM_DELAY_MS,
  WARM_THROTTLE_MS,
  enhanceRpc,
  warmRpc,
} from "../shared/enhance";
import { getClient } from "./context";
import { enhanceIconSvg } from "./icon";
import { messageKeyFor, messages, type MessageKey } from "./messages";
import {
  forgetRestore,
  rememberEnhancement,
  restoreEntries,
  restoreVersion,
  subscribeRestore,
  type RestoreEntry,
} from "./restore-store";

type Level = "idle" | "busy" | "ok" | "error";

// Paseo's toolbar geometry (control-geometry.ts): a round 28pt slot with a 16pt glyph on
// pointer layouts, 36pt with a 20pt glyph on touch layouts.
const POINTER = { size: 28, icon: 16 } as const;
const TOUCH = { size: 36, icon: 20 } as const;
const RING_WIDTH = 1.5;
const TEXT_RADIUS = 6;
const BUSY_COLOR = "#4f46e5";
const BUSY_TEXT = "#6366f1";

/** Agents on this host whose composer holds exactly this draft. */
function matchingAgents(agentIds: readonly string[], prompt: string): string[] {
  const client = getClient();
  if (!client) return [];
  const out: string[] = [];
  for (const agentId of agentIds) {
    const [composer] = client.composers({ agentId });
    if (composer && composer.prompt === prompt) out.push(agentId);
    if (out.length >= MAX_AGENT_CANDIDATES) break;
  }
  return out;
}

/** The restore entry of the agent whose live draft is this composer's draft. */
function restoreFor(prompt: string): { agentId: string; entry: RestoreEntry } | null {
  const client = getClient();
  if (!client) return null;
  for (const [agentId, entry] of restoreEntries()) {
    const [composer] = client.composers({ agentId });
    if (composer && composer.prompt === prompt) return { agentId, entry };
  }
  return null;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Cyan, indigo and violet wedges turning behind the button: the busy ring. */
function BusyRing({ busy, size }: { busy: boolean; size: number }) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!busy || reduced) {
      spin.stopAnimation();
      spin.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1_600,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, reduced, spin]);

  if (!busy) return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const span = size * 1.5;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: span,
        height: span,
        left: (size - span) / 2,
        top: (size - span) / 2,
        borderWidth: span / 2,
        borderTopColor: "rgba(99, 102, 241, 0.55)",
        borderRightColor: "rgba(168, 85, 247, 0.4)",
        borderBottomColor: "transparent",
        borderLeftColor: "rgba(56, 189, 248, 0.35)",
        opacity: reduced ? 0.45 : 0.72,
        transform: [{ rotate }],
      }}
    />
  );
}

// `composers({ agentId })` only resolves agents on this composer's host, so other hosts drop out.
const openAgents = { where: (agent: { status: string }) => agent.status !== "closed" };

/** Last pre-start request, shared by every composer in this window. */
let lastWarmAt = 0;

export function EnhanceButton({ theme, layout }: PluginComposerItemProps) {
  const metrics = layout.platform === "web" ? POINTER : TOUCH;
  const SIZE = metrics.size;
  const composer = useComposer();
  const enhance = useRpc(enhanceRpc);
  const warm = useRpc(warmRpc);
  const warmRef = useRef(warm);
  warmRef.current = warm;
  const { t } = useTranslation(messages);

  const agentRefs = useAgents(openAgents);
  const agentIds = useMemo(() => agentRefs.map((ref) => ref.id), [agentRefs]);
  const agentIdsRef = useRef(agentIds);
  agentIdsRef.current = agentIds;

  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<Level>("idle");
  const [status, setStatus] = useState("");
  const [hovered, setHovered] = useState(false);
  const [pendingCopy, setPendingCopy] = useState("");
  const lock = useRef(false);
  const composerRef = useRef(composer);
  composerRef.current = composer;
  const levelRef = useRef(level);
  levelRef.current = level;
  /** Agent of the last restore entry shown here; an empty draft cannot be matched to its agent. */
  const restoreAgentRef = useRef<string | null>(null);

  useSyncExternalStore(subscribeRestore, restoreVersion, restoreVersion);

  const prompt = composer.prompt;
  const empty = prompt.trim().length === 0;
  const supported = composer.context === "agent";

  // Finished statuses clear on their own; busy stays.
  useEffect(() => {
    if (level !== "ok" && level !== "error") return undefined;
    const timer = setTimeout(() => {
      setLevel("idle");
      setStatus("");
    }, STATUS_CLEAR_MS[level]);
    return () => clearTimeout(timer);
  }, [level, status]);

  // Start bce-tool once typing begins, so the first click skips npx and the MCP handshake.
  // Paseo startup does nothing; the daemon ignores this while another bce-tool is busy.
  useEffect(() => {
    if (empty || !supported || Date.now() - lastWarmAt < WARM_THROTTLE_MS) return undefined;
    const timer = setTimeout(() => {
      if (lock.current || Date.now() - lastWarmAt < WARM_THROTTLE_MS) return;
      lastWarmAt = Date.now();
      const agentIdsNow = matchingAgents(agentIdsRef.current, composerRef.current.prompt);
      warmRef.current({ agentIds: agentIdsNow }).catch(() => undefined);
    }, WARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [empty, supported]);

  // Editing the draft dismisses an error at once.
  useEffect(() => {
    if (levelRef.current !== "error") return;
    setLevel("idle");
    setStatus("");
    setPendingCopy("");
  }, [prompt]);

  const announce = (next: Level, key: MessageKey) => {
    setLevel(next);
    setStatus(t(key));
  };

  const onPress = async () => {
    if (lock.current) return;
    const raw = composerRef.current.prompt;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    if (composerRef.current.context !== "agent") {
      announce("error", "unsupportedContext");
      return;
    }
    const matched = matchingAgents(agentIds, raw);
    if (matched.length === 0) {
      announce("error", "noWorkspace");
      return;
    }

    lock.current = true;
    setBusy(true);
    setPendingCopy("");
    announce("busy", "enhancing");
    try {
      let result: Awaited<ReturnType<typeof enhance>>;
      try {
        result = await enhance({ prompt: trimmed, agentIds: matched });
      } catch (error) {
        console.error("[dsh-bce] enhance RPC failed", error);
        announce("error", "noRpc");
        return;
      }
      if (!result.ok) {
        if (result.code === "launch_failed" || result.code === "upstream" || result.code === "index_failed") {
          console.error(`[dsh-bce] ${result.code}: ${result.message}`);
        }
        announce("error", messageKeyFor(result.code));
        return;
      }

      const [live] = getClient()?.composers({ agentId: matched[0] }) ?? [];
      const current = live?.prompt ?? composerRef.current.prompt;
      if (current.trim() !== trimmed) {
        setPendingCopy(result.text);
        announce("error", "draftChanged");
        return;
      }
      try {
        composerRef.current.setPrompt(result.text);
      } catch (error) {
        console.error("[dsh-bce] setPrompt failed", error);
        setPendingCopy(result.text);
        announce("error", "writeFailed");
        return;
      }
      rememberEnhancement(matched[0], trimmed, result.text);
      announce("ok", result.warning === "no_index" ? "noIndex" : "done");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const onRestore = (agentId: string, entry: RestoreEntry) => {
    try {
      composerRef.current.setPrompt(entry.original);
      forgetRestore(agentId);
      restoreAgentRef.current = null;
      setLevel("idle");
      setStatus("");
    } catch (error) {
      console.error("[dsh-bce] restore failed", error);
      announce("error", "writeFailed");
    }
  };

  const onCopy = async () => {
    try {
      await copyText(pendingCopy);
      setPendingCopy("");
      announce("ok", "copied");
    } catch {
      announce("error", "copyFailed");
    }
  };

  const restore = !busy && !empty ? restoreFor(prompt) : null;
  if (restore !== null) restoreAgentRef.current = restore.agentId;

  // Clearing the draft ends the enhancement chain, so Restore does not follow new text.
  useEffect(() => {
    if (!empty || busy || restoreAgentRef.current === null) return;
    forgetRestore(restoreAgentRef.current);
    restoreAgentRef.current = null;
  }, [empty, busy]);
  const showRestore = restore !== null && prompt.trim() !== restore.entry.original;

  const blocked = empty || !supported;
  const hint = empty ? t("empty") : !supported ? t("unsupportedContext") : t("label");
  const shownStatus = status.length > 0 ? status : hovered && !busy ? hint : "";
  const statusColor = level === "busy"
    ? BUSY_TEXT
    : level === "error"
      ? theme.colors.statusDanger
      : level === "ok"
        ? theme.colors.statusSuccess
        : theme.colors.foregroundMuted;
  // Pointer glyphs rest muted and brighten on hover; touch glyphs rest at foreground.
  const restColor = layout.platform === "web" ? theme.colors.foregroundMuted : theme.colors.foreground;
  const iconColor = busy ? BUSY_COLOR : hovered && !blocked ? theme.colors.foreground : restColor;
  // Like the built-in controls: no fill at rest, a round highlight on hover, a solid disc while busy.
  const background = busy ? theme.colors.surface2 : hovered && !blocked ? theme.colors.surface2 : "transparent";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: SIZE, maxWidth: 280 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hint}
        accessibilityState={{ disabled: blocked || busy, busy }}
        onPress={() => void onPress()}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => ({
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          overflow: "hidden",
          opacity: blocked && !busy ? 0.45 : 1,
          transform: [{ scale: pressed && !blocked && !busy ? 0.96 : 1 }],
        })}
      >
        <BusyRing busy={busy} size={SIZE} />
        <View
          style={{
            position: "absolute",
            top: busy ? RING_WIDTH : 0,
            left: busy ? RING_WIDTH : 0,
            right: busy ? RING_WIDTH : 0,
            bottom: busy ? RING_WIDTH : 0,
            borderRadius: SIZE / 2,
            backgroundColor: background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={{ svg: enhanceIconSvg }} size={metrics.icon} color={iconColor} />
        </View>
      </Pressable>
      {shownStatus.length > 0 ? (
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, maxWidth: 148, fontSize: 11, lineHeight: 13, color: statusColor }}
        >
          {shownStatus}
        </Text>
      ) : null}
      {showRestore && restore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("restore")}
          onPress={() => onRestore(restore.agentId, restore.entry)}
          style={({ pressed }) => ({
            height: SIZE,
            paddingHorizontal: 8,
            borderRadius: TEXT_RADIUS,
            justifyContent: "center",
            backgroundColor: pressed ? theme.colors.surface2 : "transparent",
          })}
        >
          <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{t("restore")}</Text>
        </Pressable>
      ) : null}
      {pendingCopy.length > 0 && !busy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("copy")}
          onPress={() => void onCopy()}
          style={({ pressed }) => ({
            height: SIZE,
            paddingHorizontal: 8,
            borderRadius: TEXT_RADIUS,
            justifyContent: "center",
            backgroundColor: pressed ? theme.colors.surface2 : "transparent",
          })}
        >
          <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{t("copy")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
