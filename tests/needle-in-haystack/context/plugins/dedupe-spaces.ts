import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'dedupe-spaces',
  description: 'Collapses runs of consecutive whitespace in the input into a single space.',
  run(input: string): string {
    return input.replace(/\s+/g, ' ');
  },
};

export default plugin;
