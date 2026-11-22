/* Dorfplaner – Unit-Tests für die Übersichtskarte (src/ui/mapOverlay.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { describeTile, T } from "../../src/iso/tileKinds";
import { baseColour, coverageColour, heatColour, mapPointToTile, normalise, OVERLAYS } from "../../src/ui/mapOverlay";

describe("mapOverlay", () => {
    it("should offer each overlay once with a German label", () => {
        const ids = OVERLAYS.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(OVERLAYS.find((o) => o.id === "water")!.label).toBe("Wasser");
    });

    it("should colour water, roads and zones differently", () => {
        const water = baseColour(describeTile(T.RIVER));
        const road = baseColour(describeTile(T.ROADS + 1));
        const residential = baseColour(describeTile(T.RESBASE + 4));
        expect(new Set([water, road, residential]).size).toBe(3);
    });

    it("should leave the heat scale empty for low values and get redder for high ones", () => {
        expect(heatColour(0)).toBeNull();
        expect(heatColour(0.5)).not.toBeNull();
        expect(heatColour(1)).toContain("rgba(235, 0,");
        expect(coverageColour(0, true)).toBeNull();
    });

    it("should normalise simulation values to 0 … 1", () => {
        expect(normalise("pollution", 0)).toBe(0);
        expect(normalise("pollution", 400)).toBe(1);
        expect(normalise("landValue", 125)).toBeCloseTo(0.5);
        expect(normalise("zones", 100)).toBe(0);
    });

    it("should find the tile under a point of the map", () => {
        expect(mapPointToTile(5, 3, 2, 120, 100)).toEqual({ x: 2, y: 1 });
        expect(mapPointToTile(-1, 3, 2, 120, 100)).toBeNull();
        expect(mapPointToTile(241, 3, 2, 120, 100)).toBeNull();
    });
});
