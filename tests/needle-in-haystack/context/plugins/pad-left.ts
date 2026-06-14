import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'pad-left',
  description: 'Pads the input on the left with spaces until it is at least 10 characters long.',
  run(input: string): string {
    return input.padStart(10, ' ');
  },
};

export default plugin;
