# eli5-style

Install one shared, plain-language response style for coding agents.

The style instructions are written in English and tell an agent to reply in
the user's language. The same repository files work for all languages without
putting language-specific text in the project.

## Usage

Run this from the repository root:

```sh
node bin/eli5-style.js init
```

After publishing the package, the same command can be run as
`npx eli5-style init`.

## For coding agents

When a user gives this repository URL and asks to install the style into the
current project, run:

```sh
npx --yes --package=github:ognick/eli5-style eli5-style init
```

Then verify the installation:

```sh
npx --yes --package=github:ognick/eli5-style eli5-style status
```

The command installs into the current working directory. It does not modify
the source repository used to fetch the installer.

The GitHub dependency intentionally follows the repository's current `HEAD`,
so users do not need to choose a version.

The command creates or updates these files:

| Target | File | Agent |
| --- | --- | --- |
| `agents` | `AGENTS.md` | Codex and other agents that support AGENTS.md |
| `claude` | `CLAUDE.md`, `.claude/output-styles/ELI5.md`, `.claude/settings.json` | Claude Code |
| `cursor` | `.cursor/rules/eli5.mdc` | Cursor |

## Native integrations

- Claude Code uses the native Output Style file with `name: ELI5`,
  `keep-coding-instructions: true`, and the shared `outputStyle` setting.
- Codex has no separate output-style file. Its native project instruction
  mechanism is `AGENTS.md`.
- Cursor uses a native always-applied Project Rule in `.cursor/rules/` with
  `.mdc` frontmatter.

The Claude Code `output-format` option controls machine-readable transport,
not the human response style. This package configures `outputStyle`.

Choose specific targets when needed:

```sh
node bin/eli5-style.js init --targets agents,claude
node bin/eli5-style.js status
node bin/eli5-style.js uninstall
```

Use `--dir PATH` to install into another repository. Use `--dry-run` to see
what would change without writing files.

## Safety

The installer owns only the block between these markers:

```md
<!-- eli5-style:start -->
<!-- eli5-style:end -->
```

It appends that block to existing files, updates it on repeated installs, and
preserves all other instructions. `uninstall` removes only the managed block.

## Development

```sh
npm test
node bin/eli5-style.js --help
```
