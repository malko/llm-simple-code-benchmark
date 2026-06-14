import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'reverse',
  description: 'Reverses the order of characters in the input.',
  run(input: string): string {
    return input.split('').reverse().join('');
  },
};

export default plugin;
