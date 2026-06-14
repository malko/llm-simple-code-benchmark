function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(?<!_)_([^_\s][^_]*?)_(?!_)/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function isBlockStart(line: string): boolean {
  return /^#{1,6}\s/.test(line)
    || /^\s*[-*]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line)
    || /^```/.test(line)
    || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())
    || line.includes('|');
}

/** Renders a (LLM-generated) Markdown report into sanitized HTML. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) { html.push(`</${listType}>`); listType = null; }
  };

  while (i < lines.length) {
    const line = lines[i];

    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      closeList();
      const lang = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim()) && line.trim().length >= 3) {
      closeList();
      html.push('<hr>');
      i++;
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      closeList();
      const level = headerMatch[1].length;
      html.push(`<h${level}>${renderInline(headerMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      closeList();
      const headerCells = splitTableRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      html.push('<div style="overflow-x:auto"><table class="stats-table"><thead><tr>'
        + headerCells.map(c => `<th>${renderInline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + bodyRows.map(r => '<tr>' + r.map(c => `<td>${renderInline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
      html.push(`<li>${renderInline(ulMatch[1])}</li>`);
      i++;
      continue;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
      html.push(`<li>${renderInline(olMatch[1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    closeList();
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${paraLines.map(renderInline).join('<br>')}</p>`);
  }
  closeList();
  return html.join('\n');
}

/** Wraps a rendered report into a standalone, styled HTML document for export. */
export function buildStandaloneHtml(title: string, md: string): string {
  const body = renderMarkdown(md);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#1a1a2e; color:#eee; max-width:900px; margin:2rem auto; padding:0 1rem 3rem; line-height:1.6; }
  h1, h2, h3, h4 { color:#e94560; margin:1.5rem 0 0.75rem; }
  h1:first-child { margin-top:0; }
  table { border-collapse:collapse; width:100%; margin:1rem 0; font-size:0.9rem; }
  th, td { border:1px solid #333; padding:0.4rem 0.6rem; text-align:left; }
  th { background:#16213e; }
  code { background:#0f3460; padding:0.1rem 0.3rem; border-radius:4px; font-size:0.85em; }
  pre { background:#0f3460; padding:0.75rem; border-radius:6px; overflow:auto; }
  pre code { background:none; padding:0; }
  hr { border-color:#333; margin:1.5rem 0; }
  ul, ol { margin:0.5rem 0 0.5rem 1.5rem; }
  a { color:#64b5f6; }
  .report-meta { color:#aaa; font-size:0.85rem; margin-bottom:1.5rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="report-meta">Generated by LLM Code Bench on ${escapeHtml(new Date().toLocaleString())}</p>
${body}
</body>
</html>
`;
}
