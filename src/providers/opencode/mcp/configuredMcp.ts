import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ManagedMcpServer, McpServerConfig } from '../../../core/types/mcp';
import { DEFAULT_MCP_SERVER, isValidMcpServerConfig } from '../../../core/types/mcp';
import { expandHomePath } from '../../../utils/path';
import { buildOpencodeRuntimeEnv } from '../runtime/OpencodeRuntimeEnvironment';

export interface OpencodeConfiguredMcpServer {
  config: McpServerConfig;
  contextSaving: boolean;
  description?: string;
  disabledTools?: string[];
  enabled: boolean;
  name: string;
  sourcePath: string;
}

export interface OpencodeConfiguredMcpOverview {
  loadedPaths: string[];
  searchedPaths: string[];
  servers: OpencodeConfiguredMcpServer[];
}

export async function loadOpencodeConfiguredMcpOverview(
  settings: Record<string, unknown>,
  vaultPath: string | null,
): Promise<OpencodeConfiguredMcpOverview> {
  const env = resolveOpencodeOverviewEnv(settings);
  const searchedPaths = resolveOpencodeConfigCandidates(env, vaultPath);
  const loadedPaths: string[] = [];
  const servers: OpencodeConfiguredMcpServer[] = [];
  const seenNames = new Set<string>();

  for (const candidatePath of searchedPaths) {
    if (!candidatePath || !fs.existsSync(candidatePath)) {
      continue;
    }

    try {
      const rawConfig = await fsp.readFile(candidatePath, 'utf8');
      const parsedServers = extractConfiguredMcpServers(rawConfig, candidatePath);
      if (parsedServers.length === 0) {
        loadedPaths.push(candidatePath);
        continue;
      }

      loadedPaths.push(candidatePath);
      for (const server of parsedServers) {
        const key = server.name.toLowerCase();
        if (seenNames.has(key)) {
          continue;
        }

        seenNames.add(key);
        servers.push(server);
      }
    } catch {
      // Best-effort only.
    }
  }

  servers.sort((left, right) => left.name.localeCompare(right.name));
  return { loadedPaths, searchedPaths, servers };
}

export async function loadManagedOpencodeMcpServers(
  settings: Record<string, unknown>,
  vaultPath: string | null,
): Promise<ManagedMcpServer[]> {
  const overview = await loadOpencodeConfiguredMcpOverview(settings, vaultPath);
  return overview.servers.map((server) => ({
    config: server.config,
    contextSaving: server.contextSaving,
    ...(server.description ? { description: server.description } : {}),
    ...(server.disabledTools && server.disabledTools.length > 0
      ? { disabledTools: [...server.disabledTools] }
      : {}),
    enabled: server.enabled,
    name: server.name,
  }));
}

function resolveOpencodeOverviewEnv(
  settings: Record<string, unknown>,
): NodeJS.ProcessEnv {
  const env = buildOpencodeRuntimeEnv(settings, '');
  const home = env.HOME?.trim() || os.homedir();
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
  return {
    ...env,
    HOME: home,
    OPENCODE_CONFIG_DIR: env.OPENCODE_CONFIG_DIR?.trim() || path.join(xdgConfigHome, 'opencode'),
    XDG_CONFIG_HOME: xdgConfigHome,
  };
}

function resolveOpencodeConfigCandidates(
  env: NodeJS.ProcessEnv,
  vaultPath: string | null,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const home = env.HOME?.trim() || os.homedir();
  const projectConfigDisabled = isTruthyEnvValue(env.OPENCODE_DISABLE_PROJECT_CONFIG);
  const configuredConfig = env.OPENCODE_CONFIG?.trim();
  const configDir = env.OPENCODE_CONFIG_DIR?.trim()
    || path.join(env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config'), 'opencode');

  const pushCandidate = (candidate: string | null | undefined): void => {
    const normalized = candidate?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(resolveConfiguredConfigPath(configuredConfig, vaultPath));

  if (!projectConfigDisabled && vaultPath) {
    pushCandidate(path.join(vaultPath, '.opencode', 'opencode.json'));
    pushCandidate(path.join(vaultPath, '.opencode', 'config.json'));
  }

  pushCandidate(path.join(configDir, 'opencode.json'));
  pushCandidate(path.join(configDir, 'config.json'));

  if (process.platform === 'darwin') {
    const appSupportDir = path.join(home, 'Library', 'Application Support', 'opencode');
    pushCandidate(path.join(appSupportDir, 'opencode.json'));
    pushCandidate(path.join(appSupportDir, 'config.json'));
  }

  return candidates;
}

function resolveConfiguredConfigPath(
  configuredPath: string | undefined,
  vaultPath: string | null,
): string | null {
  const trimmed = configuredPath?.trim();
  if (!trimmed) {
    return null;
  }

  const expanded = expandHomePath(trimmed);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  return vaultPath ? path.resolve(vaultPath, expanded) : path.resolve(expanded);
}

function extractConfiguredMcpServers(
  rawConfig: string,
  sourcePath: string,
): OpencodeConfiguredMcpServer[] {
  const parsed = JSON.parse(rawConfig) as unknown;
  if (!isPlainObject(parsed)) {
    return [];
  }

  const serverMaps = [
    extractNamedMcpServerConfigs(parsed.mcpServers, parsed),
    extractNamedMcpServerConfigs(parsed.mcp, parsed),
    extractNamedMcpServerConfigs(
      isPlainObject(parsed.mcp) ? parsed.mcp.servers : undefined,
      parsed,
    ),
  ];

  const servers = serverMaps.find((entries) => entries.length > 0) ?? [];
  return servers.map((server) => ({
    ...server,
    sourcePath,
  }));
}

function extractNamedMcpServerConfigs(
  value: unknown,
  rootConfig: Record<string, unknown>,
): Array<Omit<OpencodeConfiguredMcpServer, 'sourcePath'>> {
  if (!isPlainObject(value)) {
    return [];
  }

  const servers: Array<Omit<OpencodeConfiguredMcpServer, 'sourcePath'>> = [];
  for (const [name, config] of Object.entries(value)) {
    if (!name.trim() || !isValidMcpServerConfig(config)) {
      continue;
    }

    const metadata = extractServerMetadata(name.trim(), config, rootConfig);
    servers.push({
      config,
      contextSaving: metadata.contextSaving ?? DEFAULT_MCP_SERVER.contextSaving,
      ...(metadata.description ? { description: metadata.description } : {}),
      ...(metadata.disabledTools && metadata.disabledTools.length > 0
        ? { disabledTools: metadata.disabledTools }
        : {}),
      enabled: metadata.enabled ?? DEFAULT_MCP_SERVER.enabled,
      name: name.trim(),
    });
  }

  return servers;
}

function extractServerMetadata(
  serverName: string,
  config: McpServerConfig,
  rootConfig: Record<string, unknown>,
): {
  contextSaving?: boolean;
  description?: string;
  disabledTools?: string[];
  enabled?: boolean;
} {
  const configRecord = isPlainObject(config) ? config : {};
  const claudianServerMetadata = resolveClaudianServerMetadata(rootConfig, serverName);

  return {
    ...extractMetadataRecord(configRecord),
    ...extractMetadataRecord(claudianServerMetadata),
  };
}

function resolveClaudianServerMetadata(
  rootConfig: Record<string, unknown>,
  serverName: string,
): Record<string, unknown> | null {
  const claudian = isPlainObject(rootConfig._claudian) ? rootConfig._claudian : null;
  const servers = claudian && isPlainObject(claudian.servers) ? claudian.servers : null;
  const serverMeta = servers && isPlainObject(servers[serverName]) ? servers[serverName] : null;
  return serverMeta as Record<string, unknown> | null;
}

function extractMetadataRecord(
  value: Record<string, unknown> | null,
): {
  contextSaving?: boolean;
  description?: string;
  disabledTools?: string[];
  enabled?: boolean;
} {
  if (!value) {
    return {};
  }

  const disabledTools = Array.isArray(value.disabledTools)
    ? value.disabledTools.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  return {
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.contextSaving === 'boolean' ? { contextSaving: value.contextSaving } : {}),
    ...(typeof value.description === 'string' && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
    ...(disabledTools.length > 0 ? { disabledTools } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTruthyEnvValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}
