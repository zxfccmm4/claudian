import type {
  ProviderRuntimeCommandLoader,
  ProviderRuntimeCommandLoaderContext,
} from '../../../core/providers/types';
import { OpencodeChatRuntime } from '../runtime/OpencodeChatRuntime';
import { getOpencodeProviderSettings } from '../settings';

export class OpencodeRuntimeCommandLoader implements ProviderRuntimeCommandLoader {
  isAvailable(settings: Record<string, unknown>): boolean {
    return getOpencodeProviderSettings(settings).enabled;
  }

  async loadCommands(context: ProviderRuntimeCommandLoaderContext) {
    const runtime = context.runtime?.providerId === 'opencode'
      ? context.runtime
      : new OpencodeChatRuntime(context.plugin);

    try {
      if (context.conversation) {
        runtime.syncConversationState(context.conversation, context.externalContextPaths);
      }

      const ready = runtime.isReady()
        ? true
        : await runtime.ensureReady();
      if (!ready) {
        return [];
      }

      return await runtime.getSupportedCommands();
    } finally {
      if (runtime !== context.runtime) {
        runtime.cleanup();
      }
    }
  }
}
