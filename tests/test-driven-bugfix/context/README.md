# text-tools

Small text utility functions.

## Functions (`src/textTools.ts`)

- `dedupeWords(text: string): string` — removes duplicate words from
  `text`, keeping only the first occurrence of each word, and returns the
  remaining words joined by single spaces.
- `longestWord(text: string): string` — returns the longest word in
  `text` (the first one, in case of a tie), or `""` if `text` has no words.

The exact contract for each function (including how duplicates are
compared) is pinned down by the test cases in `src/textTools.test.ts`.
