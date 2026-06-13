declare const require: {
  config: (opts: Record<string, unknown>) => void;
  (deps: string[], cb: (...mods: unknown[]) => void): void;
};

const MONACO_CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs';

let monacoPromise: Promise<typeof import('monaco-editor')> | null = null;

/** Loads the Monaco editor from CDN once and caches the promise for reuse across pages. */
export function loadMonaco(): Promise<typeof import('monaco-editor')> {
  if (monacoPromise) return monacoPromise;

  monacoPromise = new Promise((resolve) => {
    if (!document.querySelector('#monaco-loader')) {
      const script = document.createElement('script');
      script.id = 'monaco-loader';
      script.src = `${MONACO_CDN}/loader.js`;
      document.head.appendChild(script);
    }

    const check = () => {
      if (typeof require === 'undefined' || typeof require.config === 'undefined') {
        setTimeout(check, 100);
        return;
      }
      require.config({ paths: { vs: MONACO_CDN } });
      require(['vs/editor/editor.main'], () => resolve((window as unknown as { monaco: typeof import('monaco-editor') }).monaco));
    };
    check();
  });

  return monacoPromise;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  json: 'json', go: 'go', py: 'python', md: 'markdown', txt: 'plaintext',
  html: 'html', css: 'css', scss: 'css', sh: 'shell', bash: 'shell',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', sql: 'sql', rs: 'rust',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', xml: 'xml',
};

export function languageForFile(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_BY_EXT[ext] || 'plaintext';
}
