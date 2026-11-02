package com.inkwell.notes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.TextUtils;
import android.view.WindowManager;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.Toast;

import java.util.ArrayList;

/**
 * Small dialog-style sheet launched from the widgets. It saves straight into the
 * native capture queue — the app never has to start — and the widget list shows the
 * new note immediately. The queue is imported into the app's database the next time it runs.
 * The mic button uses the platform voice recognizer, so nothing extra is bundled.
 */
public class QuickCaptureActivity extends Activity {

    /** Opened from the action sheet's "Voice note" row: start listening at once. */
    public static final String EXTRA_DICTATE = "inkwell_dictate";

    private static final int REQ_SPEECH = 101;

    private EditText input;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_quick_capture);
        boolean dictateFirst = getIntent().getBooleanExtra(EXTRA_DICTATE, false);
        getWindow().setSoftInputMode(dictateFirst
                ? WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
                        | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                : WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                        | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        input = findViewById(R.id.qc_input);
        CheckBox pin = findViewById(R.id.qc_pin);
        input.requestFocus();

        findViewById(R.id.qc_voice).setOnClickListener(v -> dictate());
        findViewById(R.id.qc_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.qc_save).setOnClickListener(v -> {
            String text = input.getText().toString().trim();
            if (TextUtils.isEmpty(text)) {
                finish();
                return;
            }
            WidgetStore.addCapture(this, text, pin.isChecked());
            WidgetStore.refreshWidgets(this);
            InkwellTileService.refreshLabel(this);
            Toast.makeText(this, R.string.widget_saved, Toast.LENGTH_SHORT).show();
            finish();
        });

        if (dictateFirst) input.post(this::dictate);
    }

    private void dictate() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.widget_capture_hint));
        try {
            startActivityForResult(intent, REQ_SPEECH);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.widget_no_speech, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SPEECH || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results == null || results.isEmpty()) return;
        String spoken = results.get(0).trim();
        if (spoken.isEmpty()) return;
        String existing = input.getText().toString().trim();
        input.setText(existing.isEmpty() ? spoken : existing + "\n" + spoken);
        input.setSelection(input.getText().length());
    }
}
