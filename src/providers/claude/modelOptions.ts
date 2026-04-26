import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getRuntimeEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { ProviderUIOption } from '../../core/providers/types';
import { getModelsFromEnvironment } from './env/claudeModelEnv';
import { formatCustomModelLabel } from './modelLabels';
import { getClaudeProviderSettings } from './settings';
import { DEFAULT_CLAUDE_MODELS, filterVisibleModelOptions } from './types/models';

function parseConfiguredCustomModelIds(value: string): string[] {
  const modelIds: string[] = [];
  const seen = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const modelId = line.trim();
    if (!modelId || seen.has(modelId)) {
      continue;
    }
    seen.add(modelId);
    modelIds.push(modelId);
  }

  return modelIds;
}

export function readClaudeConfiguredModelOptions(settings: Record<string, unknown>): ProviderUIOption[] {
  const claudeSettings = getClaudeProviderSettings(settings);
  if (!claudeSettings.loadUserSettings) {
    return [];
  }

  try {
    const configPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(configPath)) {
      return [];
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { env?: Record<string, unknown> };
    const envVars = parsed.env && typeof parsed.env === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.env)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => [key, value as string]),
        )
      : {};

    return getModelsFromEnvironment(envVars).map((model) => ({
      ...model,
      description: 'Configured in ~/.claude/settings.json',
    }));
  } catch {
    return [];
  }
}

function mergeUniqueModelOptions(...lists: ProviderUIOption[][]): ProviderUIOption[] {
  const seen = new Set<string>();
  const merged: ProviderUIOption[] = [];

  for (const list of lists) {
    for (const model of list) {
      if (!model?.value?.trim() || seen.has(model.value)) {
        continue;
      }
      seen.add(model.value);
      merged.push(model);
    }
  }

  return merged;
}

export function mergeUniqueModelLists(...lists: ProviderUIOption[][]): ProviderUIOption[] {
  return mergeUniqueModelOptions(...lists);
}

export function getClaudeModelOptions(settings: Record<string, unknown>): ProviderUIOption[] {
  const envModels = getModelsFromEnvironment(
    getRuntimeEnvironmentVariables(settings, 'claude'),
  );
  const claudeSettings = getClaudeProviderSettings(settings);
  const configuredModels = readClaudeConfiguredModelOptions(settings);
  const models = filterVisibleModelOptions(
    [...DEFAULT_CLAUDE_MODELS],
    claudeSettings.enableOpus1M,
    claudeSettings.enableSonnet1M,
  );

  const seenValues = new Set(models.map(model => model.value));
  for (const modelId of parseConfiguredCustomModelIds(claudeSettings.customModels)) {
    if (seenValues.has(modelId)) {
      continue;
    }

    seenValues.add(modelId);
    models.push({
      value: modelId,
      label: formatCustomModelLabel(modelId),
      description: 'Custom model',
    });
  }

  return mergeUniqueModelOptions(envModels, configuredModels, models);
}

export function resolveClaudeModelSelection(
  settings: Record<string, unknown>,
  currentModel: string,
): string | null {
  const modelOptions = getClaudeModelOptions(settings);
  const configuredModels = readClaudeConfiguredModelOptions(settings);
  const currentIsDefaultAlias = DEFAULT_CLAUDE_MODELS.some((model) => model.value === currentModel);
  if (configuredModels.length > 0 && currentIsDefaultAlias) {
    return configuredModels[0].value;
  }
  if (currentModel && modelOptions.some(option => option.value === currentModel)) {
    return currentModel;
  }

  const lastModel = getClaudeProviderSettings(settings).lastModel;
  const lastIsDefaultAlias = DEFAULT_CLAUDE_MODELS.some((model) => model.value === lastModel);
  if (configuredModels.length > 0 && lastIsDefaultAlias) {
    return configuredModels[0].value;
  }
  if (lastModel && modelOptions.some(option => option.value === lastModel)) {
    return lastModel;
  }

  return modelOptions[0]?.value ?? null;
}
