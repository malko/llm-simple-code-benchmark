type PageComponent = (params: Record<string, string>) => Promise<HTMLElement | string>;

class Router {
  private routes: { pattern: RegExp; keys: string[]; page: PageComponent }[] = [];

  on(path: string, page: PageComponent): void {
    const keys: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; });
    this.routes.push({ pattern: new RegExp('^' + patternStr + '$'), keys, page });
  }

  async navigate(url?: string): Promise<void> {
    const hash = (url || location.hash.slice(1) || '/');
    for (const { pattern, keys, page } of this.routes) {
      const match = hash.match(pattern);
      if (match) {
        const params: Record<string, string> = {};
        keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
        const app = document.getElementById('app')!;
        app.innerHTML = '<div class="loading">Loading...</div>';
        try {
          const content = await page(params);
          app.innerHTML = '';
          if (typeof content === 'string') {
            app.innerHTML = content;
          } else {
            app.appendChild(content);
          }
        } catch (err) {
          app.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
        }
        return;
      }
    }
    document.getElementById('app')!.innerHTML = '<div class="empty-state"><h2>404</h2><p>Page not found</p></div>';
  }

  init(): void {
    window.addEventListener('hashchange', () => this.navigate());
    document.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('[data-nav]');
      if (link) {
        e.preventDefault();
        const href = (link as HTMLAnchorElement).getAttribute('href');
        if (href) {
          history.pushState(null, '', href);
          this.navigate();
        }
      }
    });
    this.navigate();
  }
}

export const router = new Router();
