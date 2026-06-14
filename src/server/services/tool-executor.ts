import fs from 'fs/promises';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { ToolDefinition, ToolCall } from '../types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit
const RUN_COMMAND_TIMEOUT_MS = 30000;
const MAX_COMMAND_OUTPUT = 8000;

function resolveSafe(baseDir: string, requestedPath: string): string {
  const resolved = path.resolve(baseDir, requestedPath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error(`Path traversal denied: ${requestedPath}`);
  }
  return resolved;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the entire content of a file from the output directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path within the output directory' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_lines',
      description: 'Read specific lines from a file (1-indexed, inclusive).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path within the output directory' },
          start: { type: 'number', description: 'Start line (1-indexed)' },
          end: { type: 'number', description: 'End line (inclusive, optional)' },
        },
        required: ['path', 'start'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the output directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path within the output directory' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for a pattern in a file using a regular expression.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression pattern' },
          path: { type: 'string', description: 'Relative path within the output directory' },
        },
        required: ['pattern', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in the output directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path (default: root)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command (e.g. to build, lint, or test your code) with its working directory set to the output directory. Times out after 30 seconds.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
];

export const toolExecutor = {
  async execute(baseDir: string, call: ToolCall): Promise<string> {
    const { name, arguments: argsStr } = call.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      return JSON.stringify({ error: 'Invalid arguments JSON' });
    }

    try {
      let result: unknown;
      switch (name) {
        case 'read_file':
          result = await execReadFile(baseDir, args.path as string);
          break;
        case 'read_lines':
          result = await execReadLines(baseDir, args.path as string, args.start as number, args.end as number);
          break;
        case 'write_file':
          result = await execWriteFile(baseDir, args.path as string, args.content as string);
          break;
        case 'grep':
          result = await execGrep(baseDir, args.pattern as string, args.path as string);
          break;
        case 'list_files':
          result = await execListFiles(baseDir, args.path as string);
          break;
        case 'run_command':
          result = await execRunCommand(baseDir, args.command as string);
          break;
        default:
          result = { error: `Unknown tool: ${name}` };
      }
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
};

async function readTextFile(baseDir: string, filePath: string): Promise<string> {
  const full = resolveSafe(baseDir, filePath);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (stat.size > MAX_FILE_SIZE) throw new Error(`File too large (${stat.size} > ${MAX_FILE_SIZE} bytes)`);
  return fs.readFile(full, 'utf-8');
}

async function execReadFile(baseDir: string, filePath: string): Promise<{ content: string }> {
  if (!filePath) throw new Error('path is required');
  const content = await readTextFile(baseDir, filePath);
  return { content };
}

async function execReadLines(baseDir: string, filePath: string, start: number, end?: number): Promise<{ lines: string[] }> {
  if (!filePath) throw new Error('path is required');
  if (!start || start < 1) throw new Error('start must be >= 1');
  const content = await readTextFile(baseDir, filePath);
  const allLines = content.split('\n');
  const s = start - 1;
  const e = end ? Math.min(end, allLines.length) : allLines.length;
  return { lines: allLines.slice(s, e) };
}

async function execWriteFile(baseDir: string, filePath: string, content: string): Promise<{ success: boolean; path: string }> {
  if (!filePath) throw new Error('path is required');
  const full = resolveSafe(baseDir, filePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { success: true, path: filePath };
}

async function execGrep(baseDir: string, pattern: string, filePath: string): Promise<{ matches: { line: number; text: string }[] }> {
  if (!pattern || !filePath) throw new Error('pattern and path are required');
  const content = await readTextFile(baseDir, filePath);
  const re = new RegExp(pattern, 'g');
  const matches: { line: number; text: string }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i] });
    }
  }
  return { matches };
}

async function execListFiles(baseDir: string, dirPath?: string): Promise<{ files: string[] }> {
  const target = dirPath ? resolveSafe(baseDir, dirPath) : baseDir;
  const entries = await fs.readdir(target, { withFileTypes: true });
  const files = entries.map(e => {
    const relative = path.relative(baseDir, path.join(target, e.name));
    return e.isDirectory() ? relative + '/' : relative;
  });
  return { files };
}

// Result is cached for the process lifetime: a one-off smoke test that exercises
// the same bind setup used for real commands. Requires CAP_SYS_ADMIN, and on most
// Docker setups also `security_opt: [apparmor:unconfined, seccomp:unconfined]`
// (see docker-compose.yml) — bwrap's pivot_root/mount calls are otherwise blocked.
// --unshare-net/--unshare-pid are deliberately not used: bwrap's loopback setup for
// a fresh netns reliably fails as PID 1 inside a container ("Failed RTM_NEWADDR").
let bwrapAvailable: boolean | null = null;

function isBwrapAvailable(): boolean {
  if (bwrapAvailable !== null) return bwrapAvailable;
  try {
    const probe = spawnSync('bwrap', [
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind-try', '/sbin', '/sbin',
      '--ro-bind-try', '/etc', '/etc',
      '--proc', '/proc',
      '--dev', '/dev',
      '--tmpfs', '/tmp',
      '--unshare-ipc', '--unshare-uts',
      '--die-with-parent',
      '--', 'sh', '-c', 'true',
    ], { timeout: 5000 });
    bwrapAvailable = probe.status === 0;
  } catch {
    bwrapAvailable = false;
  }
  if (!bwrapAvailable) {
    console.warn('[tool-executor] bubblewrap sandbox unavailable for run_command; falling back to cwd-scoped execution');
  }
  return bwrapAvailable;
}

// /app/tests (hidden harness/expected files) and /app/data (db, settings incl. API key) are
// masked out by --tmpfs /app; only node_modules (for tsc/tsx) and this test's own
// files dir + cache are re-exposed on top of that empty tree.
function buildBwrapArgs(baseDir: string, cacheDir: string, command: string): string[] {
  return [
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind-try', '/sbin', '/sbin',
    '--ro-bind-try', '/etc', '/etc',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--tmpfs', '/root',
    '--tmpfs', '/app',
    '--ro-bind-try', '/app/node_modules', '/app/node_modules',
    '--bind', baseDir, baseDir,
    '--bind', cacheDir, '/root/.cache',
    '--chdir', baseDir,
    '--unshare-ipc', '--unshare-uts',
    '--die-with-parent',
    '--', 'sh', '-c', command,
  ];
}

function truncateOutput(s: string): string {
  return s.length > MAX_COMMAND_OUTPUT ? `${s.slice(0, MAX_COMMAND_OUTPUT)}\n...(truncated)` : s;
}

async function execRunCommand(baseDir: string, command: string): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  if (!command || !command.trim()) throw new Error('command is required');

  let cmd: string;
  let args: string[];

  if (isBwrapAvailable()) {
    const cacheDir = path.join(path.dirname(baseDir), '.runcache');
    await fs.mkdir(cacheDir, { recursive: true });
    cmd = 'bwrap';
    args = buildBwrapArgs(baseDir, cacheDir, command);
  } else {
    cmd = 'sh';
    args = ['-c', command];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: baseDir });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, RUN_COMMAND_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        timedOut,
      });
    });
  });
}
