const STORAGE_PREFIX = 'llm-code-bench:card-open:';

/**
 * Restores the persisted open/closed state of `<details class="card">` elements within
 * `container` (keyed by their `<summary>` text) and persists future toggles to localStorage,
 * so a card's collapsed state survives re-renders and page navigation.
 */
export function initCollapsibleCards(container: ParentNode): void {
  container.querySelectorAll('details.card').forEach(el => {
    const details = el as HTMLDetailsElement;
    const key = details.querySelector('summary')?.textContent?.trim();
    if (!key) return;
    const storageKey = STORAGE_PREFIX + key;
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) details.open = stored === '1';
    details.addEventListener('toggle', () => {
      localStorage.setItem(storageKey, details.open ? '1' : '0');
    });
  });
}
