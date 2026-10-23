package com.inkwell.notes;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Backs the ListView of the large widget from the SharedPreferences snapshot. */
public class WidgetNotesService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new NotesFactory(getApplicationContext());
    }

    static class NotesFactory implements RemoteViewsFactory {

        private final Context context;
        private final List<JSONObject> notes = new ArrayList<>();
        private final SimpleDateFormat fmt = new SimpleDateFormat("MMM d, HH:mm", Locale.US);

        NotesFactory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
            reload();
        }

        @Override
        public void onDataSetChanged() {
            reload();
        }

        private void reload() {
            notes.clear();
            try {
                String raw = WidgetStore.read(context);
                if (raw == null || raw.isEmpty()) return;
                JSONArray arr = new JSONObject(raw).optJSONArray("notes");
                if (arr == null) return;
                for (int i = 0; i < arr.length(); i++) notes.add(arr.getJSONObject(i));
            } catch (Exception ignored) {
            }
        }

        @Override
        public void onDestroy() {
            notes.clear();
        }

        @Override
        public int getCount() {
            return notes.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            JSONObject note = notes.get(position);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_note_item);
            try {
                views.setTextViewText(R.id.item_title, note.optString("title", "Untitled"));
                String snippet = note.optString("snippet", "");
                views.setTextViewText(R.id.item_snippet, snippet);
                views.setViewVisibility(R.id.item_snippet, snippet.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
                views.setTextViewText(R.id.item_date, fmt.format(new Date(note.optLong("updated", System.currentTimeMillis()))));
                views.setViewVisibility(R.id.item_pin, note.optBoolean("pinned", false) ? android.view.View.VISIBLE : android.view.View.GONE);
                String color = note.optString("color", "");
                views.setViewVisibility(R.id.item_color, color.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
                views.setInt(R.id.item_color, "setBackgroundColor", parseNoteColor(color));
            } catch (Exception ignored) {
            }

            Intent fillIn = new Intent();
            try {
                fillIn.putExtra("inkwell_action", "open_note");
                fillIn.putExtra("inkwell_id", note.optString("id", ""));
            } catch (Exception ignored) {
            }
            views.setOnClickFillInIntent(R.id.item_root, fillIn);
            return views;
        }

        private int parseNoteColor(String id) {
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

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
