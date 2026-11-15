package de.labland.bellatrix.hands;

/**
 * The square RGB input of a model, as floats from 0 to 1, filled straight from a frame's pixels.
 * What lies outside the frame is black. Belongs to the compute thread; never allocates after
 * construction.
 *
 * Each input pixel takes the frame pixel nearest to it; where the input is a clear reduction of the
 * frame, it takes the mean of a block of four instead, so that no detail falls between the samples.
 *
 * Port of LabLand's Telekom app (ai.labland.telekom.tracking.direct.TensorImage.kt).
 */
final class TensorImage {
    static final int CHANNELS = 3;
    /** From this many frame pixels per input pixel on, blocks of four are averaged. */
    static final float BLOCK_FROM_STEP = 1.5f;
    static final float QUARTER = 1f / (4 * 255f);
    static final float[] UNIT = unit();

    final int size;
    /** What the model reads: red, green, blue per pixel, row by row. Valid after every fill. */
    final float[] values;

    TensorImage(int size) {
        this.size = size;
        this.values = new float[size * size * CHANNELS];
    }

    private static float[] unit() {
        float[] u = new float[256];
        for (int i = 0; i < 256; i++) u[i] = i / 255f;
        return u;
    }

    /** Fills the input with the tilted square roi of frame. */
    void fill(PixelFrame frame, HandGeometry.Roi roi) {
        float step = roi.size / size;
        float cos = (float) Math.cos(roi.rotation) * step;
        float sin = (float) Math.sin(roi.rotation) * step;
        float corner = 0.5f - size / 2f;
        sample(frame,
                roi.centerX + cos * corner - sin * corner - 0.5f,
                roi.centerY + sin * corner + cos * corner - 0.5f,
                cos, sin, -sin, cos,
                step >= BLOCK_FROM_STEP);
    }

    /** Fills the input with the whole frame, undistorted and centred on black. */
    HandGeometry.Letterbox fillLetterboxed(PixelFrame frame) {
        HandGeometry.Letterbox lb = new HandGeometry.Letterbox(frame.width, frame.height, size);
        float step = 1f / lb.scale;
        sample(frame,
                (0.5f - lb.padX) * step - 0.5f,
                (0.5f - lb.padY) * step - 0.5f,
                step, 0f, 0f, step,
                step >= BLOCK_FROM_STEP);
        return lb;
    }

    /**
     * Samples the frame along a grid: input pixel (0, 0) samples the frame at (originX, originY),
     * each step in u moves by (stepUX, stepUY) and each step in v by (stepVX, stepVY). Positions
     * count from pixel centres. With blocks, each sample is the mean of the block of four pixels
     * from its position on.
     */
    private void sample(PixelFrame frame, float originX, float originY, float stepUX, float stepUY,
                        float stepVX, float stepVY, boolean blocks) {
        int[] pixels = frame.pixels;
        int width = frame.width, height = frame.height, stride = frame.width;
        float[] out = values;
        int next = 0;
        float rowX = originX, rowY = originY;
        for (int v = 0; v < size; v++) {
            float x = rowX, y = rowY;
            if (blocks) {
                for (int u = 0; u < size; u++) {
                    int x0 = (int) x;
                    if (x < x0) x0--;
                    int y0 = (int) y;
                    if (y < y0) y0--;
                    if (x0 >= 0 && y0 >= 0 && x0 < width - 1 && y0 < height - 1) {
                        int row0 = y0 * stride + x0, row1 = row0 + stride;
                        int p00 = pixels[row0], p01 = pixels[row0 + 1], p10 = pixels[row1], p11 = pixels[row1 + 1];
                        out[next++] = ((p00 & 0xFF) + (p01 & 0xFF) + (p10 & 0xFF) + (p11 & 0xFF)) * QUARTER;
                        out[next++] = (((p00 >>> 8) & 0xFF) + ((p01 >>> 8) & 0xFF) + ((p10 >>> 8) & 0xFF) + ((p11 >>> 8) & 0xFF)) * QUARTER;
                        out[next++] = (((p00 >>> 16) & 0xFF) + ((p01 >>> 16) & 0xFF) + ((p10 >>> 16) & 0xFF) + ((p11 >>> 16) & 0xFF)) * QUARTER;
                    } else {
                        // At the edge of the frame or beyond it: pixels outside the frame are black.
                        int red = 0, green = 0, blue = 0;
                        for (int tap = 0; tap < 4; tap++) {
                            int tx = x0 + (tap & 1), ty = y0 + (tap >>> 1);
                            if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
                            int p = pixels[ty * stride + tx];
                            red += p & 0xFF;
                            green += (p >>> 8) & 0xFF;
                            blue += (p >>> 16) & 0xFF;
                        }
                        out[next++] = red * QUARTER;
                        out[next++] = green * QUARTER;
                        out[next++] = blue * QUARTER;
                    }
                    x += stepUX;
                    y += stepUY;
                }
            } else {
                for (int u = 0; u < size; u++) {
                    float nx = x + 0.5f, ny = y + 0.5f;
                    int xi = (int) nx;
                    if (nx < xi) xi--;
                    int yi = (int) ny;
                    if (ny < yi) yi--;
                    if (xi >= 0 && yi >= 0 && xi < width && yi < height) {
                        int p = pixels[yi * stride + xi];
                        out[next++] = UNIT[p & 0xFF];
                        out[next++] = UNIT[(p >>> 8) & 0xFF];
                        out[next++] = UNIT[(p >>> 16) & 0xFF];
                    } else {
                        out[next++] = 0f;
                        out[next++] = 0f;
                        out[next++] = 0f;
                    }
                    x += stepUX;
                    y += stepUY;
                }
            }
            rowX += stepVX;
            rowY += stepVY;
        }
    }
}
