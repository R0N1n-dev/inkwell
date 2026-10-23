package com.inkwell.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** 4x2 notes widget: pinned + recent notes list with quick add. */
public class InkwellWidgetLarge extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] widgetIds) {
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_large);

            // list adapter
            Intent svc = new Intent(context, WidgetNotesService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            views.setRemoteAdapter(R.id.widget_list, svc);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);

            // header actions
            views.setOnClickPendingIntent(R.id.widget_add, WidgetStore.openAppIntent(context, "new_note", null, 300 + id));
            views.setOnClickPendingIntent(R.id.widget_header, WidgetStore.openAppIntent(context, "open_app", null, 400 + id));

            Intent refresh = new Intent(context, InkwellWidgetLarge.class);
            refresh.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            refresh.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{id});
            views.setOnClickPendingIntent(
                    R.id.widget_refresh,
                    android.app.PendingIntent.getBroadcast(
                            context, 500 + id, refresh,
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE));

            // list item click template (factory fills in the note id)
            views.setPendingIntentTemplate(R.id.widget_list, WidgetStore.openAppIntent(context, "open_note", null, 600 + id));

            mgr.updateAppWidget(id, views);
            mgr.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
        }
    }
}
