package de.labland.bellatrix.hands;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The pointer of the hand drawn by the app itself, over the page, as the Telekom tablet app does
 * (ai.labland.telekom.shell.HandCursor / CursorPainter): it moves at every camera picture the
 * hand tracker works on (about 30 a second), straight from the one-euro filtered palm (Hands), with
 * no second smoothing and nothing lost on the way to the page.
 *
 * 24 Nov (Rahma: "the pointer is not smooth like the Telekom app, copy it as it is").
 *
 * The page keeps choosing the buttons: it gets the same filtered position in each hands result
 * ("cur") and tells this view how the camera picture maps onto the screen (mirror, zone, the stage's
 * box in CSS pixels), how far the ring is filled, and where the pointer is held on a button while
 * the hand closes and opens. The page's own pointer is then hidden. Looks like the page's pointer
 * (css/lab.css .aircursor): a grey disc with the cyan progress ring, a blue outline, a white centre.
 */
public final class CursorOverlay extends View {
    /** A hand gone this long hides the pointer (the filter starts afresh after the same time). */
    static final long GONE_MS = 250;
    /** Without news from the page for this long the pointer is hidden (a page that went away). */
    static final long PAGE_SILENT_MS = 3000;

    // From the page (any thread).
    private volatile boolean on;
    private volatile boolean mirror, flipY;
    private volatile float z0 = 0f, z1 = 0f, z2 = 1f, z3 = 1f;
    private volatile float boxLeft, boxTop, boxWidth, boxHeight, dpr = 1f, sizeCss = 120f;
    private volatile float ring;
    private volatile boolean locked;
    private volatile float lockX, lockY;
    private volatile long pageAt;

    // From the hand tracker (compute thread).
    private volatile float fx = Float.NaN, fy = Float.NaN;
    private volatile long handAt;

    private final Paint grey = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cyan = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint blue = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint white = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF arc = new RectF();
    private final Runnable hideCheck = new HideCheck(this);

    public CursorOverlay(Context c) {
        super(c);
        setWillNotDraw(false);
        setClickable(false);
        setFocusable(false);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        grey.setColor(0xFFE0E0E0);
        cyan.setColor(0xFF00A0E3);
        blue.setColor(0xFF00519E);
        blue.setStyle(Paint.Style.STROKE);
        white.setColor(0xFFFFFFFF);
    }

    /** {on, mirror, flipY, zone:[x0,y0,x1,y1], box:[left,top,width,height], dpr, size, ring, lock:[x,y]|null}; any part may be left out. */
    public void fromPage(String json) {
        try {
            JSONObject o = new JSONObject(json == null || json.isEmpty() ? "{}" : json);
            if (o.has("mirror")) mirror = o.optBoolean("mirror");
            if (o.has("flipY")) flipY = o.optBoolean("flipY");
            JSONArray z = o.optJSONArray("zone");
            if (z != null && z.length() == 4 && z.optDouble(2) - z.optDouble(0) > 0.05 && z.optDouble(3) - z.optDouble(1) > 0.05) {
                z0 = (float) z.optDouble(0); z1 = (float) z.optDouble(1); z2 = (float) z.optDouble(2); z3 = (float) z.optDouble(3);
            }
            JSONArray b = o.optJSONArray("box");
            if (b != null && b.length() == 4) {
                boxLeft = (float) b.optDouble(0); boxTop = (float) b.optDouble(1); boxWidth = (float) b.optDouble(2); boxHeight = (float) b.optDouble(3);
            }
            if (o.has("dpr")) dpr = (float) Math.max(0.5, Math.min(5, o.optDouble("dpr", 1)));
            if (o.has("size")) sizeCss = (float) Math.max(20, Math.min(400, o.optDouble("size", 120)));
            if (o.has("ring")) ring = (float) Math.max(0, Math.min(1, o.optDouble("ring", 0)));
            if (o.has("lock")) {
                JSONArray l = o.optJSONArray("lock");
                if (l != null && l.length() == 2) { lockX = (float) l.optDouble(0); lockY = (float) l.optDouble(1); locked = true; }
                else locked = false;
            }
            if (o.has("on")) {
                boolean was = on;
                on = o.optBoolean("on");
                if (!on) { ring = 0; locked = false; }
                else if (!was) { fx = Float.NaN; fy = Float.NaN; }
            }
            pageAt = SystemClock.uptimeMillis();
        } catch (Exception e) {
            /* a broken message changes nothing */
        }
        postInvalidateOnAnimation();
    }

    /** A filtered palm position (fractions of the upright camera picture) from the hand tracker. */
    void hand(float x, float y) {
        fx = x;
        fy = y;
        handAt = SystemClock.uptimeMillis();
        if (!on) return;
        removeCallbacks(hideCheck);
        postDelayed(hideCheck, GONE_MS + 20);
        postInvalidateOnAnimation();
    }

    /** A picture without a hand: nothing to do, HideCheck takes the pointer away GONE_MS after the last hand. */
    void noHand() { }

    /** Redraws GONE_MS after the last hand, so that a hand that stays gone takes the pointer away. */
    static final class HideCheck implements Runnable {
        final CursorOverlay v;
        HideCheck(CursorOverlay v) { this.v = v; }
        @Override public void run() { v.invalidate(); }
    }

    @Override
    protected void onDraw(Canvas c) {
        if (!on) return;
        long now = SystemClock.uptimeMillis();
        if (now - pageAt > PAGE_SILENT_MS) return;
        float x = fx, y = fy;
        if (Float.isNaN(x) || Float.isNaN(y) || now - handAt > GONE_MS) return;
        float cx, cy;
        if (locked) {
            cx = lockX * dpr;
            cy = lockY * dpr;
        } else {
            float sx = mirror ? 1f - x : x, sy = flipY ? 1f - y : y;
            float u = clamp((sx - z0) / (z2 - z0)), v = clamp((sy - z1) / (z3 - z1));
            cx = (boxLeft + u * boxWidth) * dpr;
            cy = (boxTop + v * boxHeight) * dpr;
        }
        float k = sizeCss / 120f * dpr;
        float rOuter = 60f * k;
        // grey disc with the cyan part of the ring (from the top, clockwise)
        c.drawCircle(cx, cy, rOuter, grey);
        float p = ring;
        if (p > 0f) {
            arc.set(cx - rOuter, cy - rOuter, cx + rOuter, cy + rOuter);
            c.drawArc(arc, -90f, 360f * p, true, cyan);
        }
        // blue outline outside the disc (box-shadow 0 0 0 6px)
        blue.setStrokeWidth(6f * k);
        c.drawCircle(cx, cy, rOuter + 3f * k, blue);
        // white centre with its blue border (inset 22px, border 6px)
        c.drawCircle(cx, cy, 38f * k, white);
        c.drawCircle(cx, cy, 35f * k, blue);
    }

    private static float clamp(float v) { return v < 0f ? 0f : v > 1f ? 1f : v; }
}
