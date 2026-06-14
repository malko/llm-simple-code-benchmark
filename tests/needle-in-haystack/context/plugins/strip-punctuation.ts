import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'strip-punctuation',
  description: "Removes common punctuation characters (.,!?;:'\"-) from the input.",
  run(input: string): string {
    return input.replace(/[.,!?;:'"-]/g, '');
  },
};

export default plugin;
