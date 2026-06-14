import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'lowercase',
  description: 'Converts the input to all lowercase letters.',
  run(input: string): string {
    return input.toLowerCase();
  },
};

export default plugin;
