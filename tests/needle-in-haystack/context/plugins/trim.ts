import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'trim',
  description: 'Removes leading and trailing whitespace from the input.',
  run(input: string): string {
    return input.trim();
  },
};

export default plugin;
