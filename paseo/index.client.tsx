import type { PluginClientContext } from "@getpaseo/plugin/client";
import { setClient } from "./client/context";
import { EnhanceButton } from "./client/enhance-button";
import { enhanceIconSvg } from "./client/icon";
import { messages } from "./client/messages";
import { clearRestore } from "./client/restore-store";
import { BceSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  setClient(client);
  const removeItem = client.addComposerItem({ id: "enhance", Component: EnhanceButton });
  const removeSettings = client.addSettingsScreen({
    id: "bce",
    title: messages.message("settingsTitle"),
    icon: { svg: enhanceIconSvg },
    Component: BceSettingsScreen,
  });
  return () => {
    removeItem();
    removeSettings();
    clearRestore();
    setClient(null);
  };
}
