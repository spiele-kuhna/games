/* Dorfplaner – Unit-Tests für die Gebäudetabelle der isometrischen Ansicht (src/iso/buildingTable.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { animationBase, buildingPartOf, MAX_LEVEL } from "../../src/iso/buildingTable";
import { zoneTypeOf } from "../../src/iso/tileKinds";
import * as TileValues from "../../src/tileValues";

describe("building table", () => {

    describe("centre tiles", () => {
        // Die Mittelkachel (ZONEBIT) eines Gebäudes liegt bei Größe 3 und 4 auf (1, 1), beim Flughafen auch.
        const centres: Array<[string, number, number]> = [
            ["FREEZ", TileValues.FREEZ, 3], ["HOSPITAL", TileValues.HOSPITAL, 3], ["CHURCH", TileValues.CHURCH, 3],
            ["COMCLR", TileValues.COMCLR, 3], ["INDCLR", TileValues.INDCLR, 3], ["PORT", TileValues.PORT, 4],
            ["AIRPORT", TileValues.AIRPORT, 6], ["POWERPLANT", TileValues.POWERPLANT, 4],
            ["FIRESTATION", TileValues.FIRESTATION, 3], ["POLICESTATION", TileValues.POLICESTATION, 3],
            ["STADIUM", TileValues.STADIUM, 4], ["FULLSTADIUM", TileValues.FULLSTADIUM, 4],
            ["NUCLEAR", TileValues.NUCLEAR, 4], ["CHURCH1", TileValues.CHURCH1, 3], ["CHURCH7", TileValues.CHURCH7, 3],
        ];

        for (const [name, value, size] of centres) {
            it(`should place ${name} in the middle of a ${size}×${size} building`, () => {
                expect(buildingPartOf(value)).toMatchObject({ dx: 1, dy: 1, size });
            });
        }
    });

    describe("zone growth stages", () => {
        it("should decode every residential stage like residential.js places it", () => {
            for (let landValue = 0; landValue < 4; landValue++) {
                for (let population = 0; population < 4; population++) {
                    const centre = ((landValue * 4) + population) * 9 + TileValues.RZB;
                    expect(buildingPartOf(centre)).toEqual({ dx: 1, dy: 1, level: population, size: 3,
                                                             value: landValue, zone: "residential" });
                }
            }
        });

        it("should decode every commercial stage like commercial.js places it", () => {
            for (let landValue = 0; landValue < 4; landValue++) {
                for (let population = 0; population < 5; population++) {
                    const centre = ((landValue * 5) + population) * 9 + TileValues.CZB;
                    expect(buildingPartOf(centre)).toMatchObject({ level: population, value: landValue,
                                                                   zone: "commercial" });
                }
            }
        });

        it("should decode every industrial stage like industrial.js places it", () => {
            for (let landValue = 0; landValue < 2; landValue++) {
                for (let population = 0; population < 4; population++) {
                    const centre = ((landValue * 4) + population) * 9 + TileValues.IZB;
                    expect(buildingPartOf(centre)).toMatchObject({ level: population, value: landValue,
                                                                   zone: "industrial" });
                }
            }
        });

        it("should mark empty zones with level -1", () => {
            expect(buildingPartOf(TileValues.FREEZ)!.level).toBe(-1);
            expect(buildingPartOf(TileValues.COMCLR)!.level).toBe(-1);
            expect(buildingPartOf(TileValues.INDCLR)!.level).toBe(-1);
        });

        it("should never exceed the maximum level", () => {
            for (let value = 0; value < TileValues.TILE_COUNT; value++) {
                const part = buildingPartOf(value);
                if (part !== null && MAX_LEVEL[part.zone] !== undefined) {
                    expect(part.level).toBeLessThanOrEqual(MAX_LEVEL[part.zone]);
                }
            }
        });
    });

    describe("positions", () => {
        it("should walk through a 3×3 building row by row", () => {
            const base = TileValues.RESBASE;
            const positions = [];
            for (let i = 0; i < 9; i++) {
                const part = buildingPartOf(base + i)!;
                positions.push([part.dx, part.dy]);
            }
            expect(positions).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]);
        });

        it("should cover all 36 tiles of the airport", () => {
            const seen: { [key: string]: boolean } = {};
            for (let value = TileValues.AIRPORTBASE; value < TileValues.AIRPORTBASE + 36; value++) {
                const part = buildingPartOf(value)!;
                expect(part.zone).toBe("airport");
                seen[part.dx + "," + part.dy] = true;
            }
            expect(Object.keys(seen).length).toBe(36);
        });

        it("should treat single houses as 1×1 buildings", () => {
            expect(buildingPartOf(TileValues.HOUSE)).toMatchObject({ dx: 0, dy: 0, size: 1, zone: "residential" });
            expect(buildingPartOf(TileValues.HHTHR)).toMatchObject({ size: 1 });
        });
    });

    describe("animation tiles", () => {
        it("should map animation frames back to the tile they replace", () => {
            expect(animationBase(TileValues.COALSMOKE1)).toBe(TileValues.COALBASE + 2);
            expect(animationBase(TileValues.COALSMOKE4 + 3)).toBe(TileValues.COALBASE + 7);
            expect(animationBase(TileValues.RADAR5)).toBe(TileValues.RADAR);
            expect(animationBase(TileValues.NUKESWIRL3)).toBe(820);
            expect(animationBase(TileValues.DIRT)).toBe(TileValues.DIRT);
        });

        it("should put the football game where stadia.js places it", () => {
            // stadia.js: FOOTBALLGAME1 auf Mitte + (1, 0), FOOTBALLGAME2 auf Mitte + (1, 1); Mitte ist (1, 1)
            expect(buildingPartOf(TileValues.FOOTBALLGAME1)).toMatchObject({ dx: 2, dy: 1, zone: "stadium" });
            expect(buildingPartOf(TileValues.FOOTBALLGAME2 + 5)).toMatchObject({ dx: 2, dy: 2, zone: "stadium" });
        });

        it("should put the radar where transport.js places it", () => {
            // transport.js: RADAR0 auf Mitte + (1, −1); Mitte des Flughafens ist (1, 1)
            expect(buildingPartOf(TileValues.RADAR0)).toMatchObject({ dx: 2, dy: 0, zone: "airport" });
        });
    });

    describe("consistency with tileKinds", () => {
        it("should agree on the zone type for every building tile", () => {
            for (let value = 0; value < TileValues.TILE_COUNT; value++) {
                const part = buildingPartOf(value);
                if (part !== null) {
                    expect({ value, zone: part.zone }).toEqual({ value, zone: zoneTypeOf(value) });
                }
            }
        });
    });
});
