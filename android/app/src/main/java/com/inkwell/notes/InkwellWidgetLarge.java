package com.inkwell.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * 4x2 notes widget: today's journal plus recent/pinned notes, quick capture,
 * journal and refresh.
 *
 * Rows are plain RemoteViews instead of a RemoteViewsService list, so one update
 * repaints titles, dates and the count atomically — a note captured from the
 * home screen appears the moment it is saved, with no adapter to bind and no
 * loading placeholder. The number of rows follows the widget's height.
 */
public class InkwellWidgetLarge extends AppWidgetProvider {

    /** Layout has room for this many rows; extra ones stay gone. */
    private static final int MAX_ROWS = 5;
    /** Roughly one two-line row, plus the header, in dp. */
    private static final int ROW_HEIGHT_DP = 38;
    private static final int HEADER_DP = 46;

    /** Per-row view ids, in order. */
    private static final int[][] ROW_IDS = {
            {R.id.row1, R.id.row1_title, R.id.row1_date, R.id.row1_snippet, R.id.row1_pin, R.id.row1_color},
            {R.id.row2, R.id.row2_title, R.id.row2_date, R.id.row2_snippet, R.id.row2_pin, R.id.row2_color},
            {R.id.row3, R.id.row3_title, R.id.row3_date, R.id.row3_snippet, R.id.row3_pin, R.id.row3_color},
            {R.id.row4, R.id.row4_title, R.id.row4_date, R.id.row4_snippet, R.id.row4_pin, R.id.row4_color},
            {R.id.row5, R.id.row5_title, R.id.row5_date, R.id.row5_snippet, R.id.row5_pin, R.id.row5_color}
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] widgetIds) {
        render(context, mgr, widgetIds);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, Bundle options) {
        render(context, mgr, new int[]{id});
    }

    /** Repaint every instance from the current snapshot. */
    public static void render(Context context, AppWidgetManager mgr, int[] widgetIds) {
        List<JSONObject> rows = rows(context);
        String count = WidgetStore.readCountLabel(context);

        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_large);
            views.setTextViewText(R.id.widget_count, count);

            // + captures straight away; the header (with its chevron) opens the
            // action sheet, which is where voice, journal and search live.
            views.setOnClickPendingIntent(R.id.widget_add, WidgetStore.quickCaptureIntent(context, 300 + id));
            views.setOnClickPendingIntent(R.id.widget_journal, WidgetStore.openAppIntent(context, "daily", null, 350 + id));
            views.setOnClickPendingIntent(R.id.widget_header, WidgetStore.actionSheetIntent(context, 400 + id));

            Intent refresh = new Intent(context, InkwellWidgetLarge.class);
            refresh.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            refresh.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{id});
            views.setOnClickPendingIntent(
                    R.id.widget_refresh,
                    PendingIntent.getBroadcast(
                            context, 500 + id, refresh,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

            int fit = (int) Math.floor((availableDp(mgr, id) - HEADER_DP) / ROW_HEIGHT_DP);
            fit = Math.max(1, Math.min(MAX_ROWS, fit));

            for (int i = 0; i < MAX_ROWS; i++) {
                if (i < fit && i < rows.size()) bindRow(context, views, id, i, rows.get(i));
                else views.setViewVisibility(ROW_IDS[i][0], View.GONE);
            }
            views.setViewVisibility(R.id.widget_empty, rows.isEmpty() ? View.VISIBLE : View.GONE);
            if (rows.isEmpty()) views.setTextViewText(R.id.widget_empty, context.getString(R.string.widget_empty));

            mgr.updateAppWidget(id, views);
        }
    }

    /** Widget height in dp; launchers report it as min/max options. */
    private static float availableDp(AppWidgetManager mgr, int widgetId) {
        Bundle options = mgr.getAppWidgetOptions(widgetId);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (height <= 0) height = 140;
        return height;
    }

    private static void bindRow(Context context, RemoteViews views, int widgetId, int index, JSONObject note) {
        int[] ids = ROW_IDS[index];
        boolean isDaily = note.optBoolean("daily", false);
        boolean pending = note.optBoolean("pending", false);
        String color = note.optString("color", "");

        views.setViewVisibility(ids[0], View.VISIBLE);
        views.setTextViewText(ids[1], isDaily
                ? context.getString(R.string.widget_today)
                : note.optString("title", "Untitled"));

        if (isDaily) {
            int words = note.optInt("words", 0);
            views.setTextViewText(ids[3], words > 0
                    ? context.getString(R.string.widget_words_today, words)
                    : context.getString(R.string.widget_start_today));
            views.setTextViewText(ids[2], "");
            views.setViewVisibility(ids[4], View.VISIBLE);
            views.setImageViewResource(ids[4], R.drawable.widget_ic_journal);
        } else {
            views.setTextViewText(ids[3], note.optString("snippet", ""));
            views.setViewVisibility(ids[4], note.optBoolean("pinned", false) ? View.VISIBLE : View.GONE);
            views.setImageViewResource(ids[4], R.drawable.widget_ic_pin);
            if (pending) {
                views.setTextViewText(ids[2], context.getString(R.string.widget_queued));
                views.setTextColor(ids[2], 0xFF2EC4B6);
            } else {
                views.setTextViewText(ids[2], relative(note.optLong("updated", System.currentTimeMillis())));
                views.setTextColor(ids[2], 0xFF6B7180);
            }
        }

        views.setViewVisibility(ids[5], color.isEmpty() ? View.GONE : View.VISIBLE);
        views.setInt(ids[5], "setBackgroundColor", noteColor(color));

        // one PendingIntent per row: there is no adapter to fill in a template
        PendingIntent click = isDaily
                ? WidgetStore.openAppIntent(context, "daily", null, 700 + widgetId * 10 + index)
                : WidgetStore.openAppIntent(context, "open_note", note.optString("id", ""), 700 + widgetId * 10 + index);
        views.setOnClickPendingIntent(ids[0], click);
    }

    /** Today's journal first, then the note list from the snapshot. */
    private static List<JSONObject> rows(Context context) {
        List<JSONObject> out = new ArrayList<>();
        try {
            String raw = WidgetStore.read(context);
            if (raw == null || raw.isEmpty()) return out;
            JSONObject root = new JSONObject(raw);

            JSONObject daily = root.optJSONObject("daily");
            if (daily != null) {
                JSONObject row = new JSONObject(daily.toString());
                row.put("daily", true);
                out.add(row);
            }

            JSONArray notes = root.optJSONArray("notes");
            if (notes != null) {
                for (int i = 0; i < notes.length() && out.size() < MAX_ROWS; i++) {
                    out.add(notes.getJSONObject(i));
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static int noteColor(String id) {
        switch (id == null ? "" : id) {
            case "red": return 0xFFE5484D;
            case "orange": return 0xFFF76B15;
            case "yellow": return 0xFFFFC53D;
            case "green": return 0xFF46A758;
            case "teal": return 0xFF12A594;
            case "blue": return 0xFF3E63DD;
            case "purple": return 0xFF8E4EC6;
            case "pink": return 0xFFD6409F;
            default: return 0xFF2EC4B6;
        }
    }

    /** "now", "12m", "3h", "yesterday", then a plain date. */
    private static String relative(long ts) {
        long diff = System.currentTimeMillis() - ts;
        if (diff < 0) return "now";
        long minutes = diff / 60000L;
        if (minutes < 1) return "now";
        if (minutes < 60) return minutes + "m";
        long hours = minutes / 60;
        if (hours < 24) return hours + "h";
        if (hours < 48) return "yesterday";
        return new SimpleDateFormat("MMM d", Locale.getDefault()).format(new Date(ts));
    }
}
