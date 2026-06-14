import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'title-case',
  description:
    'Capitalizes the first letter of every word in the input and lowercases the rest of each word.',
  run(input: string): string {
    if (input.length === 0) return input;
    return input[0].toUpperCase() + input.slice(1).toLowerCase();
  },
};

export default plugin;
