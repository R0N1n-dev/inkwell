import Quill from 'quill';

let registered = false;

/**
 * A block-embed blot for note attachments (images).
 * Serialises as <figure class="ink-att-image" data-att-id="..."><img></figure>
 * so the HTML stored in the DB references attachments by id instead of
 * embedding huge base64 strings. Real blob URLs are injected at render time.
 */
export function registerAttImageBlot() {
  if (registered) return;
  registered = true;

  const BlockEmbed = Quill.import('blots/block/embed');

  class AttImageBlot extends BlockEmbed {
    static blotName = 'attImage';
    static tagName = 'FIGURE';
    static className = 'ink-att-image';

    static create(id) {
      const node = super.create();
      node.setAttribute('data-att-id', id || '');
      node.setAttribute('contenteditable', 'false');
      const img = node.ownerDocument.createElement('img');
      img.alt = 'attachment';
      node.appendChild(img);
      return node;
    }

    static value(node) {
      return node.getAttribute('data-att-id') || '';
    }
  }

  Quill.register(AttImageBlot, true);
}
