const fs = require('node:fs');
const path = require('node:path');

const START_MARKER = '<!-- eli5-style:start -->';
const END_MARKER = '<!-- eli5-style:end -->';
const OUTPUT_STYLE_NAME = 'ELI5';

const CANONICAL_INSTRUCTIONS = `# ELI5 Response Style

Reply in the user's language.

Use plain, everyday language appropriate for that language.
Use short sentences and short paragraphs.
State the result first.
Use one idea per sentence.
Explain a necessary technical term immediately in simple words.
Avoid unnecessary introductions, recaps, jargon, and filler.

After taking action, report only:
1. What you did.
2. Whether it worked.
3. What the user should do next, if anything.

When the user must choose, provide at most two options.
Give the minimum context needed to choose.
Clearly recommend one option.

Keep code, commands, paths, identifiers, and API names exact.
Do not translate them.
`;

const TARGETS = Object.freeze([
  Object.freeze({
    name: 'agents',
    files: [Object.freeze({ file: 'AGENTS.md', kind: 'managed' })],
  }),
  Object.freeze({
    name: 'claude',
    files: [
      Object.freeze({ file: 'CLAUDE.md', kind: 'managed' }),
      Object.freeze({
        file: path.join('.claude', 'output-styles', 'ELI5.md'),
        kind: 'claude-style',
      }),
      Object.freeze({ file: path.join('.claude', 'settings.json'), kind: 'claude-settings' }),
    ],
  }),
  Object.freeze({
    name: 'cursor',
    files: [Object.freeze({ file: path.join('.cursor', 'rules', 'eli5.mdc'), kind: 'cursor' })],
  }),
]);

const TARGET_ALIASES = new Map([
  ['agents', 'agents'],
  ['codex', 'agents'],
  ['claude', 'claude'],
  ['claude-code', 'claude'],
  ['cursor', 'cursor'],
]);

function parseTargets(selection) {
  if (!selection || (Array.isArray(selection) && selection.length === 0)) {
    return TARGETS;
  }

  const values = Array.isArray(selection)
    ? selection
    : String(selection).split(',');

  if (values.some((value) => value.trim().toLowerCase() === 'all')) {
    return TARGETS;
  }

  const names = [];
  for (const value of values) {
    const alias = TARGET_ALIASES.get(value.trim().toLowerCase());
    if (!alias) {
      throw new Error(`Unknown target: ${value}`);
    }
    if (!names.includes(alias)) {
      names.push(alias);
    }
  }

  return TARGETS.filter((target) => names.includes(target.name));
}

function managedBlock() {
  return `${START_MARKER}\n${CANONICAL_INSTRUCTIONS.trimEnd()}\n${END_MARKER}`;
}

function initialContent(file) {
  const block = managedBlock();
  if (file.kind === 'cursor') {
    return `---\ndescription: Keep coding-agent responses plain and actionable\nalwaysApply: true\n---\n\n${block}\n`;
  }
  if (file.kind === 'claude-style') {
    return `---\nname: ${OUTPUT_STYLE_NAME}\ndescription: Keep responses plain and actionable\nkeep-coding-instructions: true\n---\n\n${block}\n`;
  }
  return `${block}\n`;
}

function blockPattern() {
  const start = START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${start}[\\s\\S]*?${end}`);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function upsertContent(existing, file) {
  if (existing === null) {
    return initialContent(file);
  }

  const pattern = blockPattern();
  if (pattern.test(existing)) {
    return existing.replace(pattern, managedBlock());
  }

  if (file.kind === 'claude-style') {
    throw new Error(`Refusing to overwrite unmanaged Claude output style: ${file.file}`);
  }

  const separator = existing.endsWith('\n\n')
    ? ''
    : existing.endsWith('\n')
      ? '\n'
      : '\n\n';
  return `${existing}${separator}${managedBlock()}\n`;
}

function targetPath(rootDir, file) {
  return path.join(rootDir, file.file);
}

function writeManagedFile(rootDir, file, dryRun) {
  const filePath = targetPath(rootDir, file);
  const existing = readFile(filePath);
  const next = upsertContent(existing, file);

  if (dryRun) {
    return {
      path: filePath,
      state: existing === next ? 'unchanged' : 'would-install',
    };
  }

  if (existing !== next) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, next);
  }

  return {
    path: filePath,
    state: existing === next ? 'unchanged' : 'installed',
  };
}

function readSettings(filePath) {
  const content = readFile(filePath);
  if (content === null) {
    return { content: null, settings: {} };
  }

  try {
    return { content, settings: JSON.parse(content) };
  } catch {
    throw new Error(`Invalid JSON settings file: ${filePath}`);
  }
}

function writeClaudeSettings(rootDir, file, dryRun) {
  const filePath = targetPath(rootDir, file);
  const { content, settings } = readSettings(filePath);
  const nextSettings = { ...settings, outputStyle: OUTPUT_STYLE_NAME };
  const next = `${JSON.stringify(nextSettings, null, 2)}\n`;

  if (dryRun) {
    return { path: filePath, state: content === next ? 'unchanged' : 'would-install' };
  }

  if (content !== next) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, next);
  }

  return { path: filePath, state: content === next ? 'unchanged' : 'installed' };
}

function installTarget(rootDir, target, dryRun) {
  const files = target.files.map((file) => (
    file.kind === 'claude-settings'
      ? writeClaudeSettings(rootDir, file, dryRun)
      : writeManagedFile(rootDir, file, dryRun)
  ));
  const changed = files.some((file) => file.state !== 'unchanged');
  return {
    target: target.name,
    path: files.map((file) => file.path).join(', '),
    state: changed ? (dryRun ? 'would-install' : 'installed') : 'unchanged',
  };
}

function install(rootDir, selection, options = {}) {
  const projectDir = path.resolve(rootDir);
  return parseTargets(selection).map((target) => installTarget(projectDir, target, options.dryRun));
}

function fileStatus(rootDir, file) {
  const filePath = targetPath(rootDir, file);
  const content = readFile(filePath);
  if (content === null) {
    return 'absent';
  }

  if (file.kind === 'claude-settings') {
    try {
      return JSON.parse(content).outputStyle === OUTPUT_STYLE_NAME ? 'installed' : 'unmanaged';
    } catch {
      return 'unmanaged';
    }
  }

  return blockPattern().test(content) ? 'installed' : 'unmanaged';
}

function status(rootDir, selection) {
  const projectDir = path.resolve(rootDir);

  return parseTargets(selection).map((target) => {
    const states = target.files.map((file) => fileStatus(projectDir, file));
    const state = states.every((value) => value === 'absent')
      ? 'absent'
      : states.every((value) => value === 'installed')
        ? 'installed'
        : 'unmanaged';
    return {
      target: target.name,
      path: target.files.map((file) => targetPath(projectDir, file)).join(', '),
      state,
    };
  });
}

function removeManagedBlock(existing, file) {
  if (existing.trim() === initialContent(file).trim()) {
    return null;
  }

  const pattern = blockPattern();
  const match = pattern.exec(existing);
  if (!match) {
    return existing;
  }

  let before = existing.slice(0, match.index);
  let after = existing.slice(match.index + match[0].length);
  if (before.endsWith('\n') && after.startsWith('\n')) {
    before = before.slice(0, -1);
    after = after.slice(1);
  }
  return before + after;
}

function uninstallManagedFile(rootDir, file, dryRun) {
  const filePath = targetPath(rootDir, file);
  const existing = readFile(filePath);
  if (existing === null) {
    return { path: filePath, state: 'absent' };
  }

  if (!blockPattern().test(existing)) {
    return { path: filePath, state: 'unmanaged' };
  }

  const next = removeManagedBlock(existing, file);
  if (dryRun) {
    return { path: filePath, state: 'would-remove' };
  }

  if (next === null) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, next);
  }
  return { path: filePath, state: 'removed' };
}

function uninstallClaudeSettings(rootDir, file, dryRun) {
  const filePath = targetPath(rootDir, file);
  const { content, settings } = readSettings(filePath);
  if (content === null) {
    return { path: filePath, state: 'absent' };
  }
  if (settings.outputStyle !== OUTPUT_STYLE_NAME) {
    return { path: filePath, state: 'unmanaged' };
  }

  const nextSettings = { ...settings };
  delete nextSettings.outputStyle;
  const next = Object.keys(nextSettings).length === 0
    ? null
    : `${JSON.stringify(nextSettings, null, 2)}\n`;

  if (dryRun) {
    return { path: filePath, state: 'would-remove' };
  }

  if (next === null) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, next);
  }
  return { path: filePath, state: 'removed' };
}

function uninstallTarget(rootDir, target, dryRun) {
  const files = target.files.map((file) => (
    file.kind === 'claude-settings'
      ? uninstallClaudeSettings(rootDir, file, dryRun)
      : uninstallManagedFile(rootDir, file, dryRun)
  ));
  const states = files.map((file) => file.state);
  const state = states.every((value) => value === 'absent')
    ? 'absent'
    : states.some((value) => value === 'unmanaged')
      ? 'unmanaged'
      : dryRun
        ? 'would-remove'
        : 'removed';
  return {
    target: target.name,
    path: files.map((file) => file.path).join(', '),
    state,
  };
}

function uninstall(rootDir, selection, options = {}) {
  const projectDir = path.resolve(rootDir);

  return parseTargets(selection).map((target) => uninstallTarget(projectDir, target, options.dryRun));
}

module.exports = {
  CANONICAL_INSTRUCTIONS,
  END_MARKER,
  START_MARKER,
  TARGETS,
  install,
  parseTargets,
  status,
  uninstall,
};
