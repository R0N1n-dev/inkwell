package com.inkwell.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** 2x2 quick-capture widget. */
public class InkwellWidgetSmall extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] widgetIds) {
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_small);
            int total = WidgetStore.readTotal(context);
            views.setTextViewText(R.id.widget_count, total == 1 ? "1 note" : total + " notes");
            views.setOnClickPendingIntent(R.id.widget_add, WidgetStore.openAppIntent(context, "new_note", null, 100 + id));
            views.setOnClickPendingIntent(R.id.widget_root, WidgetStore.openAppIntent(context, "new_note", null, 200 + id));
            mgr.updateAppWidget(id, views);
        }
    }
}
