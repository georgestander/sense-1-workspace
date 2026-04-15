import type { DesktopAppRecord, DesktopExtensionOverviewResult, DesktopPluginRecord, DesktopSkillRecord } from "./contracts/management.js";
import type { DesktopAppServerInputItem } from "./contracts/thread-core.js";

export type DesktopPromptShortcutMatch = {
  readonly item: DesktopAppServerInputItem & { readonly type: "mention" };
  readonly kind: "app" | "plugin" | "skill";
  readonly label: string;
  readonly token: string;
};

export type DesktopPromptShortcutSuggestion = {
  readonly item: DesktopAppServerInputItem & { readonly type: "mention" };
  readonly kind: "app" | "plugin" | "skill";
  readonly label: string;
  readonly token: string;
  readonly description: string | null;
};

export type DesktopActivePromptShortcutQuery = {
  readonly query: string;
  readonly start: number;
  readonly end: number;
};

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeShortcutKey(value: unknown): string | null {
  const resolved = firstString(value);
  if (!resolved) {
    return null;
  }

  const normalized = resolved
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

function dedupeKeys(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const value of values) {
    const normalized = normalizeShortcutKey(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    keys.push(normalized);
  }

  return keys;
}

function buildSkillAliasKeys(skill: DesktopSkillRecord): string[] {
  const fullName = normalizeShortcutKey(skill.name);
  if (!fullName) {
    return [];
  }

  const parts = fullName.split(":").filter(Boolean);
  if (parts.length < 2) {
    return [fullName];
  }

  const namespace = parts[0] ?? null;
  const localName = parts.at(-1) ?? null;

  return dedupeKeys([
    fullName,
    localName,
    namespace === localName ? namespace : null,
  ]);
}

function buildAppAliasKeys(app: DesktopAppRecord): string[] {
  return dedupeKeys([
    app.id,
    app.name,
  ]);
}

function buildPluginAliasKeys(plugin: DesktopPluginRecord): string[] {
  return dedupeKeys([
    plugin.id,
    plugin.name,
    plugin.displayName,
  ]);
}

function resolveSkillShortcut(
  token: string,
  skills: DesktopSkillRecord[],
): { exact: boolean; skill: DesktopSkillRecord } | null {
  const normalizedToken = normalizeShortcutKey(token);
  if (!normalizedToken) {
    return null;
  }

  let exactNameMatch: DesktopSkillRecord | null = null;
  const aliasMatches: DesktopSkillRecord[] = [];

  for (const skill of skills) {
    if (!skill.enabled) {
      continue;
    }

    const skillName = normalizeShortcutKey(skill.name);
    if (skillName === normalizedToken) {
      exactNameMatch = skill;
      break;
    }

    if (buildSkillAliasKeys(skill).includes(normalizedToken)) {
      aliasMatches.push(skill);
    }
  }

  if (exactNameMatch) {
    return {
      exact: true,
      skill: exactNameMatch,
    };
  }

  if (aliasMatches.length === 1) {
    return {
      exact: false,
      skill: aliasMatches[0],
    };
  }

  const aliasFallback = aliasMatches.find((skill) => {
    const [namespace, localName] = normalizeShortcutKey(skill.name)?.split(":") ?? [];
    return namespace === normalizedToken && localName === normalizedToken;
  }) ?? null;

  return aliasFallback
    ? {
        exact: false,
        skill: aliasFallback,
      }
    : null;
}

function resolvePluginShortcut(
  token: string,
  plugins: DesktopPluginRecord[],
  skills: DesktopSkillRecord[],
): { plugin: DesktopPluginRecord; skill: DesktopSkillRecord } | null {
  const normalizedToken = normalizeShortcutKey(token);
  if (!normalizedToken) {
    return null;
  }

  const plugin = plugins.find((entry) =>
    entry.enabled
    && entry.installed
    && buildPluginAliasKeys(entry).includes(normalizedToken));
  if (!plugin) {
    return null;
  }

  const candidates = skills.filter((skill) => {
    if (!skill.enabled) {
      return false;
    }

    const [namespace] = normalizeShortcutKey(skill.name)?.split(":") ?? [];
    return namespace === normalizedToken;
  });

  const selectedSkill =
    candidates.length === 1
      ? candidates[0]
      : candidates.find((skill) => {
          const [namespace, localName] = normalizeShortcutKey(skill.name)?.split(":") ?? [];
          return namespace === normalizedToken && localName === normalizedToken;
        }) ?? null;

  if (!selectedSkill) {
    return null;
  }

  return {
    plugin,
    skill: selectedSkill,
  };
}

function resolvePluginAppShortcut(
  token: string,
  plugins: DesktopPluginRecord[],
  apps: DesktopAppRecord[],
): { appId: string; plugin: DesktopPluginRecord } | null {
  const normalizedToken = normalizeShortcutKey(token);
  if (!normalizedToken) {
    return null;
  }

  const plugin = plugins.find((entry) =>
    entry.enabled
    && entry.installed
    && entry.appIds.length === 1
    && buildPluginAliasKeys(entry).includes(normalizedToken));
  const appId = firstString(plugin?.appIds[0]);
  const app = appId
    ? apps.find((entry) =>
        entry.id === appId
        && entry.isEnabled
        && entry.isAccessible)
    : null;
  return plugin && app
    ? {
        appId: app.id,
        plugin,
      }
    : null;
}

function resolveAppShortcut(token: string, apps: DesktopAppRecord[]): DesktopAppRecord | null {
  const normalizedToken = normalizeShortcutKey(token);
  if (!normalizedToken) {
    return null;
  }

  return apps.find((app) =>
    app.isEnabled
    && app.isAccessible
    && buildAppAliasKeys(app).includes(normalizedToken)) ?? null;
}

function buildSkillLabel(skill: DesktopSkillRecord): string {
  const fullName = firstString(skill.name) ?? "Skill";
  return fullName.split(":").at(-1) ?? fullName;
}

function chooseSkillToken(skill: DesktopSkillRecord): string | null {
  const fullName = normalizeShortcutKey(skill.name);
  const aliases = buildSkillAliasKeys(skill);
  if (!fullName) {
    return aliases[0] ?? null;
  }

  return aliases.find((alias) => alias !== fullName) ?? fullName;
}

function chooseSuggestionSkillToken(
  skill: DesktopSkillRecord,
  aliasCounts: Map<string, number>,
): string | null {
  const parts = normalizeShortcutKey(skill.name)?.split(":").filter(Boolean) ?? [];
  const preferred = chooseSkillToken(skill);
  const fullName = normalizeShortcutKey(skill.name);
  if (preferred && (aliasCounts.get(preferred) ?? 0) > 1) {
    return fullName ?? preferred;
  }
  if (skill.scope === "plugin" && parts.length >= 2 && parts[0] === parts.at(-1) && preferred === parts[0]) {
    return null;
  }
  return preferred;
}

function choosePluginToken(plugin: DesktopPluginRecord): string | null {
  return normalizeShortcutKey(plugin.name) ?? normalizeShortcutKey(plugin.id) ?? normalizeShortcutKey(plugin.displayName);
}

function chooseAppToken(app: DesktopAppRecord): string | null {
  return normalizeShortcutKey(app.name) ?? normalizeShortcutKey(app.id);
}

function fileBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function resolveShortcutTargetKind(
  token: string,
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">,
): "app" | "plugin" | "skill" | null {
  const skillMatch = resolveSkillShortcut(token, overview.skills);
  if (skillMatch?.exact) {
    return "skill";
  }

  if (resolvePluginShortcut(token, overview.plugins, overview.skills)) {
    return "plugin";
  }

  if (resolvePluginAppShortcut(token, overview.plugins, overview.apps)) {
    return "app";
  }

  if (skillMatch) {
    return "skill";
  }

  return resolveAppShortcut(token, overview.apps) ? "app" : null;
}

function chooseSuggestionAppToken(
  app: DesktopAppRecord,
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">,
): string | null {
  for (const alias of buildAppAliasKeys(app)) {
    if (resolveShortcutTargetKind(alias, overview) === "app") {
      return alias;
    }
  }

  return null;
}

function matchesShortcutQuery(query: string | null, ...values: Array<string | null | undefined>): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeShortcutKey(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = normalizeShortcutKey(value);
    return Boolean(normalizedValue && normalizedValue.includes(normalizedQuery));
  });
}

function isShortcutTokenCharacter(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z0-9:_-]/u.test(character));
}

export function resolveActivePromptShortcutQuery(
  prompt: string,
  cursorIndex = prompt.length,
): DesktopActivePromptShortcutQuery | null {
  if (typeof prompt !== "string" || !prompt.includes("$")) {
    return null;
  }

  const safeCursorIndex = Math.min(Math.max(cursorIndex, 0), prompt.length);
  let tokenStart = safeCursorIndex;
  while (tokenStart > 0 && isShortcutTokenCharacter(prompt[tokenStart - 1])) {
    tokenStart -= 1;
  }

  const dollarIndex = tokenStart - 1;
  if (dollarIndex < 0 || prompt[dollarIndex] !== "$") {
    return null;
  }

  const prefixCharacter = dollarIndex > 0 ? prompt[dollarIndex - 1] : null;
  if (prefixCharacter && /[A-Za-z0-9_]/u.test(prefixCharacter)) {
    return null;
  }

  let tokenEnd = safeCursorIndex;
  while (tokenEnd < prompt.length && isShortcutTokenCharacter(prompt[tokenEnd])) {
    tokenEnd += 1;
  }

  return {
    query: prompt.slice(tokenStart, safeCursorIndex),
    start: dollarIndex,
    end: tokenEnd,
  };
}

export function extractPromptShortcutTokens(prompt: string): string[] {
  if (typeof prompt !== "string" || !prompt.includes("$")) {
    return [];
  }

  const tokens: string[] = [];
  const seen = new Set<string>();
  const matcher = /(^|[^A-Za-z0-9_])\$([A-Za-z0-9:_-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(prompt)) !== null) {
    const token = normalizeShortcutKey(match[2]);
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

export function resolvePromptShortcutMatches(
  prompt: string,
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">,
): DesktopPromptShortcutMatch[] {
  const tokens = extractPromptShortcutTokens(prompt);
  if (tokens.length === 0) {
    return [];
  }

  const matches: DesktopPromptShortcutMatch[] = [];
  const seenPaths = new Set<string>();

  for (const token of tokens) {
    const skillMatch = resolveSkillShortcut(token, overview.skills);
    if (skillMatch?.exact) {
      const skillPath = firstString(skillMatch.skill.path);
      if (skillPath && !seenPaths.has(skillPath)) {
        seenPaths.add(skillPath);
        matches.push({
          item: {
            type: "mention",
            name: skillMatch.skill.name,
            path: skillPath,
          },
          kind: "skill",
          label: buildSkillLabel(skillMatch.skill),
          token,
        });
      }
      continue;
    }

    const pluginMatch = resolvePluginShortcut(token, overview.plugins, overview.skills);
    if (pluginMatch) {
      const skillPath = firstString(pluginMatch.skill.path);
      if (skillPath && !seenPaths.has(skillPath)) {
        seenPaths.add(skillPath);
        matches.push({
          item: {
            type: "mention",
            name: pluginMatch.skill.name,
            path: skillPath,
          },
          kind: "plugin",
          label: pluginMatch.plugin.displayName,
          token,
        });
      }
      continue;
    }

    const pluginAppMatch = resolvePluginAppShortcut(token, overview.plugins, overview.apps);
    if (pluginAppMatch) {
      const appPath = `app://${pluginAppMatch.appId}`;
      if (!seenPaths.has(appPath)) {
        seenPaths.add(appPath);
        matches.push({
          item: {
            type: "mention",
            name: pluginAppMatch.plugin.displayName,
            path: appPath,
          },
          kind: "app",
          label: pluginAppMatch.plugin.displayName,
          token,
        });
      }
      continue;
    }

    if (skillMatch) {
      const skillPath = firstString(skillMatch.skill.path);
      if (skillPath && !seenPaths.has(skillPath)) {
        seenPaths.add(skillPath);
        matches.push({
          item: {
            type: "mention",
            name: skillMatch.skill.name,
            path: skillPath,
          },
          kind: "skill",
          label: buildSkillLabel(skillMatch.skill),
          token,
        });
      }
      continue;
    }

    const app = resolveAppShortcut(token, overview.apps);
    if (!app) {
      continue;
    }

    const appPath = `app://${app.id}`;
    if (seenPaths.has(appPath)) {
      continue;
    }

    seenPaths.add(appPath);
    matches.push({
      item: {
        type: "mention",
        name: app.name,
        path: appPath,
      },
      kind: "app",
      label: app.name,
      token,
    });
  }

  return matches;
}

export function resolvePromptShortcutSuggestions(
  prompt: string,
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">,
  cursorIndex = prompt.length,
): DesktopPromptShortcutSuggestion[] {
  const activeQuery = resolveActivePromptShortcutQuery(prompt, cursorIndex);
  if (!activeQuery) {
    return [];
  }

  const suggestions: DesktopPromptShortcutSuggestion[] = [];
  const seen = new Set<string>();
  const skillAliasCounts = new Map<string, number>();

  for (const skill of overview.skills) {
    if (!skill.enabled) {
      continue;
    }
    for (const alias of buildSkillAliasKeys(skill)) {
      skillAliasCounts.set(alias, (skillAliasCounts.get(alias) ?? 0) + 1);
    }
  }

  for (const skill of overview.skills) {
    if (!skill.enabled) {
      continue;
    }

    const token = chooseSuggestionSkillToken(skill, skillAliasCounts);
    if (!token || !matchesShortcutQuery(activeQuery.query, token, skill.name, buildSkillLabel(skill))) {
      continue;
    }

    const key = `${token}:${skill.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      item: {
        type: "mention",
        name: skill.name,
        path: skill.path,
      },
      kind: skill.scope === "plugin" ? "plugin" : "skill",
      label: buildSkillLabel(skill),
      token,
      description: skill.description,
    });
  }

  for (const plugin of overview.plugins) {
    if (!plugin.enabled || !plugin.installed) {
      continue;
    }

    const token = choosePluginToken(plugin);
    if (!token || !matchesShortcutQuery(activeQuery.query, token, plugin.name, plugin.displayName)) {
      continue;
    }

    const pluginSkillMatch = resolvePluginShortcut(token, overview.plugins, overview.skills);
    if (pluginSkillMatch) {
      const key = `${token}:${pluginSkillMatch.skill.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({
        item: {
          type: "mention",
          name: pluginSkillMatch.skill.name,
          path: pluginSkillMatch.skill.path,
        },
        kind: "plugin",
        label: plugin.displayName,
        token,
        description: plugin.description,
      });
      continue;
    }

    const pluginAppMatch = resolvePluginAppShortcut(token, overview.plugins, overview.apps);
    const pluginApp = pluginAppMatch
      ? overview.apps.find((entry) => entry.id === pluginAppMatch.appId) ?? null
      : null;
    const appToken = pluginApp ? chooseSuggestionAppToken(pluginApp, overview) : null;
    if (!pluginAppMatch || !pluginApp || !appToken || !matchesShortcutQuery(activeQuery.query, appToken, pluginApp.id, pluginApp.name)) {
      continue;
    }

    const appPath = `app://${pluginAppMatch.appId}`;
    const key = `${appToken}:${appPath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      item: {
        type: "mention",
        name: plugin.displayName,
        path: appPath,
      },
      kind: "app",
      label: plugin.displayName,
      token: appToken,
      description: plugin.description,
    });
  }

  for (const app of overview.apps) {
    if (!app.isEnabled || !app.isAccessible) {
      continue;
    }

    const token = chooseSuggestionAppToken(app, overview);
    if (!token || !matchesShortcutQuery(activeQuery.query, token, app.id, app.name)) {
      continue;
    }

    const appPath = `app://${app.id}`;
    const key = `${token}:${appPath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      item: {
        type: "mention",
        name: app.name,
        path: appPath,
      },
      kind: "app",
      label: app.name,
      token,
      description: app.description,
    });
  }

  return suggestions
    .sort((left, right) => {
      const query = normalizeShortcutKey(activeQuery.query);
      const leftStarts = query ? left.token.startsWith(query) || normalizeShortcutKey(left.label)?.startsWith(query) : true;
      const rightStarts = query ? right.token.startsWith(query) || normalizeShortcutKey(right.label)?.startsWith(query) : true;
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    });
}

export function replaceActivePromptShortcut(
  prompt: string,
  token: string,
  cursorIndex = prompt.length,
): { prompt: string; cursorIndex: number } {
  const activeQuery = resolveActivePromptShortcutQuery(prompt, cursorIndex);
  const normalizedToken = normalizeShortcutKey(token) ?? token.trim();
  if (!activeQuery || !normalizedToken) {
    return {
      prompt,
      cursorIndex,
    };
  }

  const promptSuffix = prompt.slice(activeQuery.end);
  const shouldInsertTrailingSpace = promptSuffix.length === 0 || !/^\s/u.test(promptSuffix);
  const nextPrompt = `${prompt.slice(0, activeQuery.start)}$${normalizedToken}${shouldInsertTrailingSpace ? " " : ""}${promptSuffix}`;
  return {
    prompt: nextPrompt,
    cursorIndex: activeQuery.start + normalizedToken.length + 1 + (shouldInsertTrailingSpace ? 1 : 0),
  };
}

export function resolvePromptShortcutInputItems(
  prompt: string,
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">,
): DesktopAppServerInputItem[] {
  return resolvePromptShortcutMatches(prompt, overview).map((match) => match.item);
}

export function resolveInputItemPromptShortcutMatches(
  inputItems: DesktopAppServerInputItem[],
): DesktopPromptShortcutMatch[] {
  const matches: DesktopPromptShortcutMatch[] = [];
  const seenKeys = new Set<string>();

  for (const item of inputItems) {
    if (item?.type !== "mention") {
      continue;
    }

    const itemPath = firstString(item.path);
    if (!itemPath) {
      continue;
    }

    const itemName = firstString(item.name);
    const normalizedName = normalizeShortcutKey(itemName);
    const parts = normalizedName?.split(":").filter(Boolean) ?? [];
    const namespace = parts[0] ?? null;
    const localName = parts.at(-1) ?? null;
    const fallbackToken = normalizeShortcutKey(
      itemPath.startsWith("app://")
        ? itemPath.slice("app://".length)
        : fileBasename(itemPath).replace(/\.[^.]+$/u, ""),
    );

    const kind: DesktopPromptShortcutMatch["kind"] =
      itemPath.startsWith("app://")
        ? "app"
        : parts.length >= 2 && namespace === localName
          ? "plugin"
          : "skill";
    const token = localName ?? normalizedName ?? fallbackToken;
    if (!token) {
      continue;
    }

    const label =
      kind === "app"
        ? firstString(itemName, itemPath.slice("app://".length))
        : kind === "plugin"
          ? firstString(localName, namespace, itemName)
          : firstString(localName, itemName, fallbackToken);
    if (!label) {
      continue;
    }

    const key = `${kind}:${itemPath}`;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    matches.push({
      item,
      kind,
      label,
      token,
    });
  }

  return matches;
}
