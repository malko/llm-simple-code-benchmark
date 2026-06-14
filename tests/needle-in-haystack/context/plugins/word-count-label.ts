import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'word-count-label',
  description: 'Counts the words in the input (sequences of non-whitespace characters) and returns the count as a decimal string.',
  run(input: string): string {
    return String(input.trim().split(/\s+/).filter(Boolean).length);
  },
};

export default plugin;
