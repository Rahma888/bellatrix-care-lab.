package de.labland.bellatrix.hands;

import java.util.List;

/**
 * Follows one hand from frame to frame, driving the two hand models directly (no MediaPipe).
 *
 * A followed hand costs one run of the landmark model per frame: the region to look at comes from
 * the hand's points in the frame before. The palm detector, the expensive part, only runs while no
 * hand is followed, and never more often than every DETECTION_INTERVAL_MS (100 ms, as in the
 * Telekom app). When it finds a palm, the same frame is tracked at once.
 *
 * Port of LabLand's Telekom app (ai.labland.telekom.tracking.direct.DirectHandEngine.kt), reduced to
 * one hand and one compute thread (the page follows one hand). Use from the compute thread only.
 */
final class HandEngine {
    static final float MIN_PRESENCE = 0.5f;
    static final long DETECTION_INTERVAL_MS = 100;
    static final float MIN_PALM_SCORE = 0.5f;
    static final float PALM_MERGE_OVERLAP = 0.3f;

    final HandModels models;
    // Written on the compute thread, read by wantsFrame on the camera thread.
    volatile HandGeometry.Roi roi;
    volatile long lastDetectionAtMs = -DETECTION_INTERVAL_MS;

    /** The last result: 21 points as x, y, z normalised to the frame (0..1), valid when hasHand. */
    final float[] points = new float[HandGeometry.HAND_LANDMARK_COUNT * 3];
    boolean hasHand;
    final float[] pixels2 = new float[HandGeometry.HAND_LANDMARK_COUNT * 2];
    final float[] zs = new float[HandGeometry.HAND_LANDMARK_COUNT];

    /** Time of the last model runs, for handsState(). */
    long lastLandmarkNs, lastDetectNs;
    boolean detectedThisFrame;

    HandEngine(HandModels models) { this.models = models; }

    void reset() {
        roi = null;
        hasHand = false;
        lastDetectionAtMs = -DETECTION_INTERVAL_MS;
    }

    /** Whether a frame arriving at nowMs would be looked at (otherwise it is not even converted). */
    boolean wantsFrame(long nowMs) {
        return roi != null || nowMs - lastDetectionAtMs >= DETECTION_INTERVAL_MS;
    }

    /**
     * Looks at one frame. Returns false when the frame was skipped (no hand followed and the
     * detector ran less than DETECTION_INTERVAL_MS ago): then there is nothing new to report.
     */
    boolean process(PixelFrame frame, long arrivedAtMs) {
        detectedThisFrame = false;
        HandGeometry.Roi followed = roi;
        if (followed != null) {
            track(frame, followed);
            return true;
        }
        if (arrivedAtMs - lastDetectionAtMs < DETECTION_INTERVAL_MS) return false;
        lastDetectionAtMs = arrivedAtMs;
        detectedThisFrame = true;
        HandGeometry.Roi found = detect(frame);
        if (found == null) {
            hasHand = false;
            return true;
        }
        // The frame is still at hand: start following right away instead of one frame later.
        track(frame, found);
        return true;
    }

    /** Looks for palms in the whole picture; the best usable one becomes the region to follow. */
    private HandGeometry.Roi detect(PixelFrame frame) {
        long t0 = System.nanoTime();
        HandGeometry.Letterbox lb = models.palmInput.fillLetterboxed(frame);
        models.detectPalms();
        List<HandGeometry.Palm> palms = HandGeometry.mergeOverlappingPalms(
                HandGeometry.decodePalms(models.palmRegressors, models.palmScores, MIN_PALM_SCORE), PALM_MERGE_OVERLAP);
        lastDetectNs = System.nanoTime() - t0;
        for (HandGeometry.Palm palm : palms) {
            HandGeometry.Roi r = HandGeometry.roiFromPalm(HandGeometry.toPicture(palm, lb));
            if (r.isUsable()) return r;
        }
        return null;
    }

    /** One step of following the hand: look at r, and derive where to look next. */
    private void track(PixelFrame frame, HandGeometry.Roi r) {
        long t0 = System.nanoTime();
        models.landmarkInput.fill(frame, r);
        models.locateLandmarks();
        HandGeometry.projectLandmarks(models.rawLandmarks, r, pixels2, zs);
        HandGeometry.Roi next = HandGeometry.roiFromLandmarks(pixels2);
        lastLandmarkNs = System.nanoTime() - t0;
        if (models.presence < MIN_PRESENCE || !next.isUsable()) {
            roi = null;
            hasHand = false;
            return;
        }
        roi = next;
        hasHand = true;
        float w = frame.width, h = frame.height;
        for (int p = 0; p < HandGeometry.HAND_LANDMARK_COUNT; p++) {
            points[3 * p] = pixels2[2 * p] / w;
            points[3 * p + 1] = pixels2[2 * p + 1] / h;
            points[3 * p + 2] = zs[p] / w;
        }
    }
}
