#!/usr/bin/env node

const path = require('node:path');
const { install, status, uninstall } = require('../src/installer');

function printHelp() {
  console.log(`Usage:
  eli5-style init [--targets all|agents,claude,cursor] [--dir PATH] [--dry-run]
  eli5-style status [--targets all|agents,claude,cursor] [--dir PATH]
  eli5-style uninstall [--targets all|agents,claude,cursor] [--dir PATH] [--dry-run]

Targets:
  agents   AGENTS.md (also used by Codex)
  claude   CLAUDE.md
  cursor   .cursor/rules/eli5.mdc`);
}

function parseArgs(args) {
  const options = { dir: process.cwd(), targets: undefined, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--dir' || argument === '--targets') {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a value`);
      }
      options[argument === '--dir' ? 'dir' : 'targets'] = value;
      index += 1;
    } else if (argument.startsWith('--dir=')) {
      options.dir = argument.slice('--dir='.length);
    } else if (argument.startsWith('--targets=')) {
      options.targets = argument.slice('--targets='.length);
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function printResults(results) {
  for (const result of results) {
    console.log(`${result.state.padEnd(13)} ${result.target.padEnd(7)} ${result.path}`);
  }
}

function main() {
  const argumentsList = process.argv.slice(2);
  const command = argumentsList[0]?.startsWith('-') ? 'help' : (argumentsList.shift() || 'help');
  const args = argumentsList;
  const options = parseArgs(args);

  if (options.help || command === 'help') {
    printHelp();
    return;
  }

  const projectDir = path.resolve(options.dir);
  if (command === 'init') {
    printResults(install(projectDir, options.targets, { dryRun: options.dryRun }));
  } else if (command === 'status') {
    printResults(status(projectDir, options.targets));
  } else if (command === 'uninstall') {
    printResults(uninstall(projectDir, options.targets, { dryRun: options.dryRun }));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
