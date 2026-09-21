import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

// Render trusted-author Markdown to sanitized HTML for dangerouslySetInnerHTML.
export function renderMarkdown(src) {
  const html = marked.parse(src || '');
  return DOMPurify.sanitize(html);
}
