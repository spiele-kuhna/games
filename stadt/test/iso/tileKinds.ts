/* Dorfplaner – Unit-Tests für die Kachel-Beschreibung der isometrischen Ansicht (src/iso/tileKinds.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { mapToView, Rotation } from "../../src/iso/projection";
import {
    describeTile, EAST, NORTH, normalizeRoad, rotateMask, SOUTH, T, WEST, zoneTypeOf,
} from "../../src/iso/tileKinds";
import * as TileValues from "../../src/tileValues";

const values = TileValues as unknown as { [name: string]: number };

describe("isometric tile kinds", () => {

    it("should use the same numbers as tileValues.ts", () => {
        for (const name of Object.keys(T)) {
            expect({ name, value: (T as { [name: string]: number })[name] })
                .toEqual({ name, value: values[name] });
        }
    });

    it("should describe every tile value without throwing", () => {
        for (let value = 0; value < TileValues.TILE_COUNT; value++) {
            expect(() => describeTile(value)).not.toThrow();
        }
    });

    describe("terrain", () => {
        it("should show dirt as plain land", () => {
            expect(describeTile(TileValues.DIRT)).toMatchObject({ cover: "none", ground: "land", roads: 0 });
        });

        it("should show all river and edge tiles as water", () => {
            for (let value = TileValues.RIVER; value <= TileValues.LASTRIVEDGE; value++) {
                expect(describeTile(value).ground).toBe("water");
            }
        });

        it("should show woods as trees", () => {
            expect(describeTile(TileValues.TREEBASE).cover).toBe("trees");
            expect(describeTile(TileValues.WOODS).cover).toBe("denseTrees");
            expect(describeTile(TileValues.WOODS5).cover).toBe("denseTrees");
        });

        it("should show fire, rubble and flood", () => {
            expect(describeTile(TileValues.FIRE).cover).toBe("fire");
            expect(describeTile(TileValues.RUBBLE).cover).toBe("rubble");
            expect(describeTile(TileValues.FLOOD).cover).toBe("flood");
            expect(describeTile(TileValues.RADTILE).cover).toBe("radioactive");
        });
    });

    describe("roads", () => {
        it("should strip traffic animation like TileUtils.normalizeRoad", () => {
            expect(normalizeRoad(TileValues.LTRFBASE + 2)).toBe(TileValues.ROADS);
            expect(normalizeRoad(TileValues.HTRFBASE + 12)).toBe(TileValues.INTERSECTION);
            expect(normalizeRoad(TileValues.DIRT)).toBe(TileValues.DIRT);
        });

        it("should decode straight roads and the crossing", () => {
            expect(describeTile(TileValues.ROADS).roads).toBe(EAST | WEST);
            expect(describeTile(TileValues.ROADS2).roads).toBe(NORTH | SOUTH);
            expect(describeTile(TileValues.INTERSECTION).roads).toBe(NORTH | EAST | SOUTH | WEST);
        });

        it("should decode curves and junctions as the inverse of connector.js", () => {
            // Aus RoadTable in connector.js: Index = Bitmaske der Nachbarn
            expect(describeTile(TileValues.ROADS3).roads).toBe(NORTH | EAST);
            expect(describeTile(TileValues.ROADS4).roads).toBe(EAST | SOUTH);
            expect(describeTile(TileValues.ROADS5).roads).toBe(SOUTH | WEST);
            expect(describeTile(TileValues.ROADS6).roads).toBe(NORTH | WEST);
            expect(describeTile(TileValues.ROADS7).roads).toBe(NORTH | EAST | WEST);
            expect(describeTile(TileValues.ROADS8).roads).toBe(NORTH | EAST | SOUTH);
            expect(describeTile(TileValues.ROADS9).roads).toBe(EAST | SOUTH | WEST);
            expect(describeTile(TileValues.ROADS10).roads).toBe(NORTH | SOUTH | WEST);
        });

        it("should keep the shape when traffic is shown", () => {
            expect(describeTile(TileValues.HTRFBASE + 5).roads).toBe(describeTile(TileValues.ROADS4).roads);
        });

        it("should show bridges over water", () => {
            expect(describeTile(TileValues.HBRIDGE)).toMatchObject({ bridge: true, ground: "water", roads: EAST | WEST });
            expect(describeTile(TileValues.VBRIDGE)).toMatchObject({ bridge: true, ground: "water",
                                                                     roads: NORTH | SOUTH });
            expect(describeTile(TileValues.BRWV).roads).toBe(NORTH | SOUTH);
            expect(describeTile(TileValues.VBRDG2).roads).toBe(NORTH | SOUTH);
        });

        it("should combine roads with power lines and rails", () => {
            expect(describeTile(TileValues.HROADPOWER)).toMatchObject({ roads: EAST | WEST, wires: NORTH | SOUTH });
            expect(describeTile(TileValues.HRAILROAD)).toMatchObject({ rails: EAST | WEST, roads: NORTH | SOUTH });
            expect(describeTile(TileValues.VRAILROAD)).toMatchObject({ rails: NORTH | SOUTH, roads: EAST | WEST });
        });
    });

    describe("rails and wires", () => {
        it("should decode rail shapes", () => {
            expect(describeTile(TileValues.LHRAIL).rails).toBe(EAST | WEST);
            expect(describeTile(TileValues.LVRAIL2).rails).toBe(NORTH | EAST);
            expect(describeTile(TileValues.LVRAIL10).rails).toBe(NORTH | EAST | SOUTH | WEST);
        });

        it("should decode wire shapes", () => {
            expect(describeTile(TileValues.LHPOWER).wires).toBe(EAST | WEST);
            expect(describeTile(TileValues.LVPOWER9).wires).toBe(NORTH | SOUTH | WEST);
            expect(describeTile(TileValues.HPOWER)).toMatchObject({ ground: "water", wires: EAST | WEST });
        });
    });

    describe("zones", () => {
        it("should recognise the main zone types", () => {
            expect(zoneTypeOf(TileValues.FREEZ)).toBe("residential");
            expect(zoneTypeOf(TileValues.HOUSE)).toBe("residential");
            expect(zoneTypeOf(TileValues.COMCLR)).toBe("commercial");
            expect(zoneTypeOf(TileValues.INDCLR)).toBe("industrial");
            expect(zoneTypeOf(TileValues.HOSPITAL)).toBe("hospital");
            expect(zoneTypeOf(TileValues.CHURCH)).toBe("church");
            expect(zoneTypeOf(TileValues.CHURCH4)).toBe("church");
        });

        it("should recognise the special buildings and their animation tiles", () => {
            expect(zoneTypeOf(TileValues.POWERPLANT)).toBe("coal");
            expect(zoneTypeOf(TileValues.COALSMOKE3)).toBe("coal");
            expect(zoneTypeOf(TileValues.NUCLEAR)).toBe("nuclear");
            expect(zoneTypeOf(TileValues.NUKESWIRL2)).toBe("nuclear");
            expect(zoneTypeOf(TileValues.PORT)).toBe("port");
            expect(zoneTypeOf(TileValues.AIRPORT)).toBe("airport");
            expect(zoneTypeOf(TileValues.RADAR3)).toBe("airport");
            expect(zoneTypeOf(TileValues.STADIUM)).toBe("stadium");
            expect(zoneTypeOf(TileValues.FULLSTADIUM)).toBe("stadium");
            expect(zoneTypeOf(TileValues.FOOTBALLGAME2)).toBe("stadium");
            expect(zoneTypeOf(TileValues.FIRESTATION)).toBe("fireStation");
            expect(zoneTypeOf(TileValues.POLICESTATION)).toBe("police");
            expect(zoneTypeOf(TileValues.FOUNTAIN)).toBe("park");
        });

        it("should not treat terrain and networks as zones", () => {
            expect(zoneTypeOf(TileValues.DIRT)).toBeNull();
            expect(zoneTypeOf(TileValues.ROADS)).toBeNull();
            expect(zoneTypeOf(TileValues.LHRAIL)).toBeNull();
        });
    });

    describe("rotating connection masks", () => {
        const MAP = { width: 120, height: 100 };
        const STEPS = [
            { dx: 0, dy: -1, mask: NORTH }, { dx: 1, dy: 0, mask: EAST },
            { dx: 0, dy: 1, mask: SOUTH }, { dx: -1, dy: 0, mask: WEST },
        ];

        it("should agree with the rotation of map coordinates", () => {
            // Ein Schritt in Kartenrichtung muss in der Ansicht genau der gedrehten Richtung entsprechen.
            for (const rotation of [0, 1, 2, 3] as Rotation[]) {
                for (const step of STEPS) {
                    const from = mapToView(50, 50, MAP, rotation);
                    const to = mapToView(50 + step.dx, 50 + step.dy, MAP, rotation);
                    const viewStep = { dx: to.x - from.x, dy: to.y - from.y };
                    const expected = STEPS.filter((s) => s.dx === viewStep.dx && s.dy === viewStep.dy)[0].mask;
                    expect(rotateMask(step.mask, rotation)).toBe(expected);
                }
            }
        });

        it("should keep combined masks together", () => {
            expect(rotateMask(NORTH | EAST, 1)).toBe(EAST | SOUTH);
            expect(rotateMask(NORTH | EAST | SOUTH | WEST, 3)).toBe(NORTH | EAST | SOUTH | WEST);
            expect(rotateMask(EAST | WEST, 2)).toBe(EAST | WEST);
        });
    });
});
