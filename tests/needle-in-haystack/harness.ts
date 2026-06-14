// Hidden grading harness — copied into the agent's workspace by test.ts and
// run with node. Not part of context/, so the agent never sees it.
import plugin from './plugins/title-case';

const results: Record<string, boolean> = {};

results.basicTwoWords = plugin.run('hello world') === 'Hello World';
results.allCapsInput = plugin.run('HELLO WORLD') === 'Hello World';
results.threeWords = plugin.run('two three four') === 'Two Three Four';
results.singleLetterWords = plugin.run('a b c') === 'A B C';
results.emptyInput = plugin.run('') === '';
results.alreadyCorrect = plugin.run('Already Title Case') === 'Already Title Case';
results.namePreserved = plugin.name === 'title-case';
results.descriptionPreserved =
  plugin.description ===
  'Capitalizes the first letter of every word in the input and lowercases the rest of each word.';

console.log(JSON.stringify(results));
