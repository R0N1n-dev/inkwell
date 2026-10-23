package com.inkwell.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

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

    public static int readTotal(Context context) {
        try {
            String raw = read(context);
            if (raw == null || raw.isEmpty()) return 0;
            return new JSONObject(raw).optInt("total", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    /** Full refresh of both widget sizes. */
    public static void refreshWidgets(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        Class<?>[] providers = {InkwellWidgetSmall.class, InkwellWidgetLarge.class};
        for (Class<?> provider : providers) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, provider));
            if (ids == null || ids.length == 0) continue;
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
            Intent update = new Intent(context, provider);
            update.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(update);
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
}
