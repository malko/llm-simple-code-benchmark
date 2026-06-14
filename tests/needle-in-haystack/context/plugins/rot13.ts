import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'rot13',
  description: 'Applies the ROT13 substitution cipher to letters in the input, leaving non-letter characters unchanged.',
  run(input: string): string {
    return input.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  },
};

export default plugin;
