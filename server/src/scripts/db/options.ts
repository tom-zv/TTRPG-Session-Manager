import { expandTargets, isTarget, type Schema, type Target } from './createScripts.js';

export const COMMANDS = ['status', 'create', 'reset', 'backup', 'diff'] as const;
export type Command = (typeof COMMANDS)[number];

export interface DbOptions {
  command: Command;
  schemas: Schema[];
  /** Printed before running, for example when a reset target was widened. */
  notes: string[];
  test: boolean;
  yes: boolean;
  backup: boolean;
  help: boolean;
}

export const USAGE = `
Usage: npm run db:<command> -- [targets] [options]

Commands:
  status   Per schema: exists, table count, tables missing from or extra to the create scripts. Read-only.
  create   Create missing schemas and tables, re-run the idempotent seeds, create the audio folders on
           disk, add the dev GM user. Never drops or alters. Default target: all.
  reset    Back up, drop, recreate from the create scripts, add the dev GM user. Default target: game.
  backup   Dump the schemas into server/db/backups/. Default target: all.
  diff     Compare the database with a fresh build on the test container (npm run test:db:up first).
           Exits 1 on a difference. Read-only. Default target: all.

Targets: core, dnd5e, audio, game (core + dnd5e), all.
  A reset of core or dnd5e resets both: dnd5e has foreign keys to core.

Options:
  --test       Use the test container (127.0.0.1:3307). A reset there needs no confirmation and
               takes no backup; no dev user is created.
  --yes        Confirm a reset of core and dnd5e without a prompt. Audio is never confirmed by a flag:
               resetting it needs the word "audio" typed on a terminal.
  --no-backup  Skip the backup a reset takes first.
  --help       Show this help.

The connection comes from server/.env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD). The dev GM user is
created from DEV_GM_USERNAME and DEV_GM_PASSWORD when both are set.
`;

const DEFAULT_TARGET: Record<Command, Target> = {
  status: 'all', create: 'all', reset: 'game', backup: 'all', diff: 'all',
};

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

export function parseDbOptions(args: readonly string[]): DbOptions {
  const [command, ...rest] = args;
  if (command === undefined || command === '--help' || command === '-h') {
    return { command: 'status', schemas: [], notes: [], test: false, yes: false, backup: true, help: true };
  }
  if (!isCommand(command)) throw new Error(`Unknown command "${command}". Expected ${COMMANDS.join(', ')}.`);

  const options: DbOptions = { command, schemas: [], notes: [], test: false, yes: false, backup: true, help: false };
  const targets: Target[] = [];
  for (const arg of rest) {
    if (arg === '--test') options.test = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--no-backup') options.backup = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (isTarget(arg)) targets.push(arg);
    else throw new Error(`Unknown argument "${arg}".`);
  }

  options.schemas = expandTargets(targets.length > 0 ? targets : [DEFAULT_TARGET[command]]);
  if (command === 'reset' && options.schemas.includes('core') !== options.schemas.includes('dnd5e')) {
    options.schemas = expandTargets([...options.schemas, 'game']);
    options.notes.push('core and dnd5e are reset together: dnd5e has foreign keys to core.');
  }
  return options;
}

export type Confirmation =
  | { kind: 'none' }
  | { kind: 'prompt' }
  | { kind: 'typed'; word: 'audio' };

/** What a reset must get from the user before anything is dropped. */
export function resetConfirmation(options: Pick<DbOptions, 'schemas' | 'test' | 'yes'>): Confirmation {
  if (options.test) return { kind: 'none' };
  if (options.schemas.includes('audio')) return { kind: 'typed', word: 'audio' };
  return options.yes ? { kind: 'none' } : { kind: 'prompt' };
}
