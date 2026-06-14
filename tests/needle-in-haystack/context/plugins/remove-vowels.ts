import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'remove-vowels',
  description: 'Removes all vowels (a, e, i, o, u, both upper and lower case) from the input.',
  run(input: string): string {
    return input.replace(/[aeiouAEIOU]/g, '');
  },
};

export default plugin;
