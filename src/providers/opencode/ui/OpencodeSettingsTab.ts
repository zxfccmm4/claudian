import * as fs from 'fs';
import * as os from 'node:os';
import { Notice, Setting } from 'obsidian';

import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import type { McpServerConfig } from '../../../core/types/mcp';
import { getMcpServerType } from '../../../core/types/mcp';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath, getVaultPath } from '../../../utils/path';
import { maybeGetOpencodeWorkspaceServices } from '../app/OpencodeWorkspaceServices';
import { clearOpencodeDiscoveryState } from '../discoveryState';
import { sameStringList } from '../internal/compareCollections';
import {
  type OpencodeConfiguredMcpOverview,
  type OpencodeConfiguredMcpServer,
  loadOpencodeConfiguredMcpOverview,
} from '../mcp/configuredMcp';
import {
  buildOpencodeBaseModels,
  type OpencodeDiscoveredModel,
  splitOpencodeModelLabel,
} from '../models';
import {
  getOpencodeProviderSettings,
  normalizeOpencodeVisibleModels,
  OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES,
  type OpencodeProviderSettings,
  updateOpencodeProviderSettings,
} from '../settings';
import { OpencodeAgentSettings } from './OpencodeAgentSettings';

const ALL_PROVIDERS_KEY = 'all';

interface EnrichedModel {
  description: string;
  isAvailable: boolean;
  modelLabel: string;
  providerKey: string;
  providerLabel: string;
  rawId: string;
}

export const opencodeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const opencodeWorkspace = maybeGetOpencodeWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const opencodeSettings = getOpencodeProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();
    const vaultPath = context.plugin.app ? getVaultPath(context.plugin.app) : null;
    let commandOverviewSummaryEl: HTMLElement | null = null;
    let commandOverviewBodyEl: HTMLElement | null = null;
    let mcpOverviewSummaryEl: HTMLElement | null = null;
    let mcpOverviewBodyEl: HTMLElement | null = null;

    new Setting(container).setName('Setup').setHeading();

    new Setting(container)
      .setName('Enable OpenCode')
      .setDesc('Launch `opencode acp` as a provider.')
      .addToggle((toggle) =>
        toggle
          .setValue(opencodeSettings.enabled)
          .onChange(async (value) => {
            updateOpencodeProviderSettings(settingsBag, { enabled: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    const cliPathSetting = new Setting(container)
      .setName(`CLI Path (${hostnameKey})`)
      .setDesc('Optional absolute path to the OpenCode CLI for this computer. Leave empty to use `opencode` from PATH.');

    const validationEl = container.createDiv({ cls: 'claudian-cli-path-validation' });
    validationEl.style.color = 'var(--text-error)';
    validationEl.style.fontSize = '0.85em';
    validationEl.style.marginTop = '-0.5em';
    validationEl.style.marginBottom = '0.5em';
    validationEl.style.display = 'none';

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const expandedPath = expandHomePath(trimmed);
      if (!fs.existsSync(expandedPath)) {
        return 'Path does not exist';
      }

      const stat = fs.statSync(expandedPath);
      if (!stat.isFile()) {
        return 'Path must point to a file';
      }

      return null;
    };

    const updateCliPathValidation = (value: string, inputEl?: HTMLInputElement): boolean => {
      const error = validatePath(value);
      if (error) {
        validationEl.setText(error);
        validationEl.style.display = 'block';
        if (inputEl) {
          inputEl.style.borderColor = 'var(--text-error)';
        }
        return false;
      }

      validationEl.style.display = 'none';
      if (inputEl) {
        inputEl.style.borderColor = '';
      }
      return true;
    };

    const cliPathsByHost = { ...opencodeSettings.cliPathsByHost };
    const currentValue = opencodeSettings.cliPathsByHost[hostnameKey] || '';
    let cliPathInputEl: HTMLInputElement | null = null;

    const persistCliPath = async (value: string): Promise<boolean> => {
      const isValid = updateCliPathValidation(value, cliPathInputEl ?? undefined);
      if (!isValid) {
        return false;
      }

      const trimmed = value.trim();
      if (trimmed) {
        cliPathsByHost[hostnameKey] = trimmed;
      } else {
        delete cliPathsByHost[hostnameKey];
      }

      updateOpencodeProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      clearOpencodeDiscoveryState(settingsBag);
      await context.plugin.saveSettings();
      opencodeWorkspace?.cliResolver?.reset();
      await recycleOpencodeRuntime();
      return true;
    };

    const recycleOpencodeRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('opencode', (service) => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(
            (service) => Promise.resolve(service.cleanup()),
          );
        }
        view.invalidateProviderCommandCaches?.(['opencode']);
        view.refreshModelSelector?.();
      }
    };

    cliPathSetting.addText((text) => {
      text
        .setPlaceholder(process.platform === 'win32'
          ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd'
          : '/usr/local/bin/opencode')
        .setValue(currentValue)
        .onChange(async (value) => {
          await persistCliPath(value);
        });

      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;

      updateCliPathValidation(currentValue, text.inputEl);
    });

    const refreshOpenCodeOverviews = async (): Promise<void> => {
      if (commandOverviewSummaryEl && commandOverviewBodyEl) {
        await renderOpencodeCommandOverview(
          commandOverviewSummaryEl,
          commandOverviewBodyEl,
          opencodeWorkspace?.commandCatalog,
        );
      }

      if (mcpOverviewSummaryEl && mcpOverviewBodyEl) {
        await renderOpencodeMcpOverview(
          mcpOverviewSummaryEl,
          mcpOverviewBodyEl,
          settingsBag,
          vaultPath,
        );
      }
    };

    const environmentSetting = new Setting(container)
      .setName('Current environment models')
      .setDesc('Start a short-lived OpenCode ACP session to refresh detected models, modes, and runtime slash commands from the current environment.')
      .addButton((button) => button.setButtonText('Sync now').onClick(async () => {
        const loader = opencodeWorkspace?.runtimeCommandLoader;
        const catalog = opencodeWorkspace?.commandCatalog;
        if (!loader || !catalog) {
          new Notice('OpenCode runtime discovery is not available.');
          return;
        }

        button.setDisabled(true);
        try {
          const commands = await loader.loadCommands({
            allowSessionCreation: true,
            conversation: null,
            externalContextPaths: [],
            plugin: context.plugin,
            runtime: null,
          });
          catalog.setRuntimeCommands(commands);

          const latest = getOpencodeProviderSettings(settingsBag);
          renderAll();
          context.refreshModelSelectors();
          for (const view of context.plugin.getAllViews()) {
            view.invalidateProviderCommandCaches?.(['opencode']);
          }
          await refreshOpenCodeOverviews();

          const summary = buildEnvironmentDiscoverySummary(
            latest,
            commands.map((command) => command.kind === 'skill' ? 'skill' : 'command'),
          );
          environmentStatus.setText(`Detected now: ${summary}`);
          new Notice(`OpenCode refreshed: ${summary}`);
        } finally {
          button.setDisabled(false);
        }
      }));
    const environmentStatus = environmentSetting.descEl.createDiv({ cls: 'claudian-sp-settings-desc' });
    void refreshEnvironmentStatus(
      environmentStatus,
      getOpencodeProviderSettings(settingsBag),
      opencodeWorkspace?.commandCatalog,
    );

    new Setting(container).setName('Models').setHeading();

    new Setting(container)
      .setName('Visible Models')
      .setDesc('Choose which OpenCode models appear in the chat selector. Filter by provider or type to search. The current session model stays pinned even if it is not selected here.');

    const pickerEl = container.createDiv({ cls: 'claudian-opencode-model-picker' });

    let searchQuery = '';
    let providerFilter = ALL_PROVIDERS_KEY;

    const summaryEl = pickerEl.createDiv({ cls: 'claudian-opencode-model-picker-summary' });
    const selectedEl = pickerEl.createDiv({ cls: 'claudian-opencode-model-picker-selected' });
    const catalogEl = pickerEl.createEl('details', { cls: 'claudian-opencode-model-picker-catalog' });
    catalogEl.open = getOpencodeProviderSettings(settingsBag).visibleModels.length === 0;
    const catalogSummaryEl = catalogEl.createEl('summary', {
      cls: 'claudian-opencode-model-picker-catalog-summary',
    });
    catalogSummaryEl.createSpan({
      cls: 'claudian-opencode-model-picker-catalog-caret',
      text: '▸',
    });
    catalogSummaryEl.createSpan({
      cls: 'claudian-opencode-model-picker-catalog-title',
      text: 'Browse models',
    });
    const catalogSummaryCountEl = catalogSummaryEl.createSpan({
      cls: 'claudian-opencode-model-picker-catalog-count',
    });

    const controlsEl = catalogEl.createDiv({ cls: 'claudian-opencode-model-picker-controls' });

    const searchInput = controlsEl.createEl('input', {
      cls: 'claudian-opencode-model-picker-search',
      type: 'search',
    });
    searchInput.placeholder = 'Filter by model, provider, or id…';
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderList();
    });

    const providerSelectEl = controlsEl.createEl('select', {
      cls: 'claudian-opencode-model-picker-provider',
    });
    providerSelectEl.addEventListener('change', () => {
      providerFilter = providerSelectEl.value;
      renderList();
    });

    const listEl = catalogEl.createDiv({ cls: 'claudian-opencode-model-picker-list' });

    const getEnrichedModels = (): EnrichedModel[] => {
      const current = getOpencodeProviderSettings(settingsBag);
      return buildEnrichedModels(current.discoveredModels, current.visibleModels);
    };

    const filterModels = (models: EnrichedModel[]): EnrichedModel[] => {
      return models.filter((model) => {
        if (providerFilter !== ALL_PROVIDERS_KEY && model.providerKey !== providerFilter) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        return (
          model.rawId.toLowerCase().includes(searchQuery)
          || model.modelLabel.toLowerCase().includes(searchQuery)
          || model.providerLabel.toLowerCase().includes(searchQuery)
          || model.description.toLowerCase().includes(searchQuery)
        );
      });
    };

    const persistVisibleModels = async (visibleModels: string[]): Promise<void> => {
      const currentVisibleModels = getOpencodeProviderSettings(settingsBag).visibleModels;
      const normalized = normalizeOpencodeVisibleModels(
        visibleModels,
        getOpencodeProviderSettings(settingsBag).discoveredModels,
      );
      if (sameStringList(currentVisibleModels, normalized)) {
        return;
      }

      updateOpencodeProviderSettings(settingsBag, { visibleModels: normalized });
      await context.plugin.saveSettings();
      renderAll();
      context.refreshModelSelectors();
    };

    const persistModelAliases = async (modelAliases: Record<string, string>): Promise<void> => {
      updateOpencodeProviderSettings(settingsBag, { modelAliases });
      await context.plugin.saveSettings();
      renderSelected();
      context.refreshModelSelectors();
    };

    const renderSummary = (): void => {
      summaryEl.empty();
      const current = getOpencodeProviderSettings(settingsBag);
      const enriched = getEnrichedModels();
      const providerCount = new Set(enriched.map((model) => model.providerKey)).size;
      const providerWord = providerCount === 1 ? 'provider' : 'providers';

      summaryEl.createSpan({ text: 'Visible: ' });
      summaryEl.createSpan({
        cls: 'claudian-opencode-model-picker-summary-value',
        text: String(current.visibleModels.length),
      });
      summaryEl.createSpan({
        text: ` of ${current.discoveredModels.length} discovered • ${providerCount} ${providerWord}`,
      });

      catalogSummaryCountEl.setText(
        current.discoveredModels.length > 0
          ? `${current.discoveredModels.length} available`
          : 'No models discovered yet',
      );
    };

    const renderSelected = (): void => {
      selectedEl.empty();
      const current = getOpencodeProviderSettings(settingsBag);
      if (current.visibleModels.length === 0) {
        selectedEl.style.display = 'none';
        return;
      }

      selectedEl.style.display = '';
      const enrichedByRawId = new Map(
        getEnrichedModels().map((model) => [model.rawId, model] as const),
      );

      const headerEl = selectedEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-header' });
      headerEl.createEl('span', {
        cls: 'claudian-opencode-model-picker-selected-label',
        text: `Selected (${current.visibleModels.length})`,
      });
      const clearAllBtn = headerEl.createEl('button', {
        cls: 'claudian-opencode-model-picker-selected-clear',
        text: 'Clear all',
      });
      clearAllBtn.setAttribute('aria-label', 'Clear all selected models');
      clearAllBtn.addEventListener('click', () => {
        void persistVisibleModels([]);
      });

      const rowsEl = selectedEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-rows' });

      for (const rawId of current.visibleModels) {
        const enriched = enrichedByRawId.get(rawId);
        const defaultLabel = enriched
          ? `${enriched.providerLabel}/${enriched.modelLabel}`
          : rawId;

        const rowEl = rowsEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-row' });
        if (enriched && !enriched.isAvailable) {
          rowEl.classList.add('claudian-opencode-model-picker-selected-row--unavailable');
        }

        const infoEl = rowEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-info' });
        const titleEl = infoEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-title' });
        if (enriched) {
          titleEl.createEl('span', {
            cls: 'claudian-opencode-model-picker-selected-badge',
            text: enriched.providerLabel,
          });
          titleEl.createEl('span', {
            cls: 'claudian-opencode-model-picker-selected-name',
            text: enriched.modelLabel,
          });
        } else {
          titleEl.createEl('span', {
            cls: 'claudian-opencode-model-picker-selected-name',
            text: rawId,
          });
        }

        if (enriched && !enriched.isAvailable) {
          infoEl.createEl('div', {
            cls: 'claudian-opencode-model-picker-selected-unavailable',
            text: 'Not currently reported by OpenCode',
          });
        }

        infoEl.createEl('div', {
          cls: 'claudian-opencode-model-picker-selected-id',
          text: rawId,
        });

        const controlsEl = rowEl.createDiv({ cls: 'claudian-opencode-model-picker-selected-controls' });
        const aliasInput = controlsEl.createEl('input', {
          cls: 'claudian-opencode-model-picker-selected-alias',
          type: 'text',
        });
        aliasInput.placeholder = defaultLabel;
        aliasInput.value = current.modelAliases[rawId] ?? '';
        aliasInput.setAttribute('aria-label', `Alias for ${defaultLabel}`);
        aliasInput.title = 'Custom label shown in the model selector. Leave empty to use the default.';

        const commitAlias = (): void => {
          const latest = getOpencodeProviderSettings(settingsBag);
          const existing = latest.modelAliases[rawId] ?? '';
          const next = aliasInput.value.trim();
          if (next === existing) {
            aliasInput.value = existing;
            return;
          }

          const nextAliases = { ...latest.modelAliases };
          if (next) {
            nextAliases[rawId] = next;
          } else {
            delete nextAliases[rawId];
          }
          void persistModelAliases(nextAliases);
        };

        aliasInput.addEventListener('blur', commitAlias);
        aliasInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            aliasInput.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            aliasInput.value = getOpencodeProviderSettings(settingsBag).modelAliases[rawId] ?? '';
            aliasInput.blur();
          }
        });

        const removeBtn = controlsEl.createEl('button', {
          cls: 'claudian-opencode-model-picker-selected-remove',
          text: '×',
        });
        removeBtn.setAttribute('aria-label', `Remove ${defaultLabel}`);
        removeBtn.addEventListener('click', () => {
          void persistVisibleModels(current.visibleModels.filter((entry) => entry !== rawId));
        });
      }
    };

    const renderProviderSelect = (): void => {
      const enriched = getEnrichedModels();
      const providers = new Map<string, { count: number; label: string }>();
      for (const model of enriched) {
        const existing = providers.get(model.providerKey);
        if (existing) {
          existing.count += 1;
        } else {
          providers.set(model.providerKey, { count: 1, label: model.providerLabel });
        }
      }

      providerSelectEl.empty();
      providerSelectEl.createEl('option', {
        text: `All providers (${enriched.length})`,
        value: ALL_PROVIDERS_KEY,
      });

      const sortedProviders = Array.from(providers.entries())
        .sort(([, left], [, right]) => left.label.localeCompare(right.label));
      for (const [key, { count, label }] of sortedProviders) {
        providerSelectEl.createEl('option', {
          text: `${label} (${count})`,
          value: key,
        });
      }

      if (providerFilter !== ALL_PROVIDERS_KEY && !providers.has(providerFilter)) {
        providerFilter = ALL_PROVIDERS_KEY;
      }
      providerSelectEl.value = providerFilter;
    };

    const renderList = (): void => {
      listEl.empty();
      const current = getOpencodeProviderSettings(settingsBag);
      const selectedIds = new Set(current.visibleModels);
      const enriched = getEnrichedModels();
      const filtered = filterModels(enriched);

      if (filtered.length === 0) {
        const emptyEl = listEl.createDiv({ cls: 'claudian-opencode-model-picker-empty' });
        emptyEl.setText(enriched.length === 0
          ? 'Start OpenCode once to load its model catalog. Claudian will then let you pick visible models.'
          : 'No models match your filter.');
        return;
      }

      for (const model of filtered) {
        const rowEl = listEl.createEl('label', { cls: 'claudian-opencode-model-picker-row' });
        const isSelected = selectedIds.has(model.rawId);
        if (isSelected) {
          rowEl.classList.add('claudian-opencode-model-picker-row--selected');
        }
        rowEl.title = model.rawId;

        const checkboxEl = rowEl.createEl('input', { type: 'checkbox' });
        checkboxEl.checked = isSelected;
        checkboxEl.addEventListener('change', () => {
          const currentVisibleModels = getOpencodeProviderSettings(settingsBag).visibleModels;
          const next = checkboxEl.checked
            ? [...currentVisibleModels, model.rawId]
            : currentVisibleModels.filter((id) => id !== model.rawId);
          void persistVisibleModels(next);
        });

        const textEl = rowEl.createDiv({ cls: 'claudian-opencode-model-picker-row-text' });

        const headerEl = textEl.createDiv({ cls: 'claudian-opencode-model-picker-row-header' });
        headerEl.createEl('span', {
          cls: 'claudian-opencode-model-picker-row-name',
          text: model.modelLabel,
        });
        const badgeEl = headerEl.createEl('span', {
          cls: 'claudian-opencode-model-picker-row-badge',
          text: model.providerLabel,
        });
        if (!model.isAvailable) {
          badgeEl.classList.add('claudian-opencode-model-picker-row-badge--unavailable');
          badgeEl.setText('Unavailable');
          badgeEl.title = 'Configured model not currently reported by OpenCode';
        }

        textEl.createDiv({
          cls: 'claudian-opencode-model-picker-row-meta',
          text: model.rawId,
        });

        if (model.description) {
          textEl.createDiv({
            cls: 'claudian-opencode-model-picker-row-desc',
            text: model.description,
          });
        }

      }
    };

    const renderAll = (): void => {
      renderSummary();
      renderSelected();
      renderProviderSelect();
      renderList();
    };

    renderAll();

    new Setting(container).setName('Commands and Skills').setHeading();

    const commandsDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    commandsDesc.createEl('p', {
      cls: 'setting-item-description',
      text: 'OpenCode can auto-detect vault-level Claude slash commands from .claude/commands/ and skills from .claude/skills/, .codex/skills/, and .agents/skills/. Manage those entries in the Claude or Codex settings tab. This setting only hides entries from the OpenCode dropdown.',
    });

    const commandsOverviewSection = container.createEl('details', {
      cls: 'claudian-sp-advanced-section',
    });
    commandOverviewSummaryEl = commandsOverviewSection.createEl('summary', {
      cls: 'claudian-sp-advanced-summary',
      text: 'Detected runtime entries',
    });
    commandOverviewBodyEl = commandsOverviewSection.createDiv({
      cls: 'claudian-opencode-overview',
    });
    void renderOpencodeCommandOverview(
      commandOverviewSummaryEl,
      commandOverviewBodyEl,
      opencodeWorkspace?.commandCatalog,
    );

    context.renderHiddenProviderCommandSetting(container, 'opencode', {
      name: 'Hidden Commands and Skills',
      desc: 'Hide specific OpenCode commands and skills from the dropdown. Enter names without the leading slash, one per line.',
      placeholder: 'compact\nreview\nfix',
    });

    new Setting(container).setName('MCP Servers').setHeading();

    const mcpDesc = container.createDiv({ cls: 'claudian-mcp-settings-desc' });
    mcpDesc.createEl('p', {
      cls: 'setting-item-description',
      text: 'OpenCode reads MCP servers from its own config files. Claudian shows detected servers here for inspection, but does not edit or toggle them in-app yet.',
    });

    const mcpOverviewSection = container.createEl('details', {
      cls: 'claudian-sp-advanced-section',
    });
    mcpOverviewSummaryEl = mcpOverviewSection.createEl('summary', {
      cls: 'claudian-sp-advanced-summary',
      text: 'Detected config servers',
    });
    mcpOverviewBodyEl = mcpOverviewSection.createDiv({
      cls: 'claudian-opencode-overview',
    });
    void renderOpencodeMcpOverview(
      mcpOverviewSummaryEl,
      mcpOverviewBodyEl,
      settingsBag,
      vaultPath,
    );

    if (opencodeWorkspace?.agentStorage) {
      new Setting(container).setName('Subagents').setHeading();

      const subagentsDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
      subagentsDesc.createEl('p', {
        cls: 'setting-item-description',
        text: 'Manage vault-level OpenCode subagents from .opencode/agent/ and legacy .opencode/agents/. New entries are saved as subagent-only files and appear in the @mention menu.',
      });

      const subagentsContainer = container.createDiv({ cls: 'claudian-slash-commands-container' });
      new OpencodeAgentSettings(
        subagentsContainer,
        opencodeWorkspace.agentStorage,
        context.plugin.app,
        async () => {
          await opencodeWorkspace.refreshAgentMentions?.();
          await recycleOpencodeRuntime();
        },
      );
    }

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:opencode',
      heading: 'Environment',
      name: 'Environment Variables',
      desc: 'Extra environment variables passed to OpenCode. `OPENCODE_ENABLE_EXA=1` is enabled by default.',
      placeholder: `${OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES}\nOPENCODE_DB=/path/to/opencode.db`,
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'opencode'),
    });
  },
};

function buildEnrichedModels(
  discoveredModels: OpencodeDiscoveredModel[],
  visibleModels: string[],
): EnrichedModel[] {
  const enriched: EnrichedModel[] = [];
  const discoveredIds = new Set<string>();
  const baseModels = buildOpencodeBaseModels(discoveredModels);

  for (const model of baseModels) {
    const { modelLabel, providerLabel } = splitOpencodeModelLabel(model.label || model.rawId);
    discoveredIds.add(model.rawId);
    enriched.push({
      description: model.description ?? '',
      isAvailable: true,
      modelLabel,
      providerKey: providerLabel.toLowerCase(),
      providerLabel,
      rawId: model.rawId,
    });
  }

  for (const rawId of visibleModels) {
    if (discoveredIds.has(rawId)) {
      continue;
    }

    const { modelLabel, providerLabel } = splitOpencodeModelLabel(rawId);
    enriched.push({
      description: '',
      isAvailable: false,
      modelLabel,
      providerKey: providerLabel.toLowerCase(),
      providerLabel,
      rawId,
    });
  }

  return enriched.sort((left, right) => {
    const providerCmp = left.providerLabel.localeCompare(right.providerLabel);
    if (providerCmp !== 0) {
      return providerCmp;
    }
    return left.modelLabel.localeCompare(right.modelLabel);
  });
}

async function refreshEnvironmentStatus(
  target: HTMLElement,
  settings: OpencodeProviderSettings,
  catalog: ProviderCommandCatalog | null | undefined,
): Promise<void> {
  const runtimeEntries = catalog
    ? await catalog.listDropdownEntries({ includeBuiltIns: true })
    : [];
  const commandKinds = runtimeEntries.map((entry) => entry.kind);
  target.setText(`Detected now: ${buildEnvironmentDiscoverySummary(settings, commandKinds)}`);
}

function buildEnvironmentDiscoverySummary(
  settings: OpencodeProviderSettings,
  commandKinds: string[],
): string {
  if (settings.discoveredModels.length === 0 && commandKinds.length === 0) {
    return 'No models or runtime commands detected yet.';
  }

  const enriched = buildEnrichedModels(settings.discoveredModels, settings.visibleModels);
  const providerCount = new Set(enriched.map((model) => model.providerKey)).size;
  const providerWord = providerCount === 1 ? 'provider' : 'providers';
  const modeCount = settings.availableModes.length;
  const modeWord = modeCount === 1 ? 'mode' : 'modes';
  const skillCount = commandKinds.filter((kind) => kind === 'skill').length;
  const commandCount = commandKinds.length - skillCount;
  const skillWord = skillCount === 1 ? 'skill' : 'skills';
  const commandWord = commandCount === 1 ? 'command' : 'commands';

  return [
    `${settings.discoveredModels.length} model(s) across ${providerCount} ${providerWord}`,
    `${modeCount} ${modeWord}`,
    `${commandCount} ${commandWord}`,
    `${skillCount} ${skillWord}`,
  ].join(' • ');
}

async function renderOpencodeCommandOverview(
  summaryEl: HTMLElement,
  bodyEl: HTMLElement,
  catalog: ProviderCommandCatalog | null | undefined,
): Promise<void> {
  bodyEl.empty();

  const entries = catalog
    ? await catalog.listDropdownEntries({ includeBuiltIns: true })
    : [];
  const skillCount = entries.filter((entry) => entry.kind === 'skill').length;
  const commandCount = entries.length - skillCount;

  summaryEl.setText(
    entries.length > 0
      ? `Detected runtime entries (${entries.length})`
      : 'Detected runtime entries',
  );

  if (entries.length === 0) {
    bodyEl.createDiv({
      cls: 'claudian-opencode-overview-empty',
      text: 'Run "Sync now" above or start an OpenCode chat session to populate runtime commands and skills.',
    });
    return;
  }

  bodyEl.createDiv({
    cls: 'claudian-opencode-overview-summary',
    text: `${commandCount} command${commandCount === 1 ? '' : 's'} • ${skillCount} skill${skillCount === 1 ? '' : 's'}`,
  });

  const listEl = bodyEl.createDiv({ cls: 'claudian-opencode-overview-list' });
  const sortedEntries = [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'skill' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  for (const entry of sortedEntries) {
    renderOpencodeCommandOverviewEntry(listEl, entry);
  }
}

async function renderOpencodeMcpOverview(
  summaryEl: HTMLElement,
  bodyEl: HTMLElement,
  settings: Record<string, unknown>,
  vaultPath: string | null,
): Promise<void> {
  bodyEl.empty();

  const overview = await readConfiguredOpencodeMcpOverview(settings, vaultPath);
  summaryEl.setText(
    overview.servers.length > 0
      ? `Detected config servers (${overview.servers.length})`
      : 'Detected config servers',
  );

  if (overview.servers.length === 0) {
    bodyEl.createDiv({
      cls: 'claudian-opencode-overview-empty',
      text: overview.loadedPaths.length > 0
        ? 'Detected OpenCode config files, but none of them currently declare MCP servers.'
        : 'No OpenCode MCP servers detected in project or home config files.',
    });

    if (overview.searchedPaths.length > 0) {
      bodyEl.createDiv({
        cls: 'claudian-opencode-overview-meta',
        text: `Checked: ${overview.searchedPaths.map(shortenDisplayPath).join(' • ')}`,
      });
    }
    return;
  }

  bodyEl.createDiv({
    cls: 'claudian-opencode-overview-summary',
    text: `Loaded from ${overview.loadedPaths.length} config file${overview.loadedPaths.length === 1 ? '' : 's'}. OpenCode continues to manage MCP behavior through those files.`,
  });

  const listEl = bodyEl.createDiv({ cls: 'claudian-opencode-overview-list' });
  for (const server of overview.servers) {
    renderOpencodeMcpOverviewEntry(listEl, server);
  }
}

function renderOpencodeCommandOverviewEntry(
  listEl: HTMLElement,
  entry: ProviderCommandEntry,
): void {
  const itemEl = listEl.createDiv({ cls: 'claudian-sp-item' });
  const infoEl = itemEl.createDiv({ cls: 'claudian-sp-info' });
  const headerEl = infoEl.createDiv({ cls: 'claudian-sp-item-header' });
  headerEl.createEl('span', {
    cls: 'claudian-sp-item-name',
    text: `${entry.displayPrefix}${entry.name}`,
  });
  headerEl.createEl('span', {
    cls: 'claudian-opencode-overview-badge',
    text: entry.kind === 'skill' ? 'Skill' : 'Command',
  });

  if (entry.description) {
    infoEl.createDiv({
      cls: 'claudian-sp-item-desc',
      text: entry.description,
    });
  }

  infoEl.createDiv({
    cls: 'claudian-opencode-overview-meta',
    text: `Runtime • ${entry.source}`,
  });
}

function renderOpencodeMcpOverviewEntry(
  listEl: HTMLElement,
  server: OpencodeConfiguredMcpServer,
): void {
  const itemEl = listEl.createDiv({ cls: 'claudian-sp-item' });
  const infoEl = itemEl.createDiv({ cls: 'claudian-sp-info' });
  const headerEl = infoEl.createDiv({ cls: 'claudian-sp-item-header' });
  headerEl.createEl('span', {
    cls: 'claudian-sp-item-name',
    text: server.name,
  });
  headerEl.createEl('span', {
    cls: 'claudian-opencode-overview-badge',
    text: getMcpServerType(server.config).toUpperCase(),
  });

  infoEl.createDiv({
    cls: 'claudian-sp-item-desc',
    text: describeMcpServerTarget(server.config),
  });
  infoEl.createDiv({
    cls: 'claudian-opencode-overview-meta',
    text: shortenDisplayPath(server.sourcePath),
  });
}

async function readConfiguredOpencodeMcpOverview(
  settings: Record<string, unknown>,
  vaultPath: string | null,
): Promise<OpencodeConfiguredMcpOverview> {
  return loadOpencodeConfiguredMcpOverview(settings, vaultPath);
}

function describeMcpServerTarget(config: McpServerConfig): string {
  if ('command' in config) {
    const args = config.args?.join(' ') ?? '';
    return args ? `${config.command} ${args}` : config.command;
  }

  return config.url;
}

function shortenDisplayPath(fullPath: string): string {
  const home = os.homedir();
  return fullPath.startsWith(home)
    ? `~${fullPath.slice(home.length)}`
    : fullPath;
}
