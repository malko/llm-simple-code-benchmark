import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'sentence-case',
  description:
    'Capitalizes only the first letter of the input and lowercases the rest of the string.',
  run(input: string): string {
    if (input.length === 0) return input;
    return input[0].toUpperCase() + input.slice(1).toLowerCase();
  },
};

export default plugin;
