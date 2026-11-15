package de.labland.bellatrix.hands;

import java.util.ArrayList;
import java.util.List;

/**
 * The arithmetic around Google's palm-detection and hand-landmark models (the "lite" pair): where
 * the detector's anchors sit, how its raw numbers become palms, which tilted square of the picture
 * the landmark model should look at, and how its answer maps back onto the picture.
 *
 * Port to Java of LabLand's Telekom app (ai.labland.telekom.tracking.direct.HandGeometry.kt), which
 * follows hands at 28 frames a second on the same tablet. The constants are the ones the models
 * were trained with (they come from MediaPipe's hand-tracking graphs): do not tune them.
 *
 * Build note: static nested classes only, no lambdas (JDK 25 + d8, see WebActivity).
 */
final class HandGeometry {

    private HandGeometry() {}

    static final int PALM_INPUT_SIZE = 192;
    static final int LANDMARK_INPUT_SIZE = 224;
    static final int PALM_ANCHOR_COUNT = 2016;
    static final int PALM_VALUES_PER_ANCHOR = 18;
    static final int HAND_LANDMARK_COUNT = 21;
    static final int LANDMARK_VALUES_PER_POINT = 3;
    static final int PALM_KEYPOINT_COUNT = 7;

    static final float SAME_HAND_DISTANCE = 0.3f;
    static final float MIN_ROI_SIZE = 8f;

    /** Wrist, thumb base joints, and the two lowest joints of the four fingers. */
    static final int[] STABLE_LANDMARKS = {0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18};

    /**
     * A square region of the camera picture, in pixels, that may be tilted. rotation is in radians
     * and positive clockwise on screen; at 0 the hand's fingers point up.
     */
    static final class Roi {
        final float centerX, centerY, size, rotation;

        Roi(float centerX, float centerY, float size, float rotation) {
            this.centerX = centerX;
            this.centerY = centerY;
            this.size = size;
            this.rotation = rotation;
        }

        boolean isUsable() {
            return finite(centerX) && finite(centerY) && finite(size) && finite(rotation) && size >= MIN_ROI_SIZE;
        }
    }

    /**
     * A palm reported by the detector. box is left, top, right, bottom; keypoints are seven x/y
     * pairs (0 = wrist, 2 = base of the middle finger). Relative to the model input right after
     * decoding, picture pixels after toPicture.
     */
    static final class Palm {
        final float score;
        final float[] box;
        final float[] keypoints;

        Palm(float score, float[] box, float[] keypoints) {
            this.score = score;
            this.box = box;
            this.keypoints = keypoints;
        }
    }

    /** Best score first (by hand: a Comparator's generic bridge method trips d8, see the build note). */
    static void sortByScore(List<Palm> palms) {
        for (int i = 1; i < palms.size(); i++) {
            Palm p = palms.get(i);
            int j = i - 1;
            while (j >= 0 && palms.get(j).score < p.score) {
                palms.set(j + 1, palms.get(j));
                j--;
            }
            palms.set(j + 1, p);
        }
    }

    /** How the picture was fitted, undistorted and centred, into a square model input. */
    static final class Letterbox {
        final float scale, padX, padY;
        final int inputSize;

        Letterbox(int pictureWidth, int pictureHeight, int inputSize) {
            this.scale = inputSize / (float) Math.max(pictureWidth, pictureHeight);
            this.padX = (inputSize - pictureWidth * scale) / 2f;
            this.padY = (inputSize - pictureHeight * scale) / 2f;
            this.inputSize = inputSize;
        }

        float toPictureX(float relative) { return (relative * inputSize - padX) / scale; }

        float toPictureY(float relative) { return (relative * inputSize - padY) / scale; }
    }

    /**
     * Centres of the detector's anchors relative to its input, x/y interleaved: a 24x24 grid with
     * two anchors per cell (stride 8), then a 12x12 grid with six per cell (three stride-16 layers).
     */
    static final float[] PALM_ANCHOR_CENTERS = anchors();

    private static float[] anchors() {
        float[] centers = new float[PALM_ANCHOR_COUNT * 2];
        int next = 0;
        int[][] layers = {{24, 2}, {12, 6}};
        for (int[] layer : layers) {
            int grid = layer[0], perCell = layer[1];
            for (int y = 0; y < grid; y++) {
                for (int x = 0; x < grid; x++) {
                    for (int k = 0; k < perCell; k++) {
                        centers[next++] = (x + 0.5f) / grid;
                        centers[next++] = (y + 0.5f) / grid;
                    }
                }
            }
        }
        if (next != centers.length) throw new IllegalStateException("palm anchors: " + next);
        return centers;
    }

    /** Turns the detector's two output tensors into palms above minScore, relative to the model input (0..1). */
    static List<Palm> decodePalms(float[] regressors, float[] rawScores, float minScore) {
        List<Palm> palms = new ArrayList<>();
        float inputSize = PALM_INPUT_SIZE;
        for (int anchor = 0; anchor < PALM_ANCHOR_COUNT; anchor++) {
            float raw = Math.max(-100f, Math.min(100f, rawScores[anchor]));
            float score = sigmoid(raw);
            if (score < minScore) continue;
            float anchorX = PALM_ANCHOR_CENTERS[2 * anchor];
            float anchorY = PALM_ANCHOR_CENTERS[2 * anchor + 1];
            int offset = anchor * PALM_VALUES_PER_ANCHOR;
            float centerX = regressors[offset] / inputSize + anchorX;
            float centerY = regressors[offset + 1] / inputSize + anchorY;
            float halfWidth = regressors[offset + 2] / inputSize / 2f;
            float halfHeight = regressors[offset + 3] / inputSize / 2f;
            float[] keypoints = new float[PALM_KEYPOINT_COUNT * 2];
            for (int k = 0; k < PALM_KEYPOINT_COUNT; k++) {
                keypoints[2 * k] = regressors[offset + 4 + 2 * k] / inputSize + anchorX;
                keypoints[2 * k + 1] = regressors[offset + 5 + 2 * k] / inputSize + anchorY;
            }
            palms.add(new Palm(score,
                    new float[] {centerX - halfWidth, centerY - halfHeight, centerX + halfWidth, centerY + halfHeight},
                    keypoints));
        }
        return palms;
    }

    /**
     * Merges overlapping reports of the same palm: the reports that overlap the best one by more
     * than minOverlap are averaged, weighted by their scores, which steadies the box. Best first.
     */
    static List<Palm> mergeOverlappingPalms(List<Palm> palms, float minOverlap) {
        List<Palm> remaining = new ArrayList<>(palms);
        sortByScore(remaining);
        List<Palm> merged = new ArrayList<>();
        while (!remaining.isEmpty()) {
            Palm best = remaining.get(0);
            List<Palm> group = new ArrayList<>();
            List<Palm> rest = new ArrayList<>();
            for (Palm p : remaining) {
                if (p == best || boxOverlap(best.box, p.box) > minOverlap) group.add(p);
                else rest.add(p);
            }
            remaining = rest;
            float total = 0f;
            for (Palm p : group) total += p.score;
            float[] box = new float[4];
            float[] keypoints = new float[PALM_KEYPOINT_COUNT * 2];
            for (Palm p : group) {
                float w = p.score / total;
                for (int i = 0; i < box.length; i++) box[i] += p.box[i] * w;
                for (int i = 0; i < keypoints.length; i++) keypoints[i] += p.keypoints[i] * w;
            }
            merged.add(new Palm(best.score, box, keypoints));
        }
        return merged;
    }

    /** Converts a palm from model-input coordinates to picture pixels. */
    static Palm toPicture(Palm palm, Letterbox lb) {
        float[] box = {lb.toPictureX(palm.box[0]), lb.toPictureY(palm.box[1]), lb.toPictureX(palm.box[2]), lb.toPictureY(palm.box[3])};
        float[] kp = new float[palm.keypoints.length];
        for (int i = 0; i < kp.length; i++) kp[i] = (i % 2 == 0) ? lb.toPictureX(palm.keypoints[i]) : lb.toPictureY(palm.keypoints[i]);
        return new Palm(palm.score, box, kp);
    }

    /**
     * The region the landmark model should look at for a freshly detected palm (picture pixels):
     * turned so the fingers point up, moved toward the fingers and enlarged to hold the whole hand.
     */
    static Roi roiFromPalm(Palm palm) {
        float rotation = uprightRotation(palm.keypoints[0], palm.keypoints[1], palm.keypoints[4], palm.keypoints[5]);
        float width = palm.box[2] - palm.box[0];
        float height = palm.box[3] - palm.box[1];
        return expandedRoi((palm.box[0] + palm.box[2]) / 2f, (palm.box[1] + palm.box[3]) / 2f, width, height, rotation, -0.5f, 2.6f);
    }

    /**
     * The region for the next frame, from the 21 hand points (x/y pairs in picture pixels) of this
     * frame. Only the wrist and the lower joints are used: they hardly move when the fingers bend.
     */
    static Roi roiFromLandmarks(float[] points) {
        float wristX = points[0];
        float wristY = points[1];
        float knucklesX = ((x(points, 5) + x(points, 13)) / 2f + x(points, 9)) / 2f;
        float knucklesY = ((y(points, 5) + y(points, 13)) / 2f + y(points, 9)) / 2f;
        float rotation = uprightRotation(wristX, wristY, knucklesX, knucklesY);

        float left = Float.MAX_VALUE, top = Float.MAX_VALUE, right = -Float.MAX_VALUE, bottom = -Float.MAX_VALUE;
        for (int index : STABLE_LANDMARKS) {
            left = Math.min(left, x(points, index));
            right = Math.max(right, x(points, index));
            top = Math.min(top, y(points, index));
            bottom = Math.max(bottom, y(points, index));
        }
        float middleX = (left + right) / 2f;
        float middleY = (top + bottom) / 2f;

        // Measure the hand along its own axes, not the picture's.
        float cosBack = (float) Math.cos(-rotation);
        float sinBack = (float) Math.sin(-rotation);
        float tl = Float.MAX_VALUE, tt = Float.MAX_VALUE, tr = -Float.MAX_VALUE, tb = -Float.MAX_VALUE;
        for (int index : STABLE_LANDMARKS) {
            float dx = x(points, index) - middleX;
            float dy = y(points, index) - middleY;
            float tx = dx * cosBack - dy * sinBack;
            float ty = dx * sinBack + dy * cosBack;
            tl = Math.min(tl, tx);
            tr = Math.max(tr, tx);
            tt = Math.min(tt, ty);
            tb = Math.max(tb, ty);
        }
        float tcx = (tl + tr) / 2f;
        float tcy = (tt + tb) / 2f;
        float c = (float) Math.cos(rotation);
        float s = (float) Math.sin(rotation);
        return expandedRoi(tcx * c - tcy * s + middleX, tcx * s + tcy * c + middleY, tr - tl, tb - tt, rotation, -0.1f, 2f);
    }

    /**
     * Maps the landmark model's answer (raw: x, y, z per point, in pixels of its square input) back
     * into picture pixels: x/y pairs in out2, and z (in the same scale as x) in outZ.
     */
    static void projectLandmarks(float[] raw, Roi roi, float[] out2, float[] outZ) {
        float c = (float) Math.cos(roi.rotation);
        float s = (float) Math.sin(roi.rotation);
        for (int p = 0; p < HAND_LANDMARK_COUNT; p++) {
            float u = raw[p * LANDMARK_VALUES_PER_POINT] / LANDMARK_INPUT_SIZE - 0.5f;
            float v = raw[p * LANDMARK_VALUES_PER_POINT + 1] / LANDMARK_INPUT_SIZE - 0.5f;
            out2[2 * p] = (u * c - v * s) * roi.size + roi.centerX;
            out2[2 * p + 1] = (u * s + v * c) * roi.size + roi.centerY;
            if (outZ != null) outZ[p] = raw[p * LANDMARK_VALUES_PER_POINT + 2] / LANDMARK_INPUT_SIZE * roi.size;
        }
    }

    /** Whether two regions belong to the same hand: centres closer than a fraction of a region. */
    static boolean isSameHand(Roi a, Roi b) {
        return (float) Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY) < SAME_HAND_DISTANCE * Math.max(a.size, b.size);
    }

    static float normalizeRadians(float angle) {
        float turn = (float) (2 * Math.PI);
        return angle - turn * (float) Math.floor((angle + (float) Math.PI) / turn);
    }

    private static float x(float[] points, int index) { return points[2 * index]; }

    private static float y(float[] points, int index) { return points[2 * index + 1]; }

    /** The rotation that makes the direction from one point to another point straight up. */
    private static float uprightRotation(float fromX, float fromY, float toX, float toY) {
        return normalizeRadians((float) (Math.PI / 2) - (float) Math.atan2(-(toY - fromY), toX - fromX));
    }

    /** Shifts a tilted box along its own vertical axis, makes it square and scales it. */
    private static Roi expandedRoi(float centerX, float centerY, float width, float height, float rotation, float shiftY, float scale) {
        return new Roi(
                centerX - height * shiftY * (float) Math.sin(rotation),
                centerY + height * shiftY * (float) Math.cos(rotation),
                Math.max(width, height) * scale,
                rotation);
    }

    private static float boxOverlap(float[] a, float[] b) {
        float w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
        float h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
        if (w <= 0f || h <= 0f) return 0f;
        float inter = w * h;
        float union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
        return union > 0f ? inter / union : 0f;
    }

    private static float sigmoid(float v) { return 1f / (1f + (float) Math.exp(-v)); }

    private static boolean finite(float v) { return !Float.isNaN(v) && !Float.isInfinite(v); }
}
