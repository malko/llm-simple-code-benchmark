import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'snake-case',
  description: 'Converts the input to snake_case: lowercases it and joins words with underscores.',
  run(input: string): string {
    return input.trim().toLowerCase().split(/\s+/).filter(Boolean).join('_');
  },
};

export default plugin;
