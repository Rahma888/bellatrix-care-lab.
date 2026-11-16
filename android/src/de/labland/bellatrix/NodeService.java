package de.labland.bellatrix;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.system.Os;
import android.util.Log;

import java.io.File;

/**
 * Node on the robot head, in its own process (":node", AndroidManifest.xml): nodejs-mobile's libnode.so
 * runs labland/store-server.mjs 8765 --lan from the copy HeadServer made (files/server/app), with
 * BELLATRIX_DATA = files/server/data. Node's output goes to files/server/node.log.
 *
 * Node can start only once in a process and cannot be stopped from outside it, so this process ends
 * when Node ends or when the service is stopped; HeadServer (in the app's main process) starts it again.
 * A foreground service, so Android keeps it while the Care Team app is not in front.
 *
 * Build note: static nested classes only, no lambdas, no anonymous classes (see WebActivity).
 */
public class NodeService extends Service {

    static final String TAG = "Bellatrix";
    static final String CHANNEL = "bellatrix-server";
    static final long STACK = 8L * 1024L * 1024L;
    static boolean begun;   // guarded by NodeService.class; once per process

    /** libbellatrixnode.so (android/jni/bellatrix-node.cpp): chdir(cwd), stdout and stderr to log, node::Start(args). */
    static native int runNode(String[] args, String cwd, String logPath);

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Bellatrix", NotificationManager.IMPORTANCE_MIN));
            Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("Bellatrix")
                .setOngoing(true)
                .build();
            startForeground(8765, n);
        } catch (Throwable t) {
            Log.w(TAG, "Node service: no foreground notification (" + t + ")");
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        synchronized (NodeService.class) {
            if (begun) return START_NOT_STICKY;
            begun = true;
        }
        new Thread(null, new Runner(this), "bellatrix-node", STACK).start();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "Node service stopped: its process ends");
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    static final class Runner implements Runnable {
        final Context c;

        Runner(Context c) { this.c = c.getApplicationContext(); }

        public void run() {
            int code = -1;
            File root = HeadServer.root(c);
            File log = new File(root, "node.log");
            try {
                if (log.length() > 1024L * 1024L) {
                    File old = new File(root, "node.log.1");
                    if (old.exists() && !old.delete()) Log.w(TAG, "node.log.1 not deleted");
                    if (!log.renameTo(old)) Log.w(TAG, "node.log not rotated");
                }
                System.loadLibrary("c++_shared");
                System.loadLibrary("node");
                System.loadLibrary("bellatrixnode");
                File app = HeadServer.appDir(c), data = HeadServer.dataDir(c);
                Os.setenv("BELLATRIX_DATA", data.getAbsolutePath(), true);
                Os.setenv("PORTAL_DATA", new File(data, "portal").getAbsolutePath(), true);
                File videos = c.getExternalFilesDir("videos");   // 16 Nov: the demo films (Demo mode), copied there by adb
                if (videos != null) Os.setenv("BELLATRIX_VIDEOS", videos.getAbsolutePath(), true);
                Os.setenv("HOME", new File(root, "home").getAbsolutePath(), true);
                Os.setenv("TMPDIR", new File(root, "tmp").getAbsolutePath(), true);
                String script = new File(app, "labland/store-server.mjs").getAbsolutePath();
                Log.i(TAG, "Node starts: " + script);
                code = runNode(new String[] {"node", script, String.valueOf(HeadServer.PORT), "--lan"}, app.getAbsolutePath(), log.getAbsolutePath());
            } catch (Throwable t) {
                Log.w(TAG, "Node did not start: " + t);
            }
            Log.w(TAG, "Node ended (exit " + code + ")");
            android.os.Process.killProcess(android.os.Process.myPid());
        }
    }
}
