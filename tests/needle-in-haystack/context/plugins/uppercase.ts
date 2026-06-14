import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'uppercase',
  description: 'Converts the input to all uppercase letters.',
  run(input: string): string {
    return input.toUpperCase();
  },
};

export default plugin;
