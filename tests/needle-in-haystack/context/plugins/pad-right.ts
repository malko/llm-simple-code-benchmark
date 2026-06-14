import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'pad-right',
  description: 'Pads the input on the right with spaces until it is at least 10 characters long.',
  run(input: string): string {
    return input.padEnd(10, ' ');
  },
};

export default plugin;
