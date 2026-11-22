/* Dorfplaner – mehrere Spielstände.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Reine Rechenfunktionen für die Spielstände – ohne localStorage und ohne DOM, deshalb mit Unit-Tests prüfbar
 * (test/saveSlots.ts). Das Lesen und Schreiben im Browser erledigt storage.js.
 *
 * Aufbau im Browser-Speicher (localStorage):
 *   dorfplaner.saves        Verzeichnis: Liste der Spielstände (Name, Datum, Einwohner …), ohne die Karte
 *   dorfplaner.save.<id>    ein vollständiger Spielstand (wie im Original micropolisJS)
 *
 * Als Datei (zum Mitnehmen in einen anderen Browser) wird ein Spielstand in eine kleine Hülle gepackt:
 *   { "format": "dorfplaner-spielstand", "formatVersion": 1, "exportedAt": "...", "game": { ... } }
 */

export const INDEX_KEY = "dorfplaner.saves";
export const SLOT_PREFIX = "dorfplaner.save.";
export const FILE_FORMAT = "dorfplaner-spielstand";
export const FILE_FORMAT_VERSION = 1;

/** Höchste Version der Spielstände, die das Spiel lesen kann (siehe Storage.CURRENT_VERSION). */
export const MAX_GAME_VERSION = 3;

/** Ein Eintrag im Verzeichnis der Spielstände. */
export interface SaveEntry {
    id: string;
    name: string;
    savedAt: number;        // Zeitpunkt des Speicherns (Millisekunden seit 1970)
    cityTime: number;       // Spielzeit der Simulation (48 Schritte je Jahr)
    population: number;
}

/** Der Teil eines Spielstands, den das Verzeichnis braucht. */
export interface GameDataSummary {
    name?: string;
    _cityTime?: number;
    totalPop?: number;
}

/** Neue, eindeutige Kennung aus Zeitpunkt und Zufallszahl (0 ≤ random < 1). */
export function makeSaveId(now: number, random: number): string {
    return now.toString(36) + "-" + Math.floor(random * 46656).toString(36);
}

/** Verzeichniseintrag zu einem Spielstand. */
export function entryFor(id: string, data: GameDataSummary, now: number): SaveEntry {
    return {
        id,
        name: data.name || "Ohne Namen",
        savedAt: now,
        cityTime: data._cityTime || 0,
        population: data.totalPop || 0,
    };
}

/** Eintrag hinzufügen oder (bei gleicher Kennung) ersetzen; neueste Spielstände zuerst. */
export function upsertEntry(index: SaveEntry[], entry: SaveEntry): SaveEntry[] {
    const result = index.filter((e) => e.id !== entry.id);
    result.push(entry);
    result.sort((a, b) => b.savedAt - a.savedAt);
    return result;
}

/** Eintrag entfernen. */
export function removeEntry(index: SaveEntry[], id: string): SaveEntry[] {
    return index.filter((e) => e.id !== id);
}

function isEntry(e: unknown): e is SaveEntry {
    const x = e as SaveEntry;
    return x !== null && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string" &&
        typeof x.savedAt === "number";
}

/** Verzeichnis aus dem Speicher lesen. Kaputte oder fehlende Daten ergeben eine leere Liste statt eines Absturzes. */
export function parseIndex(text: string | null): SaveEntry[] {
    if (text === null) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch (e) {
        return [];
    }
}

/** Spielzeit in Monat (0–11) und Jahr umrechnen – dieselbe Formel wie Simulation.getDate. */
export function gameDate(cityTime: number, startingYear = 1900): { month: number, year: number } {
    return {
        month: Math.floor(cityTime % 48) >> 2,
        year: Math.floor(cityTime / 48) + startingYear,
    };
}

function twoDigits(n: number): string {
    return (n < 10 ? "0" : "") + n;
}

/** Dateiname für den Export, z. B. „dorfplaner_Neustadt_2026-11-22.json“. Nur unbedenkliche Zeichen. */
export function exportFileName(name: string, date: Date): string {
    const safe = (name || "stadt")
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "stadt";
    const day = date.getFullYear() + "-" + twoDigits(date.getMonth() + 1) + "-" + twoDigits(date.getDate());
    return "dorfplaner_" + safe + "_" + day + ".json";
}

/** Spielstand für den Export in die Datei-Hülle packen. */
export function wrapForExport(game: object, date: Date): string {
    return JSON.stringify({
        format: FILE_FORMAT,
        formatVersion: FILE_FORMAT_VERSION,
        exportedAt: date.toISOString(),
        game,
    });
}

export type ImportResult = { ok: true, game: any } | { ok: false, error: string };

/**
 * Datei-Inhalt prüfen und den Spielstand herausholen. Angenommen werden die Dorfplaner-Hülle und – für alte
 * Sicherungen – ein nackter Spielstand. Geprüft wird nur der Aufbau, damit eine falsche Datei das Spiel nicht
 * beschädigt.
 */
export function unwrapImport(text: string): ImportResult {
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: "Die Datei ist kein Spielstand (kein gültiges JSON)." };
    }
    if (parsed === null || typeof parsed !== "object") {
        return { ok: false, error: "Die Datei ist kein Spielstand." };
    }

    let game = parsed;
    if (parsed.format !== undefined) {
        if (parsed.format !== FILE_FORMAT) {
            return { ok: false, error: "Die Datei ist kein Dorfplaner-Spielstand." };
        }
        if (typeof parsed.formatVersion !== "number" || parsed.formatVersion > FILE_FORMAT_VERSION) {
            return { ok: false, error: "Der Spielstand stammt aus einer neueren Fassung von Dorfplaner." };
        }
        game = parsed.game;
    }

    if (game === null || typeof game !== "object" || typeof game.width !== "number" ||
        typeof game.height !== "number" || !Array.isArray(game.map)) {
        return { ok: false, error: "In der Datei fehlt die Karte." };
    }
    if (game.map.length !== game.width * game.height) {
        return { ok: false, error: "Die Karte in der Datei ist unvollständig." };
    }
    if (typeof game.version !== "number" || game.version < 1 || game.version > MAX_GAME_VERSION) {
        return { ok: false, error: "Diese Version des Spielstands kennt das Spiel nicht." };
    }
    return { ok: true, game };
}
