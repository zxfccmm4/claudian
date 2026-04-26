import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  loadManagedOpencodeMcpServers,
  loadOpencodeConfiguredMcpOverview,
} from '@/providers/opencode/mcp/configuredMcp';

function createSettings(envLines: string[]): Record<string, unknown> {
  return {
    sharedEnvironmentVariables: '',
    providerConfigs: {
      opencode: {
        cliPathsByHost: {},
        enabled: true,
        environmentHash: '',
        environmentVariables: envLines.join('\n'),
        modelAliases: {},
        preferredThinkingByModel: {},
        selectedMode: '',
        visibleModels: [],
      },
    },
  };
}

describe('configured OpenCode MCP loading', () => {
  let tempRoot: string;
  let isolatedConfigRoot: string;
  let isolatedHomeRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claudian-opencode-mcp-'));
    isolatedConfigRoot = path.join(tempRoot, 'xdg-config');
    isolatedHomeRoot = path.join(tempRoot, 'home');
    fs.mkdirSync(isolatedConfigRoot, { recursive: true });
    fs.mkdirSync(isolatedHomeRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  it('parses native OpenCode local and remote MCP config entries', async () => {
    const configPath = path.join(tempRoot, 'opencode.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mcp: {
        'apple-docs': {
          command: ['npx', '-y', '@kimsungwhee/apple-docs-mcp'],
          enabled: true,
          type: 'local',
        },
        'web-reader': {
          enabled: true,
          headers: {
            Authorization: 'Bearer token',
          },
          type: 'remote',
          url: 'https://example.com/mcp',
        },
      },
    }, null, 2));

    const overview = await loadOpencodeConfiguredMcpOverview(
      createSettings([
        `HOME=${isolatedHomeRoot}`,
        `XDG_CONFIG_HOME=${isolatedConfigRoot}`,
        `OPENCODE_CONFIG=${configPath}`,
      ]),
      tempRoot,
    );

    expect(overview.servers).toEqual([
      {
        config: {
          args: ['-y', '@kimsungwhee/apple-docs-mcp'],
          command: 'npx',
        },
        contextSaving: true,
        enabled: true,
        name: 'apple-docs',
        sourcePath: configPath,
      },
      {
        config: {
          headers: {
            Authorization: 'Bearer token',
          },
          type: 'http',
          url: 'https://example.com/mcp',
        },
        contextSaving: true,
        enabled: true,
        name: 'web-reader',
        sourcePath: configPath,
      },
    ]);
  });

  it('preserves enabled/contextSaving/disabledTools metadata when building managed servers', async () => {
    const configPath = path.join(tempRoot, 'opencode.json');
    fs.writeFileSync(configPath, JSON.stringify({
      _claudian: {
        servers: {
          alpha: {
            contextSaving: false,
            description: 'Alpha tools',
            disabledTools: ['search'],
          },
        },
      },
      mcp: {
        alpha: {
          command: ['uvx', 'alpha-mcp'],
          enabled: false,
          type: 'local',
        },
      },
    }, null, 2));

    const servers = await loadManagedOpencodeMcpServers(
      createSettings([
        `HOME=${isolatedHomeRoot}`,
        `XDG_CONFIG_HOME=${isolatedConfigRoot}`,
        `OPENCODE_CONFIG=${configPath}`,
      ]),
      tempRoot,
    );

    expect(servers).toEqual([
      {
        config: {
          args: ['alpha-mcp'],
          command: 'uvx',
        },
        contextSaving: false,
        description: 'Alpha tools',
        disabledTools: ['search'],
        enabled: false,
        name: 'alpha',
      },
    ]);
  });
});
