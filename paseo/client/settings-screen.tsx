import { useRpc, useSettings, useTranslation, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  type SettingsInputHandle,
} from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { bceSettings, detectRpc } from "../shared/enhance";
import { messageKeyFor, messages } from "./messages";

export function BceSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(bceSettings);
  const detect = useRpc(detectRpc);
  const { t } = useTranslation(messages);
  const serverRef = useRef<SettingsInputHandle>(null);
  const commandRef = useRef<SettingsInputHandle>(null);
  const [notice, setNotice] = useState("");
  const [detected, setDetected] = useState("");
  const [detecting, setDetecting] = useState(false);

  const muted = { color: theme.colors.foregroundMuted, fontSize: 13 };

  if (settings.status === "loading") {
    return <Text style={muted}>{t("loading")}</Text>;
  }
  if (settings.status === "error") {
    return <Text style={{ ...muted, color: theme.colors.statusDanger }}>{settings.error}</Text>;
  }

  const values = settings.status === "ready" ? settings.values : { server: "", command: "" };

  const onSave = async () => {
    const next = {
      server: (serverRef.current?.getText() ?? values.server).trim(),
      command: (commandRef.current?.getText() ?? values.command).trim(),
    };
    const ok = await settings.save(next, settings.revision);
    setNotice(ok ? t("saved") : t("saveFailed"));
  };

  const onDetect = async () => {
    setDetecting(true);
    try {
      const result = await detect({});
      setDetected(
        result.ok
          ? `${result.source} · ${result.server}\n${result.command}`
          : `${t(messageKeyFor(result.code))}\n${result.message}`,
      );
    } catch (error) {
      setDetected(error instanceof Error ? error.message : String(error));
    } finally {
      setDetecting(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <SettingsSection title={t("sectionLaunch")}>
        <SettingsCard>
          <SettingsInput
            ref={serverRef}
            label={t("serverLabel")}
            hint={t("serverHint")}
            initialValue={values.server}
            placeholder="bce"
            onChangeText={() => setNotice("")}
          />
          <SettingsInput
            ref={commandRef}
            label={t("commandLabel")}
            hint={t("commandHint")}
            initialValue={values.command}
            placeholder="npx -y bce-tool --base-url … --token …"
            secureTextEntry
            onChangeText={() => setNotice("")}
          />
          <SettingsAction
            label={notice.length > 0 ? notice : t("save")}
            error={settings.saveError}
            actionLabel={t("save")}
            disabled={settings.saving}
            onPress={() => void onSave()}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("sectionDetect")}>
        <SettingsCard>
          <SettingsAction
            label={t("detect")}
            hint={t("detectHint")}
            actionLabel={t("detect")}
            disabled={detecting}
            onPress={() => void onDetect()}
          />
          <SettingsRow label={t("sectionDetect")}>
            <Text selectable style={{ ...muted, fontSize: 12 }}>
              {detected.length > 0 ? detected : t("detectNone")}
            </Text>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
