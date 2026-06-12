import fs from 'fs/promises';
import path from 'path';
import { ToolDefinition, ToolCall } from '../types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit

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
