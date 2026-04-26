import { McpServerManager } from '../../../core/mcp/McpServerManager';
import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { OpencodeAgentMentionProvider } from '../agents/OpencodeAgentMentionProvider';
import { OpencodeCommandCatalog } from '../commands/OpencodeCommandCatalog';
import { loadManagedOpencodeMcpServers } from '../mcp/configuredMcp';
import { OpencodeCliResolver } from '../runtime/OpencodeCliResolver';
import { OpencodeAgentStorage } from '../storage/OpencodeAgentStorage';
import { opencodeSettingsTabRenderer } from '../ui/OpencodeSettingsTab';
import { OpencodeRuntimeCommandLoader } from './OpencodeRuntimeCommandLoader';

export interface OpencodeWorkspaceServices extends ProviderWorkspaceServices {
  agentStorage: OpencodeAgentStorage;
  agentMentionProvider: OpencodeAgentMentionProvider;
  commandCatalog: ProviderCommandCatalog;
  mcpManager: McpServerManager;
}

const opencodeTabWarmupPolicy: ProviderTabWarmupPolicy = {
  resolveMode() {
    return 'commands';
  },
};

export async function createOpencodeWorkspaceServices(
  plugin: ClaudianPlugin,
  vaultAdapter: VaultFileAdapter,
): Promise<OpencodeWorkspaceServices> {
  const agentStorage = new OpencodeAgentStorage(vaultAdapter);
  const agentMentionProvider = new OpencodeAgentMentionProvider(agentStorage);
  await agentMentionProvider.loadAgents();
  const mcpManager = new McpServerManager({
    load: async () => loadManagedOpencodeMcpServers(
      plugin.settings as unknown as Record<string, unknown>,
      getVaultPath(plugin.app),
    ),
  });
  await mcpManager.loadServers();

  return {
    agentStorage,
    agentMentionProvider,
    commandCatalog: new OpencodeCommandCatalog(),
    cliResolver: new OpencodeCliResolver(),
    mcpManager,
    mcpServerManager: mcpManager,
    runtimeCommandLoader: new OpencodeRuntimeCommandLoader(),
    settingsTabRenderer: opencodeSettingsTabRenderer,
    tabWarmupPolicy: opencodeTabWarmupPolicy,
    refreshAgentMentions: async () => {
      await agentMentionProvider.loadAgents();
    },
  };
}

export const opencodeWorkspaceRegistration: ProviderWorkspaceRegistration<OpencodeWorkspaceServices> = {
  initialize: async ({ plugin, vaultAdapter }) => createOpencodeWorkspaceServices(plugin, vaultAdapter),
};

export function maybeGetOpencodeWorkspaceServices(): OpencodeWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('opencode') as OpencodeWorkspaceServices | null;
}
