package com.inkwell.notes;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Quick Settings tile: pulls down the shade, taps once, writes a note.
 * It opens the same native capture sheet the widgets use, so nothing here
 * touches the WebView or the app process.
 */
public class InkwellTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile == null) return;
        int queued = WidgetStore.readCaptures(this).length();
        tile.setLabel(queued > 0
                ? getString(R.string.tile_label_queued, queued)
                : getString(R.string.tile_label));
        tile.setState(Tile.STATE_INACTIVE);
        tile.updateTile();
    }

    /** Ask the system to refresh the tile label after a capture is saved. */
    public static void refreshLabel(android.content.Context context) {
        try {
            requestListeningState(context, new android.content.ComponentName(context, InkwellTileService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, QuickCaptureActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            PendingIntent pending = PendingIntent.getActivity(
                    this, 900, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startActivityAndCollapse(pending);
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
