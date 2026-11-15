package de.labland.bellatrix.hands;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Remembers whether the compute thread is still working on a frame, so that the next frame is only
 * handed over once the previous one has been answered: one frame in flight, never a queue that
 * grows. Should an answer never arrive, the gate opens again after stallTimeoutMs.
 *
 * Port of LabLand's Telekom app (ai.labland.telekom.tracking.InFlightGate.kt).
 */
final class InFlightGate {
    static final long IDLE = Long.MIN_VALUE;
    private final long stallTimeoutMs;
    private final AtomicLong pending = new AtomicLong(IDLE);

    InFlightGate(long stallTimeoutMs) { this.stallTimeoutMs = stallTimeoutMs; }

    boolean isFree(long nowMs) {
        long p = pending.get();
        return p == IDLE || nowMs - p > stallTimeoutMs;
    }

    void submitted(long timestampMs) { pending.set(timestampMs); }

    /** An answer for another frame than the pending one (a late straggler) changes nothing. */
    void completed(long timestampMs) { pending.compareAndSet(timestampMs, IDLE); }

    void reset() { pending.set(IDLE); }
}
