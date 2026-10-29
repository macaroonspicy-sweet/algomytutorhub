// Minimal dependency-free HTML sanitizer for rich-text content that is
// rendered via dangerouslySetInnerHTML. Strips scripts, event handlers,
// and dangerous URL schemes (javascript:, data:, vbscript:).
export function sanitizeHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, link, style, meta, base, form, svg, math').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if (['href', 'src', 'xlink:href', 'action', 'formaction', 'background', 'poster', 'cite'].includes(name)) {
        const val = (attr.value || '').trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('vbscript:') || val.startsWith('data:')) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });
  return doc.body ? doc.body.innerHTML : '';
}