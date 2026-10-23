import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './cap.js';
import { excerpt } from '../utils/format.js';

let actionHandler = null;

export function notificationIdFor(noteId) {
  // stable 32-bit hash -> positive int
  let h = 0;
  const s = `note:${noteId}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2000000000 + 1000;
}

export const DAILY_NOTE_ID = 7;

export async function initNotifications(onAction) {
  actionHandler = onAction;
  if (!isNative) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (evt) => {
    const extra = evt.notification?.extra || {};
    actionHandler?.(extra);
  });
}

export async function ensurePermission() {
  if (!isNative) return true;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'granted') return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

export async function scheduleReminder(note) {
  if (!isNative || !note.reminderAt) return false;
  if (!(await ensurePermission())) return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationIdFor(note.id),
        title: note.title || 'Reminder',
        body: excerpt(note.contentText, 90) || 'You set a reminder for this note',
        schedule: { at: new Date(note.reminderAt), allowWhileIdle: true },
        extra: { noteId: note.id, kind: 'reminder' },
        smallIcon: 'ic_stat_inkwell',
        largeIcon: 'ic_launcher_foreground'
      }
    ]
  });
  return true;
}

export async function cancelReminder(noteId) {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: notificationIdFor(noteId) }] });
}

/** Optional daily "write something" nudge. hour/minute in local time. */
export async function scheduleDailyReminder(enabled, hour = 20, minute = 0) {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_NOTE_ID }] });
  if (!enabled) return;
  if (!(await ensurePermission())) return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_NOTE_ID,
        title: 'Time to capture a thought',
        body: 'Open Inkwell and jot something down.',
        schedule: { every: 'day', at: { hour, minute } },
        extra: { kind: 'daily' },
        smallIcon: 'ic_stat_inkwell'
      }
    ]
  });
}

/** Fires when a scheduled reminder time passes while the app is open. */
export async function sweepDueReminders(onDue) {
  const { getDB } = await import('../db/database.js');
  const db = await getDB();
  const now = Date.now();
  const due = await db.notes
    .find({
      selector: {
        trashed: false,
        reminderNotified: false,
        reminderAt: { $gt: 0, $lt: now }
      }
    })
    .exec();
  for (const doc of due) {
    await doc.incrementalPatch({ reminderNotified: true });
    onDue?.(doc);
  }
  return due.length;
}
