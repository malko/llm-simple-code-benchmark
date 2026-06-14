import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'kebab-case',
  description: 'Converts the input to kebab-case: lowercases it and joins words with hyphens.',
  run(input: string): string {
    return input.trim().toLowerCase().split(/\s+/).filter(Boolean).join('-');
  },
};

export default plugin;
