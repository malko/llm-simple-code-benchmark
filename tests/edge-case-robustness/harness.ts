// Hidden grading harness — copied next to the agent's top-n-frequent.ts and
// compiled/run by test.ts. Not part of the agent's workspace (context/).
import { topNFrequent } from './top-n-frequent';

const results: Record<string, boolean> = {};

function eq(actual: number[], expected: number[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// --- Happy path ---
results.basicFrequencyOrder = eq(topNFrequent([1, 2, 2, 3, 3, 3], 2), [3, 2]);
results.singleElement = eq(topNFrequent([5], 1), [5]);
results.tieBrokenByFirstAppearance = eq(topNFrequent([1, 1, 2, 2, 3], 3), [1, 2, 3]);

// --- Edge cases ---
results.emptyArray = eq(topNFrequent([], 5), []);
results.zeroN = eq(topNFrequent([1, 2, 3], 0), []);
results.negativeN = eq(topNFrequent([1, 2, 3], -1), []);
results.emptyAndZeroN = eq(topNFrequent([], 0), []);
results.nGreaterThanDistinct = eq(topNFrequent([7, 7, 7, 7], 5), [7]);
results.negativeNumbers = eq(topNFrequent([-1, -1, -2, -3, -3, -3], 2), [-3, -1]);
results.largeNumbers = eq(topNFrequent([1_000_000_000, 1_000_000_000, 2], 1), [1_000_000_000]);
results.allTiesFirstAppearanceOrder = eq(topNFrequent([3, 1, 2], 2), [3, 1]);

console.log(JSON.stringify(results));
