import {
  TOOL_ASK_USER_QUESTION,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_READ,
  TOOL_SKILL,
  TOOL_TASK,
  TOOL_TODO_WRITE,
  TOOL_WEB_FETCH,
  TOOL_WRITE,
} from '../../../core/tools/toolNames';
import type { AskUserAnswers, AskUserQuestionItem, StreamChunk } from '../../../core/types';
import type { SDKToolUseResult } from '../../../core/types/diff';
import type { AcpToolCall, AcpToolCallUpdate } from '../../acp';

const TOOL_NAME_MAP: Record<string, string> = {
  bash: TOOL_BASH,
  edit: TOOL_EDIT,
  glob: TOOL_GLOB,
  grep: TOOL_GREP,
  question: TOOL_ASK_USER_QUESTION,
  read: TOOL_READ,
  skill: TOOL_SKILL,
  task: TOOL_TASK,
  todowrite: TOOL_TODO_WRITE,
  webfetch: TOOL_WEB_FETCH,
  write: TOOL_WRITE,
};

type OpencodeKnownToolName = keyof typeof TOOL_NAME_MAP;

interface OpencodeToolState {
  input: Record<string, unknown>;
  rawName: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKnownToolName(value: unknown): value is OpencodeKnownToolName {
  if (typeof value !== 'string') {
    return false;
  }

  return value.trim().toLowerCase() in TOOL_NAME_MAP;
}

function toKnownToolName(value: string | undefined): OpencodeKnownToolName | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isKnownToolName(normalized)
    ? normalized as OpencodeKnownToolName
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function firstTrimmedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

function normalizeQuestionOptions(value: unknown): Array<{ description: string; label: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((option) => {
    if (typeof option === 'string') {
      const label = option.trim();
      return label ? [{ description: '', label }] : [];
    }

    if (!isPlainObject(option)) {
      return [];
    }

    const label = typeof option.label === 'string' ? option.label.trim() : '';
    if (!label) {
      return [];
    }

    return [{
      description: typeof option.description === 'string' ? option.description : '',
      label,
    }];
  });
}

function normalizeQuestionItems(value: unknown): AskUserQuestionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const record = isPlainObject(item) ? item : {};
    const question = firstTrimmedString(record.question) ?? `Question ${index + 1}`;
    const header = firstTrimmedString(record.header) ?? `Q${index + 1}`;

    return {
      ...(typeof record.id === 'string' && record.id.trim()
        ? { id: record.id }
        : {}),
      header,
      multiSelect: record.multiSelect === true || record.multi_select === true || record.multiple === true,
      options: normalizeQuestionOptions(record.options),
      question,
    };
  });
}

function normalizeTodoStatus(value: unknown): 'completed' | 'in_progress' | 'pending' {
  switch (value) {
    case 'completed':
    case 'cancelled':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    default:
      return 'pending';
  }
}

function normalizeTodos(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }

    const content = firstTrimmedString(item.content, item.title, item.description);
    if (!content) {
      return [];
    }

    return [{
      activeForm: firstTrimmedString(item.activeForm, item.active_form) ?? content,
      content,
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      status: normalizeTodoStatus(item.status),
    }];
  });
}

function normalizeQuestionAnswers(
  rawAnswers: unknown,
  questions: AskUserQuestionItem[],
): AskUserAnswers | undefined {
  if (!Array.isArray(rawAnswers) || questions.length === 0) {
    return undefined;
  }

  const answers: AskUserAnswers = {};

  for (let index = 0; index < Math.min(rawAnswers.length, questions.length); index += 1) {
    const question = questions[index];
    const rawEntry = rawAnswers[index];
    if (!question) {
      continue;
    }

    const values = Array.isArray(rawEntry)
      ? rawEntry
          .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : typeof rawEntry === 'string' && rawEntry.trim().length > 0
      ? [rawEntry]
      : [];

    if (values.length === 0) {
      continue;
    }

    const normalizedValue = values.length === 1 ? values[0] : values;
    answers[question.question] = normalizedValue;
    if (question.id) {
      answers[question.id] = normalizedValue;
    }
  }

  return Object.keys(answers).length > 0 ? answers : undefined;
}

function extractToolMetadata(rawOutput: unknown): Record<string, unknown> | null {
  if (!isPlainObject(rawOutput)) {
    return null;
  }

  return isPlainObject(rawOutput.metadata) ? rawOutput.metadata : null;
}

function buildToolState(
  rawName: string,
  input: Record<string, unknown>,
): OpencodeToolState {
  return {
    input: normalizeOpencodeToolInput(rawName, input),
    rawName,
  };
}

function updateToolState(
  current: OpencodeToolState | undefined,
  update: {
    kind?: string | null;
    rawInput?: unknown;
    title?: string | null;
  },
): OpencodeToolState {
  const nextRawName = resolveRawToolName(current?.rawName, update.title, update.kind);
  const nextInput = current?.input ?? {};

  if (update.rawInput !== undefined) {
    const rawInput = normalizeRawToolInput(update.rawInput);
    return buildToolState(nextRawName, { ...nextInput, ...rawInput });
  }

  if (nextRawName !== current?.rawName) {
    return buildToolState(nextRawName, nextInput);
  }

  return current ?? buildToolState(nextRawName, {});
}

function resolveRawToolName(
  currentRawName: string | undefined,
  title?: string | null,
  kind?: string | null,
): string {
  const titleName = firstTrimmedString(title);
  const knownTitleName = titleName && isKnownToolName(titleName)
    ? titleName.trim().toLowerCase()
    : undefined;

  if (knownTitleName) {
    return knownTitleName;
  }

  if (currentRawName) {
    return currentRawName;
  }

  switch (kind) {
    case 'execute':
      return 'bash';
    case 'fetch':
      return 'webfetch';
    case 'read':
      return 'read';
    default:
      return titleName ?? 'tool';
  }
}

function normalizeRawToolInput(rawInput: unknown): Record<string, unknown> {
  return isPlainObject(rawInput) ? rawInput : {};
}

function normalizeChunk(
  chunk: StreamChunk,
  state: OpencodeToolState,
  rawOutput?: unknown,
): StreamChunk {
  switch (chunk.type) {
    case 'tool_use':
      return {
        ...chunk,
        input: state.input,
        name: normalizeOpencodeToolName(state.rawName),
      };
    case 'tool_result': {
      const toolUseResult = normalizeOpencodeToolUseResult(state.rawName, state.input, rawOutput);
      return toolUseResult
        ? { ...chunk, toolUseResult }
        : chunk;
    }
    default:
      return chunk;
  }
}

export function normalizeOpencodeToolName(rawName: string | undefined): string {
  const knownName = toKnownToolName(rawName);
  if (!knownName) {
    return rawName?.trim() || 'tool';
  }

  return TOOL_NAME_MAP[knownName];
}

export function normalizeOpencodeToolInput(
  rawName: string | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const knownName = toKnownToolName(rawName);
  switch (knownName) {
    case 'question':
      return { questions: normalizeQuestionItems(input.questions) };
    case 'read':
      return {
        ...(firstString(input.file_path, input.filePath) ? { file_path: firstString(input.file_path, input.filePath) } : {}),
        ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
        ...(typeof input.offset === 'number' ? { offset: input.offset } : {}),
      };
    case 'write':
      return {
        ...(typeof input.content === 'string' ? { content: input.content } : {}),
        ...(firstString(input.file_path, input.filePath) ? { file_path: firstString(input.file_path, input.filePath) } : {}),
      };
    case 'edit':
      return {
        ...(firstString(input.file_path, input.filePath) ? { file_path: firstString(input.file_path, input.filePath) } : {}),
        ...(firstString(input.old_string, input.oldString) ? { old_string: firstString(input.old_string, input.oldString) } : {}),
        ...(firstString(input.new_string, input.newString) ? { new_string: firstString(input.new_string, input.newString) } : {}),
        ...(typeof input.replace_all === 'boolean'
          ? { replace_all: input.replace_all }
          : typeof input.replaceAll === 'boolean'
          ? { replace_all: input.replaceAll }
          : {}),
      };
    case 'task':
      return {
        ...(firstTrimmedString(input.command) ? { command: firstTrimmedString(input.command) } : {}),
        ...(firstTrimmedString(input.description) ? { description: firstTrimmedString(input.description) } : {}),
        ...(firstTrimmedString(input.prompt) ? { prompt: firstTrimmedString(input.prompt) } : {}),
        ...(input.run_in_background === true || input.run_in_background === false
          ? { run_in_background: input.run_in_background }
          : {}),
        ...(firstTrimmedString(input.subagent_type) ? { subagent_type: firstTrimmedString(input.subagent_type) } : {}),
        ...(firstTrimmedString(input.task_id) ? { task_id: firstTrimmedString(input.task_id) } : {}),
      };
    case 'todowrite':
      return { todos: normalizeTodos(input.todos) };
    case 'skill':
      return firstTrimmedString(input.skill, input.name)
        ? { skill: firstTrimmedString(input.skill, input.name) }
        : {};
    default:
      return input;
  }
}

export function normalizeOpencodeToolUseResult(
  rawName: string | undefined,
  input: Record<string, unknown>,
  rawOutput: unknown,
): SDKToolUseResult | undefined {
  const knownName = toKnownToolName(rawName);
  const metadata = extractToolMetadata(rawOutput);
  const normalized: SDKToolUseResult = {};

  if (
    (knownName === 'write' || knownName === 'edit')
    && firstString(input.file_path, input.filePath, metadata?.filepath, metadata?.filePath)
  ) {
    normalized.filePath = firstString(input.file_path, input.filePath, metadata?.filepath, metadata?.filePath);
  }

  if (knownName === 'question') {
    const questions = Array.isArray(input.questions)
      ? input.questions as AskUserQuestionItem[]
      : [];
    const answers = normalizeQuestionAnswers(metadata?.answers, questions);
    if (answers) {
      normalized.answers = answers;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export class OpencodeToolStreamAdapter {
  private readonly toolStates = new Map<string, OpencodeToolState>();

  reset(): void {
    this.toolStates.clear();
  }

  normalizeToolCall(toolCall: AcpToolCall, chunks: StreamChunk[]): StreamChunk[] {
    const state = updateToolState(undefined, {
      kind: toolCall.kind,
      rawInput: toolCall.rawInput,
      title: toolCall.title,
    });
    this.toolStates.set(toolCall.toolCallId, state);
    return chunks.map((chunk) => normalizeChunk(chunk, state, toolCall.rawOutput));
  }

  normalizeToolCallUpdate(toolCallUpdate: AcpToolCallUpdate, chunks: StreamChunk[]): StreamChunk[] {
    const state = updateToolState(this.toolStates.get(toolCallUpdate.toolCallId), {
      kind: toolCallUpdate.kind,
      rawInput: toolCallUpdate.rawInput,
      title: toolCallUpdate.title,
    });
    this.toolStates.set(toolCallUpdate.toolCallId, state);

    const result: StreamChunk[] = [];
    if (toolCallUpdate.rawInput !== undefined) {
      result.push({
        id: toolCallUpdate.toolCallId,
        input: state.input,
        name: normalizeOpencodeToolName(state.rawName),
        type: 'tool_use',
      });
    }

    for (const chunk of chunks) {
      result.push(normalizeChunk(chunk, state, toolCallUpdate.rawOutput));
    }

    return result;
  }
}
