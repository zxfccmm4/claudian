import type {
  AcpModelInfo,
  AcpSessionConfigOption,
  AcpSessionConfigSelectGroup,
  AcpSessionConfigSelectOption,
  AcpSessionConfigSelectOptions,
  AcpSessionMode,
  AcpSessionModelState,
  AcpSessionModeState,
} from './types';

export interface AcpResolvedSessionModelState {
  availableModels: AcpModelInfo[];
  currentModelId: string | null;
}

export interface AcpResolvedSessionModeState {
  availableModes: AcpSessionMode[];
  currentModeId: string | null;
}

export function flattenAcpSessionConfigSelectOptions(
  options: AcpSessionConfigSelectOptions,
): AcpSessionConfigSelectOption[] {
  if (options.length === 0) {
    return [];
  }

  const first = options[0];
  if (isSelectGroup(first)) {
    return (options as AcpSessionConfigSelectGroup[]).flatMap((group) => group.options);
  }

  return options as AcpSessionConfigSelectOption[];
}

export function extractAcpSessionModelState(params: {
  configOptions?: AcpSessionConfigOption[] | null;
  models?: AcpSessionModelState | null;
}): AcpResolvedSessionModelState {
  const modelOption = findSessionConfigSelectOption(params.configOptions, 'model');
  const configModels = modelOption
    ? flattenAcpSessionConfigSelectOptions(modelOption.options).map((option) => ({
      ...(option.description ? { description: option.description } : {}),
      id: option.value,
      name: option.name,
    }))
    : [];
  if (modelOption && configModels.length > 0) {
    return {
      availableModels: configModels,
      currentModelId: modelOption.currentValue,
    };
  }

  return {
    availableModels: params.models?.availableModels ?? [],
    currentModelId: params.models?.currentModelId ?? modelOption?.currentValue ?? null,
  };
}

export function extractAcpSessionModeState(params: {
  configOptions?: AcpSessionConfigOption[] | null;
  modes?: AcpSessionModeState | null;
}): AcpResolvedSessionModeState {
  const modeOption = findSessionConfigSelectOption(params.configOptions, 'mode');
  const configModes = modeOption
    ? flattenAcpSessionConfigSelectOptions(modeOption.options).map((option) => ({
      ...(option.description ? { description: option.description } : {}),
      id: option.value,
      name: option.name,
    }))
    : [];
  if (modeOption && configModes.length > 0) {
    return {
      availableModes: configModes,
      currentModeId: modeOption.currentValue,
    };
  }

  return {
    availableModes: params.modes?.availableModes ?? [],
    currentModeId: params.modes?.currentModeId ?? modeOption?.currentValue ?? null,
  };
}

function findSessionConfigSelectOption(
  configOptions: AcpSessionConfigOption[] | null | undefined,
  category: 'model' | 'mode',
): Extract<AcpSessionConfigOption, { type: 'select' }> | null {
  const categoryMatch = configOptions?.find((option) => (
    option.type === 'select'
    && normalizeComparableKey(option.category) === category
  ));
  if (categoryMatch?.type === 'select') {
    return categoryMatch;
  }

  const legacyIdMatch = configOptions?.find((option) => (
    option.type === 'select'
    && normalizeComparableKey(option.id) === category
  ));
  return legacyIdMatch?.type === 'select' ? legacyIdMatch : null;
}

function isSelectGroup(
  option: AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup,
): option is AcpSessionConfigSelectGroup {
  return 'options' in option;
}

function normalizeComparableKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
