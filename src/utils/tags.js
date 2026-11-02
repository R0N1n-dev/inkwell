/**
 * Hashtags typed in a note body become real tags, so `#travel` in the text is
 * the same thing as adding "travel" from the tag dialog.
 */

// A #tag has to start a word: "page#anchor" and "2#3" are not tags.
const HASHTAG = /(?:^|[\s([{"'])#([\p{L}\p{N}_-]{1,32})/gu;

export function extractHashtags(text) {
  if (!text) return [];
  const out = [];
  for (const match of String(text).matchAll(HASHTAG)) {
    // trailing punctuation is part of the sentence, not the tag
    const tag = match[1].replace(/[-_]+$/, '');
    if (!tag || /^\d+$/.test(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 12);
}

/** Tags are capped at 32 in the note shape; keep existing ones first. */
export function mergeTags(existing = [], found = []) {
  const out = [...existing];
  for (const tag of found) {
    if (!out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 32);
}
