/* Dorfplaner – Unit-Tests für das weiche Überblenden der Fahrzeuge (src/iso/isoSprites.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { interpolatedPosition, SpriteLike } from "../../src/iso/isoSprites";

const base = { frame: 1, type: 3, width: 48, xOffset: -24, yOffset: -24 };

describe("isoSprites", () => {
    it("should show the simulated position without movement data", () => {
        const sprite = { ...base, x: 100, y: 50 } as SpriteLike;
        expect(interpolatedPosition(sprite, 1000)).toEqual({ x: 100, y: 50 });
    });

    it("should blend between the old and the new position", () => {
        const sprite = { ...base, moveInterval: 180, movedAt: 1000, shownFromX: 92, shownFromY: 50, x: 100,
                         y: 50 } as SpriteLike;
        expect(interpolatedPosition(sprite, 1000)).toEqual({ x: 92, y: 50 });
        expect(interpolatedPosition(sprite, 1090)).toEqual({ x: 96, y: 50 });
        expect(interpolatedPosition(sprite, 5000)).toEqual({ x: 100, y: 50 });
    });

    it("should not blend large jumps", () => {
        const sprite = { ...base, moveInterval: 180, movedAt: 1000, shownFromX: 0, shownFromY: 0, x: 400,
                         y: 300 } as SpriteLike;
        expect(interpolatedPosition(sprite, 1090)).toEqual({ x: 400, y: 300 });
    });
});
