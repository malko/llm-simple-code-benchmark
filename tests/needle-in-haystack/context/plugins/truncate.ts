import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'truncate',
  description:
    "Truncates the input to at most 10 characters. If truncation is needed, the result ends with '...' and its total length (including the '...') is exactly 10.",
  run(input: string): string {
    const maxLen = 10;
    if (input.length <= maxLen) return input;
    return input.slice(0, maxLen - 3) + '...';
  },
};

export default plugin;
