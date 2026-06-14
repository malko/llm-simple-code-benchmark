import { Plugin } from '../types';

const plugin: Plugin = {
  name: 'slugify',
  description:
    "Converts the input into a URL-friendly slug: lowercases it, replaces runs of whitespace with a single hyphen, and removes any character that isn't a lowercase letter, digit, or hyphen.",
  run(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  },
};

export default plugin;
