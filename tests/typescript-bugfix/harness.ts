// Hidden grading harness — copied into the agent's workspace root by test.ts
// and compiled/run from there. Not part of context/, so the agent never sees it.
import { capitalize, truncate, reverseWords } from './src/strings';

const results: Record<string, boolean> = {};

results.capitalizeMixedCase = capitalize('hELLO') === 'Hello';
results.capitalizeLowercase = capitalize('world') === 'World';
results.capitalizeEmpty = capitalize('') === '';

results.truncateLong = truncate('hello world', 8) === 'hello...';
results.truncateShort = truncate('hi', 8) === 'hi';
results.truncateExact = truncate('abcdefgh', 8) === 'abcdefgh';

results.reverseWordsBasic = reverseWords('  the quick fox ') === 'fox quick the';
results.reverseWordsSingle = reverseWords('hello') === 'hello';

console.log(JSON.stringify(results));
