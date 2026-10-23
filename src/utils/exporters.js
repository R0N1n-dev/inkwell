import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { bytesToBase64 } from './format.js';

/** Minimal but readable HTML -> Markdown conversion. */
export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const walk = (node) => {
    let out = '';
    for (const el of node.childNodes) {
      if (el.nodeType === 3) {
        out += el.textContent;
        continue;
      }
      if (el.nodeType !== 1) continue;
      const inner = walk(el);
      switch (el.tagName) {
        case 'H1': out += `\n# ${inner}\n\n`; break;
        case 'H2': out += `\n## ${inner}\n\n`; break;
        case 'H3': out += `\n### ${inner}\n\n`; break;
        case 'STRONG': case 'B': out += `**${inner}**`; break;
        case 'EM': case 'I': out += `*${inner}*`; break;
        case 'S': case 'DEL': out += `~~${inner}~~`; break;
        case 'CODE': out += `\`${inner}\``; break;
        case 'A': out += `[${inner}](${el.getAttribute('href') || ''})`; break;
        case 'PRE': out += `\n\`\`\`\n${inner}\n\`\`\`\n\n`; break;
        case 'BLOCKQUOTE': out += `\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`; break;
        case 'LI': {
          const checked = el.classList.contains('ql-checked-list') || el.getAttribute('data-checked') === 'true';
          const unordered = el.parentElement?.tagName === 'UL';
          const bullet = el.getAttribute('data-checked') != null
            ? checked ? '- [x] ' : '- [ ] '
            : unordered ? '- ' : '1. ';
          out += `${bullet}${inner.trim()}\n`;
          break;
        }
        case 'UL': case 'OL': out += `\n${inner}\n`; break;
        case 'P': case 'DIV': out += `${inner}\n\n`; break;
        case 'FIGURE': out += `\n![attachment](${el.getAttribute('data-att-id') || ''})\n\n`; break;
        case 'BR': out += '\n'; break;
        default: out += inner;
      }
    }
    return out;
  };
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

/** Self-contained HTML export (attachments embedded as base64). */
export async function buildStandaloneHtml(note, fields, attachmentBytes) {
  const doc = new DOMParser().parseFromString(fields.content || '', 'text/html');
  for (const fig of doc.querySelectorAll('figure[data-att-id]')) {
    const id = fig.getAttribute('data-att-id');
    const entry = attachmentBytes[id];
    const img = doc.createElement('img');
    if (entry) img.src = `data:${entry.type};base64,${bytesToBase64(entry.bytes)}`;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '12px';
    fig.replaceWith(img);
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fields.title || 'Inkwell note')}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.65;color:#1b1e28}
h1{font-size:30px}img{max-width:100%}blockquote{border-left:4px solid #2EC4B6;margin:0;padding:8px 16px;background:#f0fbfa}
pre{background:#f4f4f5;padding:12px;border-radius:10px;overflow:auto}</style></head>
<body><h1>${escapeHtml(fields.title || 'Untitled')}</h1>${doc.body.innerHTML}
<hr><small>Exported from Inkwell on ${new Date().toLocaleString()}</small></body></html>`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Write a text file to device Documents (native) or trigger a download (web). */
export async function saveTextFile(name, text, mime = 'text/plain') {
  if (Capacitor.isNativePlatform()) {
    const dir = `Inkwell`;
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true });
    } catch {
      /* exists */
    }
    const res = await Filesystem.writeFile({
      path: `${dir}/${name}`,
      data: text,
      encoding: Encoding.UTF8,
      directory: Directory.Documents,
      recursive: true
    });
    return res.uri;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

export async function saveBinaryFile(name, bytes, mime) {
  const b64 = bytesToBase64(bytes);
  if (Capacitor.isNativePlatform()) {
    const dir = `Inkwell`;
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true });
    } catch {
      /* exists */
    }
    const res = await Filesystem.writeFile({
      path: `${dir}/${name}`,
      data: b64,
      directory: Directory.Documents,
      recursive: true
    });
    return res.uri;
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

export async function shareText(title, text) {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title, text });
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}
