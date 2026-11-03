package com.inkwell.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** 2x2 quick-capture widget that also surfaces the latest note. */
public class InkwellWidgetSmall extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] widgetIds) {
        for (int id : widgetIds) updateWidget(context, mgr, id);
    }

    public static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_small);
        int total = WidgetStore.readTotal(context);
        views.setTextViewText(R.id.widget_count, total == 1 ? "1 note" : total + " notes");

        JSONObject latest = WidgetStore.latestNote(context);
        String noteId = latest == null ? "" : latest.optString("id", "");
        String title = latest == null ? context.getString(R.string.widget_no_notes)
                : latest.optString("title", "").trim();
        if (title.isEmpty()) title = context.getString(R.string.widget_untitled);
        String snippet = latest == null ? context.getString(R.string.widget_tap_to_add)
                : latest.optString("snippet", "");
        views.setTextViewText(R.id.widget_latest_title, title);
        views.setTextViewText(R.id.widget_latest_snippet, snippet);
        views.setViewVisibility(R.id.widget_latest_snippet, snippet.isEmpty() ? View.GONE : View.VISIBLE);

        views.setOnClickPendingIntent(R.id.widget_add,
                WidgetStore.openAppIntent(context, "new_note", null, 100 + id));
        views.setOnClickPendingIntent(R.id.widget_root,
                noteId.isEmpty()
                        ? WidgetStore.openAppIntent(context, "new_note", null, 200 + id)
                        : WidgetStore.openAppIntent(context, "open_note", noteId, 200 + id));
        mgr.updateAppWidget(id, views);
    }
}
