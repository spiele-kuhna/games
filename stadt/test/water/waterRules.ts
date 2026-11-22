/* Dorfplaner – Unit-Tests für die Wasserregeln (src/water/waterRules.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { balanceNetwork, CONSUMER, decodePipes, encodePipes, findNetworks, mayGrow, NOTHING, PIPE, pumpCapacity,
         residentialGrowthTarget, residentialLevel, shouldShrink, SOURCE,
         TOWER_STORAGE } from "../../src/water/waterRules";

describe("waterRules", () => {

    describe("pumps", () => {
        it("should deliver nothing without power", () => {
            expect(pumpCapacity(false, true)).toBe(0);
        });

        it("should deliver twice as much next to water", () => {
            expect(pumpCapacity(true, true)).toBe(2 * pumpCapacity(true, false));
        });
    });

    describe("zone growth", () => {
        it("should always allow growth with water", () => {
            expect(mayGrow("residential", 32, true)).toBe(true);
        });

        it("should know the residential levels", () => {
            expect(residentialLevel(8)).toBe(-1);
            expect(residentialLevel(24)).toBe(0);
            expect(residentialLevel(48)).toBe(3);
        });

        it("should limit the growth target without water", () => {
            expect(residentialGrowthTarget(24, true)).toBe(2);    // Sprung wie im Original
            expect(residentialGrowthTarget(24, false)).toBe(1);
        });

        it("should stop at the middle level without water", () => {
            expect(mayGrow("residential", 24, false)).toBe(true);
            expect(mayGrow("residential", 32, false)).toBe(false);
            expect(mayGrow("commercial", 1, false)).toBe(true);
            expect(mayGrow("commercial", 2, false)).toBe(false);
            expect(mayGrow("industrial", 2, false)).toBe(false);
        });

        it("should shrink dense zones without water only after the grace period", () => {
            expect(shouldShrink("residential", 40, false, 10, 48)).toBe(false);
            expect(shouldShrink("residential", 40, false, 48, 48)).toBe(true);
            expect(shouldShrink("residential", 32, false, 100, 48)).toBe(false);
            expect(shouldShrink("residential", 40, true, 100, 48)).toBe(false);
            expect(shouldShrink("commercial", 3, false, 100, 48)).toBe(true);
        });
    });

    describe("balance", () => {
        it("should supply everything when the pumps are strong enough", () => {
            expect(balanceNetwork(150, [], 100)).toEqual({ shortage: false, supplied: 100, towerLevels: [] });
        });

        it("should report a shortage and supply what is there", () => {
            expect(balanceNetwork(150, [], 200)).toEqual({ shortage: true, supplied: 150, towerLevels: [] });
        });

        it("should fill towers with the surplus, but not above their size", () => {
            expect(balanceNetwork(150, [0, 0], 50).towerLevels).toEqual([50, 50]);
            expect(balanceNetwork(2000, [590, 0], 0).towerLevels).toEqual([TOWER_STORAGE, TOWER_STORAGE]);
        });

        it("should drain towers when the pumps fail", () => {
            const result = balanceNetwork(0, [300, 100], 200);
            expect(result.supplied).toBe(200);
            expect(result.shortage).toBe(false);
            expect(result.towerLevels[0] + result.towerLevels[1]).toBe(200);
        });

        it("should run dry when the towers are empty", () => {
            const result = balanceNetwork(0, [50], 200);
            expect(result).toEqual({ shortage: true, supplied: 50, towerLevels: [0] });
        });
    });

    describe("networks", () => {
        // S = Quelle, P = Rohr, C = Gebäude, . = nichts
        function grid(rows: string[]) {
            const kinds: { [c: string]: number } = { ".": NOTHING, "C": CONSUMER, "P": PIPE, "S": SOURCE };
            return (x: number, y: number) => kinds[rows[y][x]];
        }

        it("should follow pipes and buildings from a source", () => {
            const networks = findNetworks(5, 3, grid(["SPPC.",
                                                       "...C.",
                                                       "C...."]));
            expect(networks.length).toBe(1);
            expect(networks[0].sources).toEqual([0]);
            expect(networks[0].consumers).toEqual([3, 8]);   // das Gebäude unten links ist nicht angeschlossen
        });

        it("should merge two sources in one network", () => {
            const networks = findNetworks(4, 1, grid(["SPCS"]));
            expect(networks.length).toBe(1);
            expect(networks[0].sources.length).toBe(2);
        });

        it("should keep separate networks apart", () => {
            const networks = findNetworks(5, 1, grid(["SC.CS"]));
            expect(networks.length).toBe(2);
        });
    });

    describe("saving pipes", () => {
        it("should encode and decode the pipe map", () => {
            const pipes = [0, 0, 1, 1, 1, 0, 1];
            expect(encodePipes(pipes)).toBe("2,3,1,1");
            expect(decodePipes(encodePipes(pipes), pipes.length)).toEqual(pipes);
        });

        it("should handle a map starting with a pipe and an empty map", () => {
            expect(decodePipes(encodePipes([1, 0]), 2)).toEqual([1, 0]);
            expect(decodePipes(encodePipes([0, 0, 0]), 3)).toEqual([0, 0, 0]);
        });

        it("should survive missing or broken text", () => {
            expect(decodePipes(undefined, 3)).toEqual([0, 0, 0]);
            expect(decodePipes("x?", 2)).toEqual([0, 0]);
        });
    });
});
