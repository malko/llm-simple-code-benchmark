import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'repeat-twice',
  description: 'Returns the input repeated twice, with no separator.',
  run(input: string): string {
    return input + input;
  },
};

export default plugin;
