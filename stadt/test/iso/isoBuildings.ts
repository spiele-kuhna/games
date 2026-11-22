/* Dorfplaner – Unit-Tests für das Drehen der Gebäudegestaltung (src/iso/isoBuildings.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { BuildingPart } from "../../src/iso/buildingTable";
import { mapLocalToView, requiredHeadroom } from "../../src/iso/isoBuildings";
import { mapToView, Rotation } from "../../src/iso/projection";

const MAP = { height: 8, width: 10 };
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

/** Punkt (Kachel + Lage in der Kachel) in durchgehenden Ansichtskoordinaten */
function viewPoint(x: number, y: number, mu: number, mv: number, rotation: Rotation) {
    const tile = mapToView(x, y, MAP, rotation);
    const local = mapLocalToView(mu, mv, rotation);
    return { x: tile.x + local.u, y: tile.y + local.v };
}

describe("isoBuildings", () => {

    describe("mapLocalToView", () => {
        it("should not change anything without rotation", () => {
            expect(mapLocalToView(0.2, 0.7, 0)).toEqual({ u: 0.2, v: 0.7 });
        });

        it("should keep the tile centre in the centre", () => {
            for (const r of ROTATIONS) {
                expect(mapLocalToView(0.5, 0.5, r)).toEqual({ u: 0.5, v: 0.5 });
            }
        });

        it("should join neighbouring tiles seamlessly in every rotation", () => {
            for (const r of ROTATIONS) {
                // rechter Rand von (3, 5) = linker Rand von (4, 5)
                expect(viewPoint(3, 5, 1, 0.3, r)).toEqual(viewPoint(4, 5, 0, 0.3, r));
                // unterer Rand von (3, 5) = oberer Rand von (3, 6)
                expect(viewPoint(3, 5, 0.6, 1, r)).toEqual(viewPoint(3, 6, 0.6, 0, r));
            }
        });
    });

    describe("requiredHeadroom", () => {
        it("should leave room for the tallest skyscraper but stay below the painter's limit", () => {
            const tower: BuildingPart = { dx: 1, dy: 1, level: 4, size: 3, value: 3, zone: "commercial" };
            for (let variant = 0; variant < 64; variant++) {
                const headroom = requiredHeadroom(tower, 64, variant);
                expect(headroom).toBeGreaterThan(64);
                expect(headroom).toBeLessThanOrEqual(64 * 2.5);
            }
        });
    });
});
