/* Dorfplaner – Unit-Tests für die Gesten-Rechnung (src/ui/gestures.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { projectToScreen, screenToViewFraction, ViewParams } from "../../src/iso/projection";
import { distance, isTap, nextZoomLevel, pinchZoomStep, zoomOrigin } from "../../src/ui/gestures";

describe("gestures", () => {

    describe("tap or drag", () => {
        it("should accept small movements as a tap", () => {
            expect(isTap(100, 100, 100, 100)).toBe(true);
            expect(isTap(100, 100, 105, 104)).toBe(true);
        });

        it("should treat larger movements as dragging", () => {
            expect(isTap(100, 100, 110, 100)).toBe(false);
            expect(isTap(100, 100, 100, 91)).toBe(false);
            expect(isTap(100, 100, 100, 92)).toBe(true);   // genau 8 px zählen noch als Antippen
        });
    });

    describe("pinch", () => {
        it("should measure the distance between two fingers", () => {
            expect(distance(0, 0, 3, 4)).toBe(5);
        });

        it("should zoom in when the fingers move apart far enough", () => {
            expect(pinchZoomStep(100, 120)).toBe(0);
            expect(pinchZoomStep(100, 140)).toBe(1);
        });

        it("should zoom out when the fingers move together far enough", () => {
            expect(pinchZoomStep(100, 80)).toBe(0);
            expect(pinchZoomStep(100, 70)).toBe(-1);
        });

        it("should ignore a zero start distance", () => {
            expect(pinchZoomStep(0, 50)).toBe(0);
        });
    });

    describe("zoom levels", () => {
        const levels = [32, 48, 64, 96, 128];

        it("should step up and down", () => {
            expect(nextZoomLevel(levels, 64, 1)).toBe(96);
            expect(nextZoomLevel(levels, 64, -1)).toBe(48);
        });

        it("should stop at both ends", () => {
            expect(nextZoomLevel(levels, 128, 1)).toBe(128);
            expect(nextZoomLevel(levels, 32, -1)).toBe(32);
        });

        it("should start from the nearest level for unknown values", () => {
            expect(nextZoomLevel(levels, 70, 1)).toBe(96);
        });
    });

    describe("zoom around a point", () => {
        it("should keep the map point under the anchor in place", () => {
            const before: ViewParams = { heightStep: 8, originX: 300, originY: 120, tileWidth: 64 };
            const anchor = { x: 512, y: 384 };
            const mapPoint = screenToViewFraction(anchor.x, anchor.y, 0, before);

            const origin = zoomOrigin(before.originX, before.originY, anchor.x, anchor.y, 64, 128);
            const after: ViewParams = { heightStep: 16, originX: origin.x, originY: origin.y, tileWidth: 128 };
            const back = projectToScreen(mapPoint.x, mapPoint.y, 0, after);

            expect(back.x).toBeCloseTo(anchor.x);
            expect(back.y).toBeCloseTo(anchor.y);
        });

        it("should not move anything when the scale stays the same", () => {
            expect(zoomOrigin(10, 20, 500, 400, 64, 64)).toEqual({ x: 10, y: 20 });
        });
    });
});
