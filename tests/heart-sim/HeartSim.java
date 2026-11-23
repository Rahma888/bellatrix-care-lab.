import de.labland.bellatrix.hands.HeartSpot;

import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Random;

/**
 * Runs HeartSpot (the red heart of the pointing prototype) on the PC.
 *   java HeartSim --synthetic      drawn test pictures (no camera, no person), one JSON line each
 *   java HeartSim a.jpg b.png ...  real pictures (for tuning), one JSON line each
 */
public final class HeartSim {
    static final int W = 480, H = 640;

    public static void main(String[] args) throws Exception {
        if (args.length == 1 && "--synthetic".equals(args[0])) { synthetic(); return; }
        for (String f : args) {
            BufferedImage im = javax.imageio.ImageIO.read(new File(f));
            int w = im.getWidth(), h = im.getHeight();
            int[] px = new int[w * h];
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) px[y * w + x] = abgr(im.getRGB(x, y));
            print(new File(f).getName(), px, w, h);
        }
    }

    /** ARGB (Java) -> ABGR (the camera frame of the app: red in the lowest byte). */
    static int abgr(int argb) {
        int r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
        return 0xFF000000 | (b << 16) | (g << 8) | r;
    }

    static void print(String name, int[] px, int w, int h) {
        HeartSpot s = new HeartSpot();
        boolean ok = s.find(px, w, h);
        System.out.println("{\"name\":\"" + name + "\",\"found\":" + ok + (ok ? ",\"x\":" + s.x + ",\"y\":" + s.y + ",\"area\":" + s.area + ",\"n\":" + s.samples : "") + "}");
    }

    static int[] room(long seed) {
        Random r = new Random(seed);
        int[] px = new int[W * H];
        for (int i = 0; i < px.length; i++) {
            int g = 90 + r.nextInt(40);   // grey floor and walls with noise
            px[i] = abgr(0xFF000000 | (g << 16) | (g << 8) | (g + 5));
        }
        return px;
    }

    static void disc(int[] px, int cx, int cy, int rad, int rgb) {
        for (int y = Math.max(0, cy - rad); y < Math.min(H, cy + rad); y++)
            for (int x = Math.max(0, cx - rad); x < Math.min(W, cx + rad); x++)
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) px[y * W + x] = abgr(0xFF000000 | rgb);
    }

    static void synthetic() {
        int RED = (210 << 16) | (30 << 8) | 40, DARKRED = (120 << 16) | (20 << 8) | 25;
        int SKIN = (222 << 16) | (172 << 8) | 140, BROWN = (150 << 16) | (92 << 8) | 60, PINK = (235 << 16) | (150 << 8) | 160;

        int[] a = room(1); disc(a, 120, 300, 70, SKIN); disc(a, 300, 200, 40, RED);
        print("heart", a, W, H);

        int[] b = room(2); disc(b, 300, 200, 40, RED); disc(b, 30, 600, 9, RED);
        print("heart-and-red-spot", b, W, H);

        int[] c = room(3); disc(c, 240, 320, 90, SKIN); disc(c, 360, 500, 50, BROWN); disc(c, 100, 100, 40, PINK);
        print("no-heart", c, W, H);

        int[] d = room(4); disc(d, 300, 200, 40, RED);
        for (int y = 160; y < 240; y++) for (int x = 260; x < 340; x++) if (y > 175) d[y * W + x] = abgr(0xFF000000 | SKIN);   // a fist over most of it
        print("heart-in-fist", d, W, H);

        int[] e = room(5); disc(e, 300, 200, 40, RED); disc(e, 300, 200, 20, DARKRED);   // the shaded side
        print("heart-shaded", e, W, H);

        int[] f = room(6); disc(f, 300, 200, 40, RED);   // two fingers across the heart: three pieces, one heart
        for (int y = 150; y < 250; y++) for (int x = 0; x < W; x++) if ((x >= 280 && x < 290) || (x >= 310 && x < 320)) f[y * W + x] = abgr(0xFF000000 | SKIN);
        print("heart-split", f, W, H);

        /* following: the heart seen at (300, 200), then 33 ms later mostly hidden in a fist next to a bigger red box */
        HeartSpot s = new HeartSpot();
        int[] g1 = room(7); disc(g1, 300, 200, 40, RED);
        s.find(g1, W, H, 1000);
        int[] g2 = room(8); disc(g2, 305, 205, 40, RED);
        for (int y = 150; y < 260; y++) for (int x = 250; x < 360; x++) if (y > 190) g2[y * W + x] = abgr(0xFF000000 | SKIN);
        for (int y = 480; y < 540; y++) for (int x = 60; x < 120; x++) g2[y * W + x] = abgr(0xFF000000 | RED);
        boolean ok = s.find(g2, W, H, 1033);
        System.out.println("{\"name\":\"follow-fist\",\"found\":" + ok + ",\"x\":" + s.x + ",\"y\":" + s.y + ",\"area\":" + s.area + "}");
        print("no-follow-fist", g2, W, H);
    }
}
