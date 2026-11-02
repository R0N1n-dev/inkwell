package com.inkwell.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** 2x2 quick-capture widget: newest note + one tap to jot something down. */
public class InkwellWidgetSmall extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] widgetIds) {
        render(context, mgr, widgetIds);
    }

    /** Repaint every instance from the current snapshot. */
    public static void render(Context context, AppWidgetManager mgr, int[] widgetIds) {
        int total = WidgetStore.readTotal(context);
        String last = WidgetStore.readFirstNoteTitle(context);
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_small);
            views.setTextViewText(R.id.widget_count, String.valueOf(total));
            views.setTextViewText(R.id.widget_last, last.isEmpty()
                    ? context.getString(R.string.widget_empty_short)
                    : last);
            // + writes straight away; tapping the body opens the action sheet.
            views.setOnClickPendingIntent(R.id.widget_add, WidgetStore.quickCaptureIntent(context, 100 + id));
            views.setOnClickPendingIntent(R.id.widget_root, WidgetStore.actionSheetIntent(context, 200 + id));
            mgr.updateAppWidget(id, views);
        }
    }
}
