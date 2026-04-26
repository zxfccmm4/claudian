import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getRuntimeEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { ProviderUIOption } from '../../core/providers/types';
import { getCodexProviderSettings } from './settings';
import {
  DEFAULT_CODEX_MODEL_SET,
  DEFAULT_CODEX_MODELS,
  DEFAULT_CODEX_PRIMARY_MODEL,
  formatCodexModelLabel,
} from './types/models';

function createCustomCodexModelOption(modelId: string, description: string): ProviderUIOption {
  return {
    value: modelId,
    label: formatCodexModelLabel(modelId),
    description,
  };
}

function getConfiguredEnvModel(settings: Record<string, unknown>): string | null {
  const modelId = getRuntimeEnvironmentVariables(settings, 'codex').OPENAI_MODEL?.trim();
  return modelId ? modelId : null;
}

export function getConfiguredEnvCustomModel(settings: Record<string, unknown>): string | null {
  const modelId = getConfiguredEnvModel(settings);
  return modelId && !DEFAULT_CODEX_MODEL_SET.has(modelId) ? modelId : null;
}

export function parseConfiguredCustomModelIds(value: string): string[] {
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

export function readCodexConfiguredModelOptions(): ProviderUIOption[] {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    if (!fs.existsSync(configPath)) {
      return [];
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const models: ProviderUIOption[] = [];
    const seen = new Set<string>();
    for (const match of content.matchAll(/^(?:model|review_model)\s*=\s*"([^"]+)"/gm)) {
      const value = match[1]?.trim() ?? '';
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      models.push({
        value,
        label: formatCodexModelLabel(value),
        description: 'Configured in ~/.codex/config.toml',
      });
    }

    return models;
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

export function getCodexModelOptions(settings: Record<string, unknown>): ProviderUIOption[] {
  const models = [...DEFAULT_CODEX_MODELS];
  const seenValues = new Set(models.map(model => model.value));
  const configuredModels = readCodexConfiguredModelOptions();

  const envModel = getConfiguredEnvCustomModel(settings);
  if (envModel) {
    seenValues.add(envModel);
    models.unshift(createCustomCodexModelOption(envModel, 'Custom (env)'));
  }

  const codexSettings = getCodexProviderSettings(settings);
  for (const modelId of parseConfiguredCustomModelIds(codexSettings.customModels)) {
    if (seenValues.has(modelId)) {
      continue;
    }

    seenValues.add(modelId);
    models.push(createCustomCodexModelOption(modelId, 'Custom model'));
  }

  return mergeUniqueModelOptions(configuredModels, models);
}

export function resolveCodexModelSelection(
  settings: Record<string, unknown>,
  currentModel: string,
): string | null {
  const envModel = getConfiguredEnvModel(settings);
  if (envModel) {
    return envModel;
  }

  const configuredModels = readCodexConfiguredModelOptions();
  if (configuredModels.length > 0) {
    return configuredModels[0].value;
  }

  const modelOptions = getCodexModelOptions(settings);
  if (currentModel && modelOptions.some(option => option.value === currentModel)) {
    return currentModel;
  }

  return modelOptions[0]?.value ?? DEFAULT_CODEX_PRIMARY_MODEL;
}
