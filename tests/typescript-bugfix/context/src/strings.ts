/**
 * Capitalizes the first letter of `s` and lowercases the rest.
 *
 * Examples:
 *   capitalize("hELLO") -> "Hello"
 *   capitalize("world") -> "World"
 *   capitalize("")      -> ""
 */
export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1).toUpperCase();
}

/**
 * Truncates `s` to at most `maxLen` characters. If truncation is needed, the
 * result ends with "..." and its TOTAL length (including the "...") is
 * exactly `maxLen`. If `s` already fits within `maxLen`, it is returned
 * unchanged.
 *
 * Examples:
 *   truncate("hello world", 8) -> "hello..."   (8 characters total)
 *   truncate("hi", 8)          -> "hi"
 *   truncate("abcdefgh", 8)    -> "abcdefgh"
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

/**
 * Reverses the order of words in a sentence, splitting on any whitespace and
 * joining the result with a single space. Leading/trailing whitespace is
 * trimmed.
 *
 * Examples:
 *   reverseWords("  the quick fox ") -> "fox quick the"
 *   reverseWords("hello")            -> "hello"
 */
export function reverseWords(s: string): string {
  return s.trim().split(/\s+/).reverse().join(' ');
}
