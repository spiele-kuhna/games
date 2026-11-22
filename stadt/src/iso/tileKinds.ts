/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Was liegt auf einer Kachel? Diese Datei übersetzt einen Kachelwert (0–1023, siehe tileValues.ts) in eine
 * Beschreibung, mit der die isometrische Ansicht ihre eigenen Bilder zeichnen kann: Untergrund, Straßen-,
 * Schienen- und Leitungsanschlüsse, Bewuchs, Zone.
 *
 * Die Anschlüsse werden als Bitmaske in KARTEN-Richtungen angegeben, genau wie in connector.js:
 *
 *   NORTH = 1 (y − 1)   EAST = 2 (x + 1)   SOUTH = 4 (y + 1)   WEST = 8 (x − 1)
 *
 * Die Umrechnung in die gedrehte Ansicht macht rotateMask().
 */

import { Rotation } from "./projection";

export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

const NORTH_SOUTH = NORTH | SOUTH;
const EAST_WEST = EAST | WEST;

/** Untergrund einer Kachel. */
export type Ground = "land" | "water";

/** Was auf dem Untergrund steht oder liegt. */
export type Cover = "none" | "trees" | "denseTrees" | "rubble" | "flood" | "radioactive" | "fire" | "zone";

/** Art einer Zone oder eines Gebäudes; Grundlage für Farbe und (ab Arbeitspaket 3) Gebäudeform. */
export type ZoneType = "residential" | "hospital" | "church" | "commercial" | "industrial" | "port" | "airport" |
                       "coal" | "fireStation" | "police" | "stadium" | "nuclear" | "park" | "pump" | "waterTower";

export interface TileLook {
    readonly ground: Ground;
    readonly cover: Cover;
    /** Straßenanschlüsse als Bitmaske (NORTH | EAST | …). */
    readonly roads: number;
    readonly rails: number;
    readonly wires: number;
    /** Straße oder Schiene als Brücke über Wasser. */
    readonly bridge: boolean;
    /** nur bei cover = "zone" */
    readonly zone: ZoneType | null;
}

interface LookParts {
    ground?: Ground;
    cover?: Cover;
    roads?: number;
    rails?: number;
    wires?: number;
    bridge?: boolean;
    zone?: ZoneType | null;
}

function look(parts: LookParts): TileLook {
    return {
        bridge: parts.bridge || false,
        cover: parts.cover || "none",
        ground: parts.ground || "land",
        rails: parts.rails || 0,
        roads: parts.roads || 0,
        wires: parts.wires || 0,
        zone: parts.zone || null,
    };
}

/*
 * Kurven, Abzweige und Kreuzungen: Reihenfolge wie die Formen in tileValues.ts. Die Werte sind die
 * Umkehrung der Tabellen RoadTable/RailTable/WireTable in connector.js.
 *
 *   gerade O–W, gerade N–S, N+O, O+S, S+W, N+W, N+O+W, N+O+S, O+S+W, N+S+W, Kreuzung
 */
const SHAPE_MASKS = [
    EAST_WEST, NORTH_SOUTH, NORTH | EAST, EAST | SOUTH, SOUTH | WEST, NORTH | WEST,
    NORTH | EAST | WEST, NORTH | EAST | SOUTH, EAST | SOUTH | WEST, NORTH | SOUTH | WEST,
    NORTH | EAST | SOUTH | WEST,
];

// Kachelwerte aus tileValues.ts, die wir hier brauchen. Als Zahlen, damit diese Datei ohne weitere
// Abhängigkeiten testbar bleibt; test/iso/tileKinds.ts prüft sie gegen tileValues.ts.
export const T = {
    BRWH: 79, BRWV: 95, CHANNEL: 4, CHURCHBASE: 414, CHURCH1BASE: 956, CHURCH7LAST: 1018, COALBASE: 745,
    COALSMOKE1: 916, COMBASE: 423, FIREBASE: 56, FIRESTBASE: 761, FIRSTRIVEDGE: 5, FLOOD: 48, FOUNTAIN: 840,
    FOOTBALLGAME1: 932, HBRDG0: 828, HBRIDGE: 64, HOSPITALBASE: 405, HPOWER: 208, HRAIL: 224,
    HRAILROAD: 237, HROADPOWER: 77, INDBASE: 612, INDBASE2: 844, LASTFLOOD: 51, LASTRIVEDGE: 20,
    LASTROAD: 206, LASTRUBBLE: 47, LASTTREE: 36, LASTTINYEXP: 867, LASTZONE: 826, LHPOWER: 210,
    LHRAIL: 226, LIGHTNINGBOLT: 827, NUCLEARBASE: 811, NUKESWIRL1: 952, NUKESWIRL4: 955, POLICESTBASE: 770,
    PORTBASE: 693, AIRPORTBASE: 709, RADAR0: 832, RADAR7: 839, RADTILE: 52, RAILHPOWERV: 221,
    RAILVPOWERH: 222, RESBASE: 240, RIVER: 2, ROADS: 66, RUBBLE: 44, STADIUMBASE: 779, TINYEXP: 860,
    TINYEXPLAST: 883, TREEBASE: 21, VBRDG0: 948, VBRDG3: 951, VBRIDGE: 65, VPOWER: 209, VRAIL: 225,
    VRAILROAD: 238, VROADPOWER: 78, WOODS: 37, WOODS5: 43,
    PUMP: 1020, WATER_TOWER: 1021,
};

/** Straßen mit Verkehr (80–206) auf die Grundform 64–79 zurückführen, wie TileUtils.normalizeRoad(). */
export function normalizeRoad(value: number): number {
    return value >= T.HBRIDGE && value <= T.LASTROAD + 1 ? (value & 15) + 64 : value;
}

function inRange(value: number, low: number, high: number): boolean {
    return value >= low && value <= high;
}

/** Zone oder Gebäude anhand des Kachelwerts; null, wenn der Wert zu keinem Gebäude gehört. */
export function zoneTypeOf(value: number): ZoneType | null {
    if (inRange(value, T.RESBASE, T.HOSPITALBASE - 1)) { return "residential"; }
    if (inRange(value, T.HOSPITALBASE, T.CHURCHBASE - 1)) { return "hospital"; }
    if (inRange(value, T.CHURCHBASE, T.COMBASE - 1)) { return "church"; }
    if (inRange(value, T.COMBASE, T.INDBASE - 1)) { return "commercial"; }
    if (inRange(value, T.INDBASE, T.PORTBASE - 1)) { return "industrial"; }
    if (inRange(value, T.PORTBASE, T.AIRPORTBASE - 1)) { return "port"; }
    if (inRange(value, T.AIRPORTBASE, T.COALBASE - 1)) { return "airport"; }
    if (inRange(value, T.COALBASE, T.FIRESTBASE - 1)) { return "coal"; }
    if (inRange(value, T.FIRESTBASE, T.POLICESTBASE - 1)) { return "fireStation"; }
    if (inRange(value, T.POLICESTBASE, T.STADIUMBASE - 1)) { return "police"; }
    if (inRange(value, T.STADIUMBASE, T.NUCLEARBASE - 1)) { return "stadium"; }
    if (inRange(value, T.NUCLEARBASE, T.LASTZONE)) { return "nuclear"; }

    // Animationsbilder, die zu einem Gebäude gehören (Radar, Rauch, Fußballspiel, Reaktor, Kirchen)
    if (value === T.LIGHTNINGBOLT) { return null; }
    if (inRange(value, T.RADAR0, T.RADAR7)) { return "airport"; }
    if (inRange(value, T.FOUNTAIN, T.FOUNTAIN + 3)) { return "park"; }
    if (inRange(value, T.INDBASE2, T.TINYEXP - 1)) { return "industrial"; }
    if (inRange(value, T.TINYEXPLAST + 1, T.COALSMOKE1 - 1)) { return "industrial"; }
    if (inRange(value, T.COALSMOKE1, T.FOOTBALLGAME1 - 1)) { return "coal"; }
    if (inRange(value, T.FOOTBALLGAME1, T.VBRDG0 - 1)) { return "stadium"; }
    if (inRange(value, T.NUKESWIRL1, T.NUKESWIRL4)) { return "nuclear"; }
    if (inRange(value, T.CHURCH1BASE, T.CHURCH7LAST)) { return "church"; }
    // Dorfplaner: Wasserversorgung
    if (value === T.PUMP) { return "pump"; }
    if (value === T.WATER_TOWER) { return "waterTower"; }
    return null;
}

/** Wie sieht eine Kachel mit diesem Wert aus? Unbekannte Werte werden als leeres Land gezeichnet. */
export function describeTile(value: number): TileLook {
    // Wasser
    if (inRange(value, T.RIVER, T.CHANNEL) || inRange(value, T.FIRSTRIVEDGE, T.LASTRIVEDGE)) {
        return look({ ground: "water" });
    }
    // Wald: Waldränder lichter, Waldinneres dicht
    if (inRange(value, T.TREEBASE, T.LASTTREE)) { return look({ cover: "trees" }); }
    if (inRange(value, T.WOODS, T.WOODS5)) { return look({ cover: "denseTrees" }); }

    if (inRange(value, T.RUBBLE, T.LASTRUBBLE)) { return look({ cover: "rubble" }); }
    if (inRange(value, T.FLOOD, T.LASTFLOOD)) { return look({ cover: "flood" }); }
    if (value === T.RADTILE) { return look({ cover: "radioactive" }); }
    if (inRange(value, T.RADTILE + 1, T.FIREBASE - 1)) { return look({ cover: "rubble" }); }
    if (inRange(value, T.FIREBASE, T.HBRIDGE - 1)) { return look({ cover: "fire" }); }
    if (inRange(value, T.TINYEXP, T.TINYEXPLAST)) { return look({ cover: "fire" }); }

    // Brücken (auch die Bilder der sich öffnenden Zugbrücke)
    if (value === T.BRWV || inRange(value, T.VBRDG0, T.VBRDG3)) {
        return look({ bridge: true, ground: "water", roads: NORTH_SOUTH });
    }
    if (inRange(value, T.HBRDG0, T.HBRDG0 + 3)) {
        return look({ bridge: true, ground: "water", roads: EAST_WEST });
    }

    // Straßen (mit und ohne Verkehr)
    const road = normalizeRoad(value);
    if (inRange(value, T.HBRIDGE, T.LASTROAD + 1)) {
        switch (road) {
            case T.HBRIDGE: return look({ bridge: true, ground: "water", roads: EAST_WEST });
            case T.VBRIDGE: return look({ bridge: true, ground: "water", roads: NORTH_SOUTH });
            case T.HROADPOWER: return look({ roads: EAST_WEST, wires: NORTH_SOUTH });
            case T.VROADPOWER: return look({ roads: NORTH_SOUTH, wires: EAST_WEST });
            case T.BRWH: return look({ bridge: true, ground: "water", roads: EAST_WEST });
            default: return look({ roads: SHAPE_MASKS[road - T.ROADS] || 0 });
        }
    }

    // Stromleitungen
    if (value === T.HPOWER) { return look({ ground: "water", wires: EAST_WEST }); }
    if (value === T.VPOWER) { return look({ ground: "water", wires: NORTH_SOUTH }); }
    if (inRange(value, T.LHPOWER, T.LHPOWER + 10)) { return look({ wires: SHAPE_MASKS[value - T.LHPOWER] }); }
    if (value === T.RAILHPOWERV) { return look({ rails: EAST_WEST, wires: NORTH_SOUTH }); }
    if (value === T.RAILVPOWERH) { return look({ rails: NORTH_SOUTH, wires: EAST_WEST }); }

    // Schienen
    if (value === T.HRAIL) { return look({ bridge: true, ground: "water", rails: EAST_WEST }); }
    if (value === T.VRAIL) { return look({ bridge: true, ground: "water", rails: NORTH_SOUTH }); }
    if (inRange(value, T.LHRAIL, T.LHRAIL + 10)) { return look({ rails: SHAPE_MASKS[value - T.LHRAIL] }); }
    if (value === T.HRAILROAD) { return look({ rails: EAST_WEST, roads: NORTH_SOUTH }); }
    if (value === T.VRAILROAD) { return look({ rails: NORTH_SOUTH, roads: EAST_WEST }); }

    // Zonen und Gebäude
    const zone = zoneTypeOf(value);
    if (zone !== null) {
        return look({ cover: "zone", zone });
    }
    return look({});
}

/*
 * Bitmaske von Karten-Richtungen in Ansichts-Richtungen umrechnen. Gleiche Bits, andere Bedeutung:
 * in der Ansicht heißt NORTH „vy − 1“, EAST „vx + 1“ usw.
 *
 * Bei rotation = 1 gilt vx = H − 1 − y und vy = x (projection.ts). Ein Schritt nach Kartennorden (y − 1)
 * ist also ein Schritt vx + 1 – in der Ansicht „Osten“. Jede Drehung schiebt die Richtungen eins weiter.
 */
export function rotateMask(mask: number, rotation: Rotation): number {
    let result = mask & 15;
    for (let i = 0; i < rotation; i++) {
        // N→O, O→S, S→W, W→N: Bits um eins nach links, das oberste wandert nach unten.
        result = ((result << 1) | (result >> 3)) & 15;
    }
    return result;
}

// ---- Animationen (Arbeitspaket 4) ---------------------------------------------------------------------------

/** Verkehr auf einer Straße: Stärke 0 (keiner), 1 (wenig), 2 (viel) und Animationsbild 0–3. */
export interface Traffic {
    readonly level: number;
    readonly frame: number;
}

/*
 * Straßen mit Verkehr liegen in tileValues.ts in vier 16er-Blöcken je Stärke (wenig: 80–143, viel: 144–207).
 * Jeder Block ist ein Animationsbild; der AnimationManager schaltet zwischen ihnen um.
 */
export function trafficOf(value: number): Traffic {
    if (value >= 80 && value <= 143) {
        return { frame: Math.floor((value - 80) / 16), level: 1 };
    }
    if (value >= 144 && value <= 207) {
        return { frame: Math.floor((value - 144) / 16), level: 2 };
    }
    return { frame: 0, level: 0 };
}

/** Bereiche mit Animationsbildern: erster Wert, Anzahl Bilder je Folge, Länge des ganzen Bereichs. */
const ANIMATION_RANGES: Array<{ from: number, to: number, frames: number, smoke: boolean }> = [
    { frames: 8, from: 56, smoke: false, to: 63 },     // Feuer
    { frames: 8, from: 832, smoke: false, to: 839 },   // Radar
    { frames: 4, from: 840, smoke: false, to: 843 },   // Brunnen
    { frames: 8, from: 844, smoke: true, to: 851 },    // Industrie
    { frames: 8, from: 852, smoke: true, to: 859 },    // Industrie, Rauch
    { frames: 24, from: 860, smoke: false, to: 883 },  // kleine Explosionen
    { frames: 4, from: 884, smoke: true, to: 915 },    // Industrie, Rauch (8 Folgen à 4 Bilder)
    { frames: 4, from: 916, smoke: true, to: 931 },    // Kohlekraftwerk, Schornsteine (4 Folgen à 4)
    { frames: 8, from: 932, smoke: false, to: 947 },   // Fußballspiel (2 Folgen à 8)
    { frames: 4, from: 948, smoke: false, to: 951 },   // Zugbrücke senkrecht
    { frames: 4, from: 828, smoke: false, to: 831 },   // Zugbrücke waagerecht
    { frames: 4, from: 952, smoke: false, to: 955 },   // Reaktor
];

/** Nummer des Animationsbilds (0 …) oder −1, wenn der Wert kein Animationsbild ist. */
export function animationFrameOf(value: number): number {
    for (const range of ANIMATION_RANGES) {
        if (value >= range.from && value <= range.to) {
            return (value - range.from) % range.frames;
        }
    }
    return -1;
}

/** Steigt aus dieser Kachel gerade Rauch auf? */
export function isSmoke(value: number): boolean {
    for (const range of ANIMATION_RANGES) {
        if (value >= range.from && value <= range.to) {
            return range.smoke;
        }
    }
    return false;
}

/** Blitz-Symbol: So markiert der AnimationManager Zonen ohne Strom (Blinken). */
export const LIGHTNING_BOLT = 827;
