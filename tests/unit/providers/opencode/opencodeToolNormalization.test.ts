import {
  normalizeOpencodeToolInput,
  OpencodeToolStreamAdapter,
} from '../../../../src/providers/opencode/normalization/opencodeToolNormalization';

describe('normalizeOpencodeToolInput', () => {
  it('maps question payloads to the AskUserQuestion renderer shape', () => {
    expect(normalizeOpencodeToolInput('question', {
      questions: [{
        header: 'Tests',
        id: 'tests',
        multiple: true,
        options: [
          { description: 'Update the related tests', label: 'Yes' },
          { description: 'Skip test edits', label: 'No' },
        ],
        question: 'Update tests too?',
      }],
    })).toEqual({
      questions: [{
        header: 'Tests',
        id: 'tests',
        multiSelect: true,
        options: [
          { description: 'Update the related tests', label: 'Yes' },
          { description: 'Skip test edits', label: 'No' },
        ],
        question: 'Update tests too?',
      }],
    });
  });

  it('maps todowrite statuses into the TodoWrite renderer shape', () => {
    expect(normalizeOpencodeToolInput('todowrite', {
      todos: [
        { content: 'Ship feature', status: 'in_progress' },
        { content: 'Drop stale task', status: 'cancelled' },
      ],
    })).toEqual({
      todos: [
        { activeForm: 'Ship feature', content: 'Ship feature', status: 'in_progress' },
        { activeForm: 'Drop stale task', content: 'Drop stale task', status: 'completed' },
      ],
    });
  });
});

describe('OpencodeToolStreamAdapter', () => {
  it('keeps the original tool identity when completion updates replace title with a filepath', () => {
    const adapter = new OpencodeToolStreamAdapter();

    expect(adapter.normalizeToolCall({
      rawInput: {},
      title: 'read',
      toolCallId: 'tool-1',
    }, [{
      id: 'tool-1',
      input: {},
      name: 'read',
      type: 'tool_use',
    }])).toEqual([{
      id: 'tool-1',
      input: {},
      name: 'Read',
      type: 'tool_use',
    }]);

    expect(adapter.normalizeToolCallUpdate({
      kind: 'read',
      rawInput: {
        filePath: '/vault/notes/today.md',
      },
      status: 'completed',
      title: 'notes/today.md',
      toolCallId: 'tool-1',
    }, [{
      content: 'read ok',
      id: 'tool-1',
      isError: false,
      type: 'tool_result',
    }])).toEqual([
      {
        id: 'tool-1',
        input: { file_path: '/vault/notes/today.md' },
        name: 'Read',
        type: 'tool_use',
      },
      {
        content: 'read ok',
        id: 'tool-1',
        isError: false,
        type: 'tool_result',
      },
    ]);
  });

  it('attaches structured answers for question tool results', () => {
    const adapter = new OpencodeToolStreamAdapter();

    adapter.normalizeToolCall({
      rawInput: {
        questions: [{
          header: 'Deploy',
          id: 'deploy',
          options: [
            { description: 'Ship the change', label: 'Yes' },
            { description: 'Hold the deploy', label: 'No' },
          ],
          question: 'Deploy now?',
        }],
      },
      title: 'question',
      toolCallId: 'tool-2',
    }, [{
      id: 'tool-2',
      input: {},
      name: 'question',
      type: 'tool_use',
    }]);

    expect(adapter.normalizeToolCallUpdate({
      rawOutput: {
        metadata: {
          answers: [['Yes']],
        },
        output: 'User has answered your questions.',
      },
      status: 'completed',
      title: 'Asked 1 question',
      toolCallId: 'tool-2',
    }, [{
      content: 'User has answered your questions.',
      id: 'tool-2',
      isError: false,
      type: 'tool_result',
    }])).toEqual([{
      content: 'User has answered your questions.',
      id: 'tool-2',
      isError: false,
      toolUseResult: {
        answers: {
          deploy: 'Yes',
          'Deploy now?': 'Yes',
        },
      },
      type: 'tool_result',
    }]);
  });
});
