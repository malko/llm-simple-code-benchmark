import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'camel-case',
  description:
    'Converts the input to camelCase: the first word is lowercased and each subsequent word is capitalized, with no separators.',
  run(input: string): string {
    const words = input.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    return words
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join('');
  },
};

export default plugin;
