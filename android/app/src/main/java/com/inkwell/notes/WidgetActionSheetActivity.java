package com.inkwell.notes;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Launcher action sheet: everything the home-screen widget can do, one tap from
 * the home screen and without opening the app.
 *
 * Deliberately hand-rolled instead of pulling in the Material library: the card
 * is the only surface, so it is a transparent activity with a bottom-anchored
 * panel. Rows are built in code so each one can stagger in, and the panel can be
 * dragged down to dismiss.
 */
public class WidgetActionSheetActivity extends Activity {

    private LinearLayout card;
    private float dragStartY;
    private int touchSlop;
    private boolean dragging;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_action_sheet);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);

        card = findViewById(R.id.sheet_card);
        touchSlop = ViewConfiguration.get(this).getScaledTouchSlop();

        applyInsets();
        buildRows();

        // Tap the transparent area above the panel to dismiss.
        findViewById(R.id.sheet_root).setOnClickListener((v) -> close());
        attachDragToDismiss(findViewById(R.id.sheet_handle_area));
    }

    /* ------------------------------------------------------------------ */
    /* Presentation                                                        */
    /* ------------------------------------------------------------------ */

    /** Keep the last row clear of the gesture bar / nav buttons. */
    @SuppressWarnings("deprecation")
    private void applyInsets() {
        card.post(() -> {
            WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
            int bottom = 0;
            if (insets != null) {
                bottom = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? insets.getInsets(WindowInsets.Type.navigationBars()).bottom
                        : insets.getSystemWindowInsetBottom();
            }
            card.setPadding(
                    card.getPaddingLeft(),
                    card.getPaddingTop(),
                    card.getPaddingRight(),
                    bottom + dp(12));
        });
    }

    private void buildRows() {
        LinearLayout rows = findViewById(R.id.sheet_rows);

        addRow(rows, R.layout.sheet_primary_row, R.drawable.ic_shortcut_new,
                R.string.sheet_write, R.string.sheet_write_sub, this::capture);
        addRow(rows, R.layout.sheet_row, R.drawable.widget_ic_mic,
                R.string.sheet_voice, R.string.sheet_voice_sub, this::dictate);
        addRow(rows, R.layout.sheet_row, R.drawable.widget_ic_journal,
                R.string.sheet_journal, R.string.sheet_journal_sub, () -> openApp("daily"));
        addRow(rows, R.layout.sheet_row, R.drawable.ic_shortcut_search,
                R.string.sheet_search, R.string.sheet_search_sub, () -> openApp("search"));
        addRow(rows, R.layout.sheet_row, R.drawable.ic_shortcut_open,
                R.string.sheet_open, R.string.sheet_open_sub, () -> openApp("open_app"));

        // Stagger the rows in so the sheet unfolds rather than appearing whole.
        for (int i = 0; i < rows.getChildCount(); i++) {
            View row = rows.getChildAt(i);
            row.setAlpha(0f);
            row.setTranslationY(dp(14));
            row.animate()
                    .alpha(1f)
                    .translationY(0f)
                    .setStartDelay(70L + i * 45L)
                    .setDuration(220L)
                    .setInterpolator(new DecelerateInterpolator(1.6f))
                    .start();
        }
    }

    private void addRow(LinearLayout parent, int layout, int icon, int title, int subtitle, Runnable action) {
        View row = LayoutInflater.from(this).inflate(layout, parent, false);
        ((ImageView) row.findViewById(R.id.row_icon)).setImageResource(icon);
        ((TextView) row.findViewById(R.id.row_title)).setText(title);
        ((TextView) row.findViewById(R.id.row_sub)).setText(subtitle);

        // Keep the gap rhythm consistent without an extra divider view.
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(layout == R.layout.sheet_primary_row ? 0 : 4);
        row.setLayoutParams(params);

        row.setOnClickListener((v) -> {
            v.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
            action.run();
        });
        parent.addView(row);
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */

    private void capture() {
        startCapture(false);
    }

    private void dictate() {
        startCapture(true);
    }

    private void startCapture(boolean dictate) {
        Intent intent = new Intent(this, QuickCaptureActivity.class);
        intent.putExtra(QuickCaptureActivity.EXTRA_DICTATE, dictate);
        startActivity(intent);
        close();
    }

    private void openApp(String action) {
        Intent intent = WidgetStore.appIntent(this, action, null);
        startActivity(intent);
        close();
    }

    private void close() {
        finish();
        overridePendingTransition(0, R.anim.sheet_out);
    }

    /* ------------------------------------------------------------------ */
    /* Drag down to dismiss                                                */
    /* ------------------------------------------------------------------ */

    private void attachDragToDismiss(View handleArea) {
        handleArea.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dragStartY = event.getRawY();
                    dragging = false;
                    card.animate().cancel();
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    float delta = event.getRawY() - dragStartY;
                    if (!dragging && Math.abs(delta) > touchSlop) dragging = true;
                    if (dragging && delta > 0) card.setTranslationY(delta);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL: {
                    float delta = card.getTranslationY();
                    boolean dismiss = dragging && delta > card.getHeight() * 0.22f;
                    if (dismiss) {
                        card.animate()
                                .translationY(card.getHeight())
                                .alpha(0.4f)
                                .setDuration(160L)
                                .withEndAction(this::close)
                                .start();
                    } else {
                        card.animate()
                                .translationY(0f)
                                .setDuration(180L)
                                .setInterpolator(new DecelerateInterpolator(1.6f))
                                .start();
                    }
                    dragging = false;
                    return true;
                }
                default:
                    return false;
            }
        });
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
