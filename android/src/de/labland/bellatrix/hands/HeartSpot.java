package de.labland.bellatrix.hands;

/**
 * The red heart (a small soft ball the resident holds), found by its colour in one camera picture: no model, a
 * few thousand pixel tests per frame. 23 Nov (Rahma's prototype): the pointer follows the heart; closing the hand
 * over it hides most of it, opening shows it again (the page turns that into the "OK").
 *
 * Plain Java (no Android), so tests/heart-sim can run it on the PC.
 *
 * pixels: ABGR ints (red in the lowest byte), the upright picture, w x h. Every STEP-th pixel in both directions
 * is tested. A pixel is "heart red" when red clearly beats green and blue: saturation (red - max(green, blue)) / red
 * at least SAT_PCT %. Skin, even pink skin in warm light, stays below (about 35-45 %); the heart is 45-85 %.
 * The red samples are grouped into touching patches; the patch kept is the biggest that is round and solid, so the
 * thin red stripe of a sleeve or a red line somewhere in the room does not pull the point away. Patches right next
 * to it count too (fingers across the heart cut it in pieces). From one frame to the next (find with the time) the
 * patch near the last heart is strongly preferred, and for FOLLOW_MS red far from it is ignored: a heart hidden in a
 * fist is "not seen" instead of jumping to something red behind the person.
 */
public final class HeartSpot {
    public static final int STEP = 4;
    /** fewer red samples than this: no heart (about 0.1 % of the picture) */
    public static final int MIN_SAMPLES = 20;
    public static final int SAT_PCT = 47;

    private boolean[] mask = new boolean[0];
    private int[] label = new int[0], queue = new int[0];
    private int[] cCount = new int[64], cSx = new int[64], cSy = new int[64], cX0 = new int[64], cX1 = new int[64], cY0 = new int[64], cY1 = new int[64];

    /** Result of the last find(): centre (0..1 of the picture), share of the picture covered, red samples used. */
    public float x, y, area;
    public int samples;

    /* the last heart (grid cells) and when, for the next frame */
    private double lastGx, lastGy, lastReach;
    private long lastAt = Long.MIN_VALUE / 2;
    static final long FOLLOW_MS = 1500;   // a heart hidden longer than this is looked for anywhere again
    static final int GAP = 3;

    public static boolean isRed(int c) {
        int r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF, m = g > b ? g : b;
        return r >= 70 && (r - m) * 100 >= SAT_PCT * r;
    }

    /** One picture on its own (no memory of the last one). */
    public boolean find(int[] pixels, int w, int h) { lastAt = Long.MIN_VALUE / 2; return find(pixels, w, h, Long.MIN_VALUE / 4); }

    /** true when a heart is seen (then x, y, area, samples are set). nowMs: the frame's time, for following. */
    public boolean find(int[] pixels, int w, int h, long nowMs) {
        samples = 0;
        if (pixels == null || w < STEP || h < STEP || pixels.length < w * h) return false;
        int gw = (w + STEP - 1) / STEP, gh = (h + STEP - 1) / STEP, cap = gw * gh;
        if (mask.length < cap) { mask = new boolean[cap]; label = new int[cap]; queue = new int[cap]; }
        int n = 0;
        for (int gy = 0, py = 0; gy < gh; gy++, py += STEP) {
            int row = py * w, gi = gy * gw;
            for (int gx = 0, px = 0; gx < gw; gx++, px += STEP) {
                boolean red = isRed(pixels[row + px]);
                mask[gi + gx] = red;
                label[gi + gx] = 0;
                if (red) n++;
            }
        }
        if (n < MIN_SAMPLES) return false;
        /* touching patches (8 neighbours) */
        int comps = 0;
        for (int i = 0; i < cap; i++) {
            if (!mask[i] || label[i] != 0) continue;
            if (comps + 1 >= cCount.length) grow();
            int c = ++comps, head = 0, tail = 0, cnt = 0, sx = 0, sy = 0, x0 = gw, x1 = -1, y0 = gh, y1 = -1;
            label[i] = c; queue[tail++] = i;
            while (head < tail) {
                int q = queue[head++], qx = q % gw, qy = q / gw;
                cnt++; sx += qx; sy += qy;
                if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
                for (int dy = -1; dy <= 1; dy++) {
                    int ny = qy + dy;
                    if (ny < 0 || ny >= gh) continue;
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = qx + dx;
                        if (nx < 0 || nx >= gw) continue;
                        int j = ny * gw + nx;
                        if (mask[j] && label[j] == 0) { label[j] = c; queue[tail++] = j; }
                    }
                }
            }
            cCount[c] = cnt; cSx[c] = sx; cSy[c] = sy; cX0[c] = x0; cX1[c] = x1; cY0[c] = y0; cY1[c] = y1;
        }
        /* the best patch: big, round (not a stripe) and solid (not a thin diagonal line) */
        int best = 0;
        double bestScore = 0;
        for (int c = 1; c <= comps; c++) {
            int bw = cX1[c] - cX0[c] + 1, bh = cY1[c] - cY0[c] + 1;
            double shape = Math.sqrt((double) Math.min(bw, bh) / Math.max(bw, bh));
            double fill = Math.min(1.0, cCount[c] / (0.5 * bw * bh));
            double score = cCount[c] * shape * fill;
            if (nowMs - lastAt <= FOLLOW_MS) {
                /* following: only near the last heart; far red is ignored (a heart hidden in a fist is "not seen",
                   it must not jump to the red box behind the person) */
                double d = Math.hypot((double) cSx[c] / cCount[c] - lastGx, (double) cSy[c] / cCount[c] - lastGy);
                if (d > 3 * lastReach + 6) continue;
                score *= 1 + 4 * Math.exp(-d / lastReach);
            }
            if (score > bestScore) { bestScore = score; best = c; }
        }
        if (best == 0) return false;
        /* the pieces next to it (bounding boxes at most GAP cells apart), growing the box as they join */
        int mx0 = cX0[best], mx1 = cX1[best], my0 = cY0[best], my1 = cY1[best];
        long sx = cSx[best], sy = cSy[best];
        int k = cCount[best];
        boolean joined = true;   // a joined patch is marked by a negative count (counts are new in every frame)
        while (joined) {
            joined = false;
            for (int c = 1; c <= comps; c++) {
                if (c == best || cCount[c] <= 0) continue;
                if (cX0[c] > mx1 + GAP || cX1[c] < mx0 - GAP || cY0[c] > my1 + GAP || cY1[c] < my0 - GAP) continue;
                sx += cSx[c]; sy += cSy[c]; k += cCount[c]; cCount[c] = -cCount[c];
                mx0 = Math.min(mx0, cX0[c]); mx1 = Math.max(mx1, cX1[c]); my0 = Math.min(my0, cY0[c]); my1 = Math.max(my1, cY1[c]);
                joined = true;
            }
        }
        if (k < MIN_SAMPLES) return false;
        lastGx = (double) sx / k; lastGy = (double) sy / k; lastAt = nowMs;
        lastReach = Math.max(4, 1.5 * Math.sqrt(k / Math.PI) + 2);
        x = Math.min(1f, Math.max(0f, ((float) sx / k * STEP + STEP / 2f) / w));
        y = Math.min(1f, Math.max(0f, ((float) sy / k * STEP + STEP / 2f) / h));
        area = (float) k / cap;
        samples = k;
        return true;
    }

    private void grow() {
        int m = cCount.length * 2;
        cCount = java.util.Arrays.copyOf(cCount, m); cSx = java.util.Arrays.copyOf(cSx, m); cSy = java.util.Arrays.copyOf(cSy, m);
        cX0 = java.util.Arrays.copyOf(cX0, m); cX1 = java.util.Arrays.copyOf(cX1, m); cY0 = java.util.Arrays.copyOf(cY0, m); cY1 = java.util.Arrays.copyOf(cY1, m);
    }
}
