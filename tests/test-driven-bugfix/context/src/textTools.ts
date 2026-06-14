export function dedupeWords(text: string): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!seen.has(word)) {
      seen.add(word);
      result.push(word);
    }
  }
  return result.join(' ');
}

export function longestWord(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}
