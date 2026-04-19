import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { OpencodeCommandCatalog } from '../commands/OpencodeCommandCatalog';
import { OpencodeCliResolver } from '../runtime/OpencodeCliResolver';
import { opencodeSettingsTabRenderer } from '../ui/OpencodeSettingsTab';

export interface OpencodeWorkspaceServices extends ProviderWorkspaceServices {
  commandCatalog: ProviderCommandCatalog;
}

export async function createOpencodeWorkspaceServices(): Promise<OpencodeWorkspaceServices> {
  return {
    commandCatalog: new OpencodeCommandCatalog(),
    cliResolver: new OpencodeCliResolver(),
    settingsTabRenderer: opencodeSettingsTabRenderer,
  };
}

export const opencodeWorkspaceRegistration: ProviderWorkspaceRegistration<OpencodeWorkspaceServices> = {
  initialize: async () => createOpencodeWorkspaceServices(),
};

export function maybeGetOpencodeWorkspaceServices(): OpencodeWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('opencode') as OpencodeWorkspaceServices | null;
}
