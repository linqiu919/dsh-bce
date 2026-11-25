import type { PluginServerContext } from "@getpaseo/plugin/server";
import { BceService } from "./server/service";
import { bceSettings, detectRpc, enhanceRpc } from "./shared/enhance";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(bceSettings);
  const service = new BceService(settings);
  const unsubscribe = settings.subscribe(() => service.reset());

  server.handle(enhanceRpc, (input, { paseo }) => service.enhance(input, paseo));
  server.handle(detectRpc, () => service.detect());

  return async () => {
    unsubscribe();
    await service.dispose();
  };
}
