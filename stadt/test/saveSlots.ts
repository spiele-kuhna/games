/* Dorfplaner – Unit-Tests für die Spielstände (src/saveSlots.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import { entryFor, exportFileName, gameDate, makeSaveId, parseIndex, removeEntry, SaveEntry, unwrapImport,
         upsertEntry, wrapForExport } from "../src/saveSlots";

const smallGame = { version: 3, name: "Neustadt", width: 2, height: 2, map: [{value: 0}, {value: 0}, {value: 0},
                    {value: 0}], _cityTime: 100, totalPop: 1234 };

describe("saveSlots", () => {

    describe("index", () => {
        it("should create distinct ids", () => {
            expect(makeSaveId(1000, 0.1)).not.toBe(makeSaveId(1000, 0.2));
            expect(makeSaveId(1000, 0.1)).not.toBe(makeSaveId(2000, 0.1));
        });

        it("should describe a game", () => {
            expect(entryFor("a", smallGame, 5)).toEqual(
                { id: "a", name: "Neustadt", savedAt: 5, cityTime: 100, population: 1234 });
            expect(entryFor("b", {}, 5).name).toBe("Ohne Namen");
        });

        it("should replace an entry with the same id and keep the newest first", () => {
            let index: SaveEntry[] = [];
            index = upsertEntry(index, entryFor("a", smallGame, 1));
            index = upsertEntry(index, entryFor("b", smallGame, 2));
            index = upsertEntry(index, entryFor("a", smallGame, 3));
            expect(index.map((e) => e.id)).toEqual(["a", "b"]);
            expect(index[0].savedAt).toBe(3);
        });

        it("should remove an entry", () => {
            const index = [entryFor("a", smallGame, 1), entryFor("b", smallGame, 2)];
            expect(removeEntry(index, "a").map((e) => e.id)).toEqual(["b"]);
        });

        it("should survive a missing or broken index", () => {
            expect(parseIndex(null)).toEqual([]);
            expect(parseIndex("kaputt")).toEqual([]);
            expect(parseIndex("{}")).toEqual([]);
            expect(parseIndex('[{"id":"a","name":"X","savedAt":1}, 42, {"id":3}]').length).toBe(1);
        });
    });

    describe("date", () => {
        it("should convert the simulation time like the game does", () => {
            expect(gameDate(0)).toEqual({ month: 0, year: 1900 });
            expect(gameDate(4)).toEqual({ month: 1, year: 1900 });
            expect(gameDate(47)).toEqual({ month: 11, year: 1900 });
            expect(gameDate(48)).toEqual({ month: 0, year: 1901 });
        });
    });

    describe("export and import", () => {
        it("should build a safe file name", () => {
            expect(exportFileName("Groß Süd", new Date(2026, 10, 2))).toBe("dorfplaner_Gross_Sued_2026-11-02.json");
            expect(exportFileName("../../", new Date(2026, 0, 15))).toBe("dorfplaner_stadt_2026-01-15.json");
        });

        it("should read back an exported game", () => {
            const result = unwrapImport(wrapForExport(smallGame, new Date(2026, 10, 22)));
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.game).toEqual(smallGame);
            }
        });

        it("should accept a plain saved game", () => {
            expect(unwrapImport(JSON.stringify(smallGame)).ok).toBe(true);
        });

        it("should accept games with water supply (version 4), but nothing newer", () => {
            expect(unwrapImport(JSON.stringify({ ...smallGame, pipes: "1,2,1", version: 4 })).ok).toBe(true);
            expect(unwrapImport(JSON.stringify({ ...smallGame, version: 5 })).ok).toBe(false);
        });

        it("should reject files that are not a game", () => {
            expect(unwrapImport("kein json").ok).toBe(false);
            expect(unwrapImport("42").ok).toBe(false);
            expect(unwrapImport('{"format":"etwas-anderes","game":{}}').ok).toBe(false);
            expect(unwrapImport(JSON.stringify({ ...smallGame, map: [] })).ok).toBe(false);
            expect(unwrapImport(JSON.stringify({ ...smallGame, version: 99 })).ok).toBe(false);
            expect(unwrapImport(JSON.stringify({ format: "dorfplaner-spielstand", formatVersion: 2,
                                                 game: smallGame })).ok).toBe(false);
        });
    });
});
