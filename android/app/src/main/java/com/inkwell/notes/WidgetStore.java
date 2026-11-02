package com.inkwell.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Persists the note snapshot for widgets, queues widget quick captures and triggers updates. */
public class WidgetStore {

    public static final String PREFS = "inkwell_widgets";
    public static final String KEY_DATA = "data";
    public static final String KEY_CAPTURES = "captures";
    public static final String ACTION_REFRESH = "com.inkwell.notes.WIDGET_REFRESH";

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void save(Context context, String json) {
        prefs(context).edit().putString(KEY_DATA, json).apply();
    }

    public static String readRaw(Context context) {
        return prefs(context).getString(KEY_DATA, "");
    }

    /**
     * Snapshot for the widgets: notes waiting to be imported (captured on the home screen)
     * come first, then the app's own snapshot. Nothing is written here, so a capture is
     * visible immediately after it was taken.
     */
    public static String read(Context context) {
        String raw = readRaw(context);
        JSONArray pending = readCaptures(context);
        if (pending.length() == 0) return raw;
        try {
            JSONObject root = (raw == null || raw.isEmpty()) ? new JSONObject() : new JSONObject(raw);
            JSONArray merged = new JSONArray();
            for (int i = 0; i < pending.length(); i++) merged.put(toNote(pending.getJSONObject(i)));
            JSONArray notes = root.optJSONArray("notes");
            if (notes != null) {
                for (int i = 0; i < notes.length(); i++) merged.put(notes.getJSONObject(i));
            }
            root.put("notes", merged);
            root.put("total", root.optInt("total", 0) + pending.length());
            root.put("pending", pending.length());
            return root.toString();
        } catch (Exception e) {
            return raw;
        }
    }

    public static int readTotal(Context context) {
        try {
            String raw = read(context);
            if (raw == null || raw.isEmpty()) return 0;
            return new JSONObject(raw).optInt("total", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    public static String readFirstNoteTitle(Context context) {
        try {
            JSONArray notes = new JSONObject(read(context)).optJSONArray("notes");
            if (notes == null || notes.length() == 0) return "";
            return notes.getJSONObject(0).optString("title", "");
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * "12 notes", plus "· 1 queued" while captures wait for the app.
     * Empty until the app has pushed a snapshot (fresh widget on a fresh install).
     */
    public static String readCountLabel(Context context) {
        String raw = read(context);
        if (raw == null || raw.isEmpty()) return "";
        int pending = readCaptures(context).length();
        int committed = Math.max(0, readTotal(context) - pending);

        if (committed == 0) return pending == 0 ? "" : (pending == 1 ? "1 queued" : pending + " queued");
        String base = committed == 1 ? "1 note" : committed + " notes";
        if (pending == 0) return base;
        return base + " \u00b7 " + (pending == 1 ? "1 queued" : pending + " queued");
    }

    /* ------------------------------------------------------------------ */
    /* Quick capture queue (native, no WebView needed)                      */
    /* ------------------------------------------------------------------ */

    public static synchronized void addCapture(Context context, String text, boolean pinned) {
        JSONArray arr = readCaptures(context);
        try {
            JSONObject item = new JSONObject();
            item.put("ts", System.currentTimeMillis());
            item.put("text", text);
            item.put("pinned", pinned);
            arr.put(item);
        } catch (Exception ignored) {
        }
        prefs(context).edit().putString(KEY_CAPTURES, arr.toString()).apply();
    }

    public static synchronized JSONArray readCaptures(Context context) {
        String raw = prefs(context).getString(KEY_CAPTURES, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static synchronized void clearCaptures(Context context) {
        prefs(context).edit().remove(KEY_CAPTURES).apply();
    }

    private static JSONObject toNote(JSONObject capture) throws Exception {
        String text = capture.optString("text", "").trim();
        int split = text.indexOf('\n');
        String title = (split < 0 ? text : text.substring(0, split)).trim();
        String snippet = split < 0 ? "" : text.substring(split + 1).trim();
        JSONObject note = new JSONObject();
        note.put("id", "qc:" + capture.optLong("ts", System.currentTimeMillis()));
        note.put("title", title.isEmpty() ? "Untitled" : cut(title, 120));
        note.put("snippet", cut(snippet, 140));
        note.put("updated", capture.optLong("ts", System.currentTimeMillis()));
        note.put("pinned", capture.optBoolean("pinned", false));
        note.put("color", "");
        note.put("pending", true);
        return note;
    }

    private static String cut(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max).trim();
    }

    /**
     * Repaint both widget sizes right now. Done in-process instead of through a
     * broadcast so a capture saved from the home screen is on screen immediately
     * — broadcasts can be coalesced or dropped while the process is going away.
     */
    public static void refreshWidgets(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);

        int[] small = mgr.getAppWidgetIds(new ComponentName(context, InkwellWidgetSmall.class));
        if (small != null && small.length > 0) InkwellWidgetSmall.render(context, mgr, small);

        int[] large = mgr.getAppWidgetIds(new ComponentName(context, InkwellWidgetLarge.class));
        if (large != null && large.length > 0) InkwellWidgetLarge.render(context, mgr, large);
    }

    /** Intent that opens the app with an Inkwell action extra. */
    public static Intent appIntent(Context context, String action, String noteId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("inkwell_action", action);
        if (noteId != null) intent.putExtra("inkwell_id", noteId);
        return intent;
    }

    /** PendingIntent that opens the app with an Inkwell action extra. */
    public static PendingIntent openAppIntent(Context context, String action, String noteId, int requestCode) {
        return PendingIntent.getActivity(
                context,
                requestCode,
                appIntent(context, action, noteId),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** PendingIntent that opens the launcher action sheet. */
    public static PendingIntent actionSheetIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, WidgetActionSheetActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** PendingIntent that opens the native quick-capture sheet over the home screen. */
    public static PendingIntent quickCaptureIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, QuickCaptureActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
