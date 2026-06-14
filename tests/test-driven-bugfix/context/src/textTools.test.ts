import { dedupeWords, longestWord } from './textTools';

interface Case {
  name: string;
  actual: unknown;
  expected: unknown;
}

const cases: Case[] = [
  {
    name: 'dedupeWords is case-insensitive (keeps first-seen casing)',
    actual: dedupeWords('the Cat sat on the cat mat'),
    expected: 'the Cat sat on mat',
  },
  {
    name: 'dedupeWords removes exact duplicates',
    actual: dedupeWords('a a a b b c'),
    expected: 'a b c',
  },
  {
    name: 'dedupeWords handles an empty string',
    actual: dedupeWords(''),
    expected: '',
  },
  {
    name: 'longestWord returns the longest word',
    actual: longestWord('the quick brown fox jumped'),
    expected: 'jumped',
  },
  {
    name: 'longestWord breaks ties by first occurrence',
    actual: longestWord('cat dog owl bee'),
    expected: 'cat',
  },
];

let failed = 0;
for (const c of cases) {
  const actualJson = JSON.stringify(c.actual);
  const expectedJson = JSON.stringify(c.expected);
  if (actualJson === expectedJson) {
    console.log(`PASS: ${c.name}`);
  } else {
    console.log(`FAIL: ${c.name} (expected ${expectedJson}, got ${actualJson})`);
    failed++;
  }
}

if (failed > 0) {
  console.log(`\n${failed} of ${cases.length} test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} tests passed.`);
