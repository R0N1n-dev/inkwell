package com.inkwell.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Persists the note snapshot for widgets and triggers their updates. */
public class WidgetStore {

    public static final String PREFS = "inkwell_widgets";
    public static final String KEY_DATA = "data";
    public static final String ACTION_REFRESH = "com.inkwell.notes.WIDGET_REFRESH";

    public static void save(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_DATA, json).apply();
    }

    public static String read(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_DATA, "");
    }

    public static JSONObject readSnapshot(Context context) {
        try {
            String raw = read(context);
            if (raw == null || raw.isEmpty()) return null;
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public static JSONObject latestNote(Context context) {
        JSONObject snapshot = readSnapshot(context);
        if (snapshot == null) return null;
        JSONArray notes = snapshot.optJSONArray("notes");
        if (notes == null || notes.length() == 0) return null;
        JSONObject newest = null;
        long newestAt = -1L;
        for (int i = 0; i < notes.length(); i++) {
            JSONObject note = notes.optJSONObject(i);
            if (note == null) continue;
            long updated = note.optLong("updated", 0L);
            if (updated > newestAt) {
                newestAt = updated;
                newest = note;
            }
        }
        return newest;
    }

    public static int readTotal(Context context) {
        JSONObject snapshot = readSnapshot(context);
        return snapshot == null ? 0 : snapshot.optInt("total", 0);
    }

    /**
     * Refresh both widget sizes from the latest snapshot. The static update
     * methods are called directly (instead of relying on an ordered broadcast)
     * so a widget can never be skipped — and the list adapter is notified only
     * for the provider that actually owns a list.
     */
    public static void refreshWidgets(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);

        try {
            int[] largeIds = mgr.getAppWidgetIds(new ComponentName(context, InkwellWidgetLarge.class));
            if (largeIds != null && largeIds.length > 0) {
                for (int id : largeIds) InkwellWidgetLarge.updateWidget(context, mgr, id);
                mgr.notifyAppWidgetViewDataChanged(largeIds, R.id.widget_list);
            }
        } catch (Exception e) {
            // A broken widget host must never stop the other widget from updating.
        }

        try {
            int[] smallIds = mgr.getAppWidgetIds(new ComponentName(context, InkwellWidgetSmall.class));
            if (smallIds != null && smallIds.length > 0) {
                for (int id : smallIds) InkwellWidgetSmall.updateWidget(context, mgr, id);
            }
        } catch (Exception e) {
            // ignore
        }
    }

    /** PendingIntent that opens the app with an Inkwell action extra. */
    public static PendingIntent openAppIntent(Context context, String action, String noteId, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("inkwell_action", action);
        if (noteId != null) intent.putExtra("inkwell_id", noteId);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Collection widgets merge fill-in extras (the note id) into their click
     * template, which Android only allows for mutable PendingIntents.
     */
    public static PendingIntent openNoteTemplate(Context context, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("inkwell_action", "open_note");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }
}
