/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Gebäudetabelle: Zu welchem Gebäude gehört eine Kachel, und an welcher Stelle liegt sie darin?
 *
 * In der Simulation besteht ein 3×3-Gebäude aus 9 verschiedenen Kachelwerten, die in tileValues.ts direkt
 * hintereinander liegen – Zeile für Zeile von links oben nach rechts unten:
 *
 *     Wert − Basis:   0 1 2         Position (dx, dy):  (0,0) (1,0) (2,0)
 *                     3 4 5                             (0,1) (1,1) (2,1)
 *                     6 7 8                             (0,2) (1,2) (2,2)
 *
 * Die Mitte (Index 4) trägt in der Simulation das ZONEBIT. Für 4×4- und 6×6-Gebäude gilt dasselbe mit 16 bzw.
 * 36 Werten. Bei Wohn-, Gewerbe- und Industriegebieten folgen mehrere solche 9er-Gruppen aufeinander, eine je
 * Ausbaustufe; die Formeln stehen in residential.js, commercial.js und industrial.js (placeResidential usw.).
 *
 * Die isometrische Ansicht zeichnet jedes Gebäude Kachel für Kachel (docs/PLAN.md, 3.3). Dafür muss sie für
 * jede Kachel wissen: Gebäudeart, Größe, Position und Ausbaustufe.
 */

import { ZoneType } from "./tileKinds";

export interface BuildingPart {
    /** Art des Gebäudes */
    readonly zone: ZoneType;
    /** Kantenlänge in Kacheln: 1, 3, 4 oder 6 */
    readonly size: number;
    /** Position dieser Kachel im Gebäude, 0 … size − 1 (Kartenrichtungen) */
    readonly dx: number;
    readonly dy: number;
    /** Ausbaustufe (Dichte): −1 = leere Zone, sonst 0 … maxLevel */
    readonly level: number;
    /** Bodenwert-Stufe 0–3 (bei Industrie 0–1); bestimmt Farben und Ausstattung */
    readonly value: number;
}

/** Gruppen gleich großer Gebäude, die in tileValues.ts direkt aufeinander folgen. */
interface Group {
    readonly first: number;   // erster Kachelwert der ersten Gruppe
    readonly count: number;   // wie viele Gruppen hintereinander
    readonly size: number;
    readonly zone: ZoneType;
    /** Gruppennummer → Ausbaustufe und Bodenwert (Standard: leere Zone) */
    readonly levelOf?: (group: number) => { level: number, value: number };
}

const EMPTY = () => ({ level: -1, value: 0 });
const FIXED = () => ({ level: 0, value: 0 });

/*
 * Reihenfolge der Gruppen laut residential.js: Mitte = ((Bodenwert · 4) + Dichte) · 9 + RZB.
 * Gruppe g → Bodenwert floor(g / 4), Dichte g mod 4. Gewerbe hat 5 Dichtestufen, Industrie 4 bei 2 Bodenwerten.
 */
const GROUPS: Group[] = [
    { count: 1, first: 240, levelOf: EMPTY, size: 3, zone: "residential" },
    { count: 16, first: 261, levelOf: (g) => ({ level: g % 4, value: Math.floor(g / 4) }), size: 3,
      zone: "residential" },
    { count: 1, first: 405, levelOf: FIXED, size: 3, zone: "hospital" },
    { count: 1, first: 414, levelOf: FIXED, size: 3, zone: "church" },
    { count: 1, first: 423, levelOf: EMPTY, size: 3, zone: "commercial" },
    { count: 20, first: 432, levelOf: (g) => ({ level: g % 5, value: Math.floor(g / 5) }), size: 3,
      zone: "commercial" },
    { count: 1, first: 612, levelOf: EMPTY, size: 3, zone: "industrial" },
    { count: 8, first: 621, levelOf: (g) => ({ level: g % 4, value: Math.floor(g / 4) }), size: 3,
      zone: "industrial" },
    { count: 1, first: 693, levelOf: FIXED, size: 4, zone: "port" },
    { count: 1, first: 709, levelOf: FIXED, size: 6, zone: "airport" },
    { count: 1, first: 745, levelOf: FIXED, size: 4, zone: "coal" },
    { count: 1, first: 761, levelOf: FIXED, size: 3, zone: "fireStation" },
    { count: 1, first: 770, levelOf: FIXED, size: 3, zone: "police" },
    // Stadion leer (Stufe 0) und mit laufendem Spiel (Stufe 1)
    { count: 1, first: 779, levelOf: FIXED, size: 4, zone: "stadium" },
    { count: 1, first: 795, levelOf: () => ({ level: 1, value: 0 }), size: 4, zone: "stadium" },
    { count: 1, first: 811, levelOf: FIXED, size: 4, zone: "nuclear" },
    // Weitere Kirchen (CHURCH1 … CHURCH7)
    { count: 7, first: 956, levelOf: (g) => ({ level: 0, value: g % 4 }), size: 3, zone: "church" },
    // Dorfplaner: Pumpe und Wasserturm (je eine Kachel)
    { count: 1, first: 1020, levelOf: FIXED, size: 1, zone: "pump" },
    { count: 1, first: 1021, levelOf: FIXED, size: 1, zone: "waterTower" },
];

/*
 * Animationsbilder ersetzen einzelne Kacheln eines Gebäudes (animationManager.js, stadia.js, transport.js).
 * Für die Lage im Gebäude führen wir sie auf die Kachel zurück, die sie ersetzen.
 */
const ANIMATION_BASES: Array<{ from: number, to: number, base: number }> = [
    { base: 621, from: 852, to: 859 },     // Industrie, Rauch
    { base: 641, from: 884, to: 887 },
    { base: 644, from: 888, to: 891 },
    { base: 649, from: 892, to: 895 },
    { base: 650, from: 896, to: 899 },
    { base: 676, from: 900, to: 903 },
    { base: 677, from: 904, to: 907 },
    { base: 686, from: 908, to: 911 },
    { base: 689, from: 912, to: 915 },
    { base: 747, from: 916, to: 919 },     // Kohlekraftwerk, Schornsteine
    { base: 748, from: 920, to: 923 },
    { base: 751, from: 924, to: 927 },
    { base: 752, from: 928, to: 931 },
    { base: 820, from: 952, to: 955 },     // Kernkraftwerk, Reaktor
    { base: 711, from: 832, to: 839 },     // Flughafen, Radar
    { base: 801, from: 932, to: 939 },     // Stadion mit Spiel (stadia.js: Mitte + (1, 0) = Position (2, 1))
    { base: 805, from: 940, to: 947 },     // Stadion mit Spiel (Mitte + (1, 1) = Position (2, 2))
];

/** Kachelwert eines Animationsbilds → Kachelwert, den es ersetzt. Andere Werte bleiben unverändert. */
export function animationBase(value: number): number {
    for (const entry of ANIMATION_BASES) {
        if (value >= entry.from && value <= entry.to) {
            return entry.base;
        }
    }
    return value;
}

/** Einzelhäuser in einer noch leeren Wohnzone (residential.js: HOUSE + Zufall + Bodenwert · 3). */
const HOUSE_FIRST = 249;
const HOUSE_LAST = 260;

/** Gebäudeteil für einen Kachelwert, oder null, wenn auf der Kachel kein Gebäude steht. */
export function buildingPartOf(rawValue: number): BuildingPart | null {
    const value = animationBase(rawValue);

    if (value >= HOUSE_FIRST && value <= HOUSE_LAST) {
        return { dx: 0, dy: 0, level: 0, size: 1, value: Math.min(3, Math.floor((value - HOUSE_FIRST) / 3)),
                 zone: "residential" };
    }

    for (const group of GROUPS) {
        const tilesPerGroup = group.size * group.size;
        const offset = value - group.first;
        if (offset < 0 || offset >= tilesPerGroup * group.count) {
            continue;
        }
        const groupIndex = Math.floor(offset / tilesPerGroup);
        const index = offset % tilesPerGroup;
        const stage = group.levelOf ? group.levelOf(groupIndex) : EMPTY();
        return {
            dx: index % group.size,
            dy: Math.floor(index / group.size),
            level: stage.level,
            size: group.size,
            value: stage.value,
            zone: group.zone,
        };
    }
    return null;
}

/** Höchste Ausbaustufe je Gebäudeart (für Tests und Höhenberechnung). */
export const MAX_LEVEL: { [zone: string]: number } = {
    commercial: 4,
    industrial: 3,
    residential: 3,
    stadium: 1,
};
