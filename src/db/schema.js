/**
 * RxDB schemas for Inkwell.
 * Kept intentionally simple + index-light so both the Dexie (web) and
 * IndexedDB storages behave identically.
 */

export const noteSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    title: { type: 'string', default: '' },
    /** Quill HTML */
    content: { type: 'string', default: '' },
    /** Plain text projection for search / previews / widgets */
    contentText: { type: 'string', default: '' },
    created: { type: 'number', minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    updated: { type: 'number', minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    pinned: { type: 'boolean', default: false },
    favorite: { type: 'boolean', default: false },
    archived: { type: 'boolean', default: false },
    trashed: { type: 'boolean', default: false },
    deletedAt: { type: 'number', default: 0, minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    /** vault */
    locked: { type: 'boolean', default: false },
    /** AES-GCM ciphertext (base64) of the whole note payload when locked */
    cipher: { type: 'string', default: '' },
    color: { type: 'string', default: '' },
    notebookId: { type: 'string', default: '', maxLength: 64 },
    tags: {
      type: 'array',
      default: [],
      items: { type: 'string', maxLength: 40 },
      maxItems: 32
    },
    /** reminder */
    reminderAt: { type: 'number', default: 0, minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    reminderNotified: { type: 'boolean', default: false },
    /** attachment metadata (binary lives in RxDB attachments) */
    atts: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          size: { type: 'number' }
        },
        required: ['id', 'name', 'type', 'size']
      }
    }
  },
  required: ['id', 'created', 'updated', 'notebookId', 'reminderAt'],
  attachments: {
    type: 'object',
    properties: {}
  },
  indexes: ['updated', 'created', 'notebookId', 'reminderAt']
};

/**
 * Version history snapshots. One row per captured revision of a note's
 * editable payload; pruning keeps the newest `MAX_PER_NOTE` per note.
 */
export const revisionSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    noteId: { type: 'string', maxLength: 64 },
    title: { type: 'string', default: '' },
    content: { type: 'string', default: '' },
    contentText: { type: 'string', default: '' },
    created: { type: 'number', minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    /** 'edit' | 'restore' | 'manual' */
    reason: { type: 'string', default: 'edit' }
  },
  required: ['id', 'noteId', 'created'],
  indexes: ['noteId', 'created']
};

export const notebookSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    title: { type: 'string' },
    description: { type: 'string', default: '' },
    color: { type: 'string', default: '' },
    icon: { type: 'string', default: 'pi pi-book' },
    created: { type: 'number', minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    updated: { type: 'number', minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    sortIndex: { type: 'number', default: 0, minimum: 0, maximum: 10000000000000, multipleOf: 1 }
  },
  required: ['id', 'title', 'created', 'updated'],
  indexes: ['updated']
};

export const settingsSchema = {
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 64 },
    /** JSON string */
    value: { type: 'string', default: '' }
  },
  required: ['key']
};
