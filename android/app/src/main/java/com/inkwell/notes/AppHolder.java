package com.inkwell.notes;

import android.app.Application;
import android.content.Context;

/** Tiny static holder so plugin code can reach a Context outside activities. */
public class AppHolder extends Application {
    private static Context ctx;

    @Override
    public void onCreate() {
        super.onCreate();
        ctx = this;
    }

    public static Context context() {
        return ctx;
    }
}
