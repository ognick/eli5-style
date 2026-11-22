const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CANONICAL_INSTRUCTIONS,
  install,
  status,
  uninstall,
} = require('../src/installer');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eli5-style-'));
}

test('install writes all agent adapters with English, language-neutral instructions', () => {
  const projectDir = makeTempProject();

  const result = install(projectDir);

  assert.deepEqual(result.map((item) => item.target), ['agents', 'claude', 'cursor']);
  assert.equal(fs.existsSync(path.join(projectDir, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'CLAUDE.md')), true);
  assert.equal(fs.existsSync(path.join(projectDir, '.cursor/rules/eli5.mdc')), true);
  assert.equal(fs.existsSync(path.join(projectDir, '.claude/output-styles/ELI5.md')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectDir, '.claude/settings.json'), 'utf8')).outputStyle, 'ELI5');
  assert.match(
    fs.readFileSync(path.join(projectDir, '.claude/output-styles/ELI5.md'), 'utf8'),
    /name: ELI5[\s\S]*keep-coding-instructions: true/,
  );
  assert.match(CANONICAL_INSTRUCTIONS, /Reply in the user's language/);
  assert.doesNotMatch(CANONICAL_INSTRUCTIONS, /[\u0400-\u04ff]/);
});

test('install updates its block without duplicating it or touching existing content', () => {
  const projectDir = makeTempProject();
  const agentsPath = path.join(projectDir, 'AGENTS.md');
  fs.writeFileSync(agentsPath, '# Team instructions\n\nKeep the API stable.\n');

  install(projectDir, ['agents']);
  install(projectDir, ['agents']);

  const content = fs.readFileSync(agentsPath, 'utf8');
  assert.match(content, /Keep the API stable\./);
  assert.equal((content.match(/eli5-style:start/g) || []).length, 1);
});

test('status distinguishes installed, absent, and unmanaged targets', () => {
  const projectDir = makeTempProject();
  fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), 'Team rules\n');

  const before = status(projectDir);
  assert.deepEqual(
    before.map((item) => item.state),
    ['unmanaged', 'absent', 'absent'],
  );

  install(projectDir, ['claude']);
  assert.equal(status(projectDir)[1].state, 'installed');
});

test('uninstall removes only the managed block and preserves other instructions', () => {
  const projectDir = makeTempProject();
  const agentsPath = path.join(projectDir, 'AGENTS.md');
  fs.writeFileSync(agentsPath, '# Team instructions\n');

  install(projectDir, ['agents']);
  const result = uninstall(projectDir, ['agents']);

  assert.equal(result[0].state, 'removed');
  assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# Team instructions\n');
});

test('uninstall removes files created by the installer when no other content exists', () => {
  const projectDir = makeTempProject();

  install(projectDir);
  uninstall(projectDir);

  assert.equal(fs.existsSync(path.join(projectDir, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(projectDir, 'CLAUDE.md')), false);
  assert.equal(fs.existsSync(path.join(projectDir, '.cursor/rules/eli5.mdc')), false);
  assert.equal(fs.existsSync(path.join(projectDir, '.claude/output-styles/ELI5.md')), false);
  assert.equal(fs.existsSync(path.join(projectDir, '.claude/settings.json')), false);
});

test('Claude installation preserves unrelated shared settings', () => {
  const projectDir = makeTempProject();
  const settingsDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  const existingSettings = { permissions: { allow: ['Bash(npm test)'] } };
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(existingSettings, null, 2)}\n`);

  install(projectDir, ['claude']);

  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), {
    ...existingSettings,
    outputStyle: 'ELI5',
  });

  uninstall(projectDir, ['claude']);

  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), existingSettings);
});

test('CLI accepts --help without an explicit command', () => {
  const output = execFileSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'eli5-style.js'),
    '--help',
  ], { encoding: 'utf8' });

  assert.match(output, /eli5-style init/);
});
