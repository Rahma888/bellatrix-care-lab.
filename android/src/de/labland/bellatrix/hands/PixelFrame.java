package de.labland.bellatrix.hands;

/**
 * One camera frame as numbers, upright: one int per pixel, row by row, with red in the lowest
 * byte, then green, blue and alpha (the layout TensorImage reads). Reused from frame to frame by
 * the one compute thread; nobody may hold on to it.
 *
 * Also the conversion from the camera's YUV_420_888 planes, turned clockwise by 0, 90, 180 or 270
 * degrees on the way, so that the picture the models see is the right way up.
 *
 * Port of LabLand's Telekom app (ai.labland.telekom.tracking.PixelFrame.kt and FrameConverter.kt).
 * The Telekom app gets RGBA frames from CameraX; here Camera2 gives YUV, so the conversion is new
 * (JFIF / BT.601 full range, integer arithmetic).
 */
final class PixelFrame {
    int width, height;
    int[] pixels = new int[0];

    /* 24 Nov (Rahma: "not smooth like the Telekom app"): the Telekom app gets ready RGBA frames from CameraX;
     * here every pixel of every 640x480 frame was converted and turned in Java before the models looked at
     * a small part of it. Now prepare() only takes the planes, and at(x, y) converts a pixel the first time
     * it is read (stamp == gen). fill() (everything at once) stays for comparison (handsConfig {"lazy":false}). */
    private int[] stamp = new int[0];
    private int gen;
    private Yuv src;
    private int rot, srcW, srcH;
    private boolean lazy;

    /** Takes the planes of yuv for a frame turned clockwise by rotation degrees; converts nothing yet. */
    void prepare(Yuv f, int rotation) {
        int w = f.width, h = f.height;
        boolean sideways = rotation == 90 || rotation == 270;
        width = sideways ? h : w;
        height = sideways ? w : h;
        int n = width * height;
        if (pixels.length != n) pixels = new int[n];
        if (stamp.length != n) { stamp = new int[n]; gen = 0; }
        gen++;
        if (gen == 0) { java.util.Arrays.fill(stamp, 0); gen = 1; }
        src = f; rot = rotation; srcW = w; srcH = h; lazy = true;
    }

    /** The upright pixel at (x, y), 0 <= x < width, 0 <= y < height (red lowest, as in pixels). */
    int at(int x, int y) {
        int i = y * width + x;
        if (!lazy || stamp[i] == gen) return pixels[i];
        stamp[i] = gen;
        int sx, sy;
        if (rot == 90) { sx = y; sy = srcH - 1 - x; }
        else if (rot == 180) { sx = srcW - 1 - x; sy = srcH - 1 - y; }
        else if (rot == 270) { sx = srcW - 1 - y; sy = x; }
        else { sx = x; sy = y; }
        Yuv f = src;
        int Y = f.y[sy * f.yRowStride + sx] & 0xFF;
        int ci = (sy >> 1) * f.uvRowStride + (sx >> 1) * f.uvPixelStride;
        int U = (f.u[ci] & 0xFF) - 128;
        int V = (f.v[ci] & 0xFF) - 128;
        int r = Y + ((1436 * V) >> 10);
        int g = Y - ((352 * U + 731 * V) >> 10);
        int b = Y + ((1815 * U) >> 10);
        if (r < 0) r = 0; else if (r > 255) r = 255;
        if (g < 0) g = 0; else if (g > 255) g = 255;
        if (b < 0) b = 0; else if (b > 255) b = 255;
        int p = 0xFF000000 | (b << 16) | (g << 8) | r;
        pixels[i] = p;
        return p;
    }

    /** The copied camera planes of one frame (filled on the camera thread, read on the compute thread). */
    static final class Yuv {
        byte[] y = new byte[0], u = new byte[0], v = new byte[0];
        int width, height, yRowStride, uvRowStride, uvPixelStride;
        long arrivedAtMs;
    }

    /** Converts yuv into this frame, turned clockwise by rotation degrees (0, 90, 180, 270). */
    void fill(Yuv f, int rotation) {
        lazy = false;
        int w = f.width, h = f.height;
        boolean sideways = rotation == 90 || rotation == 270;
        int outW = sideways ? h : w, outH = sideways ? w : h;
        if (pixels.length != outW * outH) pixels = new int[outW * outH];
        width = outW;
        height = outH;
        int[] out = pixels;
        byte[] yp = f.y, up = f.u, vp = f.v;
        int yRow = f.yRowStride, uvRow = f.uvRowStride, uvPix = f.uvPixelStride;
        for (int sy = 0; sy < h; sy++) {
            // Where source pixel (0, sy) lands, and how far one step along the row moves.
            int base, step;
            if (rotation == 90) { base = h - 1 - sy; step = outW; }
            else if (rotation == 180) { base = (h - 1 - sy) * w + (w - 1); step = -1; }
            else if (rotation == 270) { base = (w - 1) * outW + sy; step = -outW; }
            else { base = sy * w; step = 1; }
            int yi = sy * yRow;
            int uvLine = (sy >> 1) * uvRow;
            int di = base;
            for (int sx = 0; sx < w; sx++) {
                int Y = yp[yi + sx] & 0xFF;
                int ci = uvLine + (sx >> 1) * uvPix;
                int U = (up[ci] & 0xFF) - 128;
                int V = (vp[ci] & 0xFF) - 128;
                int r = Y + ((1436 * V) >> 10);
                int g = Y - ((352 * U + 731 * V) >> 10);
                int b = Y + ((1815 * U) >> 10);
                if (r < 0) r = 0; else if (r > 255) r = 255;
                if (g < 0) g = 0; else if (g > 255) g = 255;
                if (b < 0) b = 0; else if (b > 255) b = 255;
                out[di] = 0xFF000000 | (b << 16) | (g << 8) | r;
                di += step;
            }
        }
    }
}
