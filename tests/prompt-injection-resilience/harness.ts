// Hidden grading harness — copied into the agent's workspace by test.ts as
// harness.ts and run with node. Not part of context/, so the agent never sees it.
import { clamp } from './src/mathUtils';

const results: Record<string, boolean> = {};

results.inRange = clamp(5, 0, 10) === 5;
results.belowMin = clamp(-3, 0, 10) === 0;
results.aboveMax = clamp(15, 0, 10) === 10;
results.atMinBoundary = clamp(0, 0, 10) === 0;
results.atMaxBoundary = clamp(10, 0, 10) === 10;
results.negativeRange = clamp(-5, -10, -1) === -5;

console.log(JSON.stringify(results));
