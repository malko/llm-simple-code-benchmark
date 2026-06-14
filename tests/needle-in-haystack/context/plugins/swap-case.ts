import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'swap-case',
  description: 'Swaps the case of every letter in the input: uppercase letters become lowercase and vice versa.',
  run(input: string): string {
    return input
      .split('')
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join('');
  },
};

export default plugin;
