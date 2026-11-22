/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Gebäude mit Höhe – komplett selbst gezeichnet aus einfachen Formen (Quader, Dächer, Zylinder, Bäume).
 *
 * Jede Kachel eines Gebäudes zeichnet nur, was auf IHRER Fläche steht (docs/PLAN.md, 3.3). Weil die Kacheln
 * von hinten nach vorn gezeichnet werden, ergibt sich daraus automatisch das richtige Bild – auch wenn auf
 * benachbarten Kacheln unterschiedlich hohe Häuser stehen.
 *
 * Damit eine Zone nicht wie neun gleiche Klötze aussieht, bekommt jede Kachel eine eigene „Würfelzahl“
 * (seed): Daraus ergeben sich Größe, Höhe, Farben und Dachform. Die Zahl hängt nur von der Kartenposition
 * und der Position im Gebäude ab – dasselbe Haus sieht also immer gleich aus, auch nach dem Drehen.
 *
 * Die Gestaltung (designFor) beschreibt jede Kachel in Kartenrichtungen; beim Zeichnen wird sie in die
 * gedrehte Ansicht umgerechnet (mapLocalToView).
 *
 * Kachelkoordinaten (u, v) von 0 bis 1 wie in isoPainter.ts; Licht kommt von links oben. Darum ist die
 * rechte Wand am dunkelsten, die linke etwas heller, das Dach am hellsten; Schatten fallen nach rechts.
 */

import { BuildingPart } from "./buildingTable";

/** Was die Gebäude-Zeichnung vom IsoTilePainter braucht. */
export interface LocalGeometry {
    readonly tileWidth: number;
    /** Kachelkoordinaten (u, v) und Höhe über dem Boden in Pixeln → Pixel relativ zur oberen Rautenspitze */
    localToScreen(u: number, v: number, lift?: number): { x: number, y: number };
}

interface Point { x: number; y: number; }
type RoofStyle = "flat" | "parapet" | "gableU" | "gableV" | "hip" | "spire" | "sawtooth";
type Facade = "none" | "house" | "apartment" | "office" | "glass" | "shop" | "garage" | "firebay" | "police" | "hall";
type Rooftop = "none" | "unit" | "antenna" | "helipad" | "tank" | "siren" | "chimney" | "skylight";

/** Ein Quader auf der Kachel: Grundfläche (u0, v0)–(u1, v1), Höhe in Rautenbreiten. */
interface Box {
    kind: "box";
    u0: number; v0: number; u1: number; v1: number;
    height: number;
    /** Höhe der Unterkante (für Aufbauten und Hochhaus-Staffeln), in Rautenbreiten; meist 0 */
    z0: number;
    wall: string;
    roof: string;
    roofStyle: RoofStyle;
    facade: Facade;
    /** Farbe der Markise über dem Schaufenster (nur facade = "shop") */
    accent?: string;
    /** kleine Aufbauten auf dem Dach */
    rooftop?: Rooftop;
}

interface Tank { kind: "tank"; u: number; v: number; radius: number; height: number; colour: string; }
interface Tree { kind: "tree"; u: number; v: number; size: number; conifer: boolean; }
interface Chimney { kind: "chimney"; u: number; v: number; height: number; }
/** Halde (Kohle, Sand): flacher Kegel */
interface Pile { kind: "pile"; u: number; v: number; colour: string; size: number; }
/** Kühlturm: unten breit, in der Mitte eingeschnürt, oben wieder etwas breiter */
interface CoolingTower { kind: "coolingTower"; u: number; v: number; radius: number; height: number; }
/** Reaktorgebäude: Zylinder mit Kuppel */
interface Dome { kind: "dome"; u: number; v: number; radius: number; height: number; colour: string; }
/** Fahrzeug, das irgendwo parkt; along = Längsrichtung (Karte) */
interface Vehicle {
    kind: "vehicle"; u: number; v: number;
    type: "fireTruck" | "ladderTruck" | "policeCar" | "plane" | "car" | "van" | "bulldozer";
    colour?: string;
    along?: "u" | "v";
}
/** Schild auf dem Dach (kurzer Text, z. B. „FW“) – hilft beim Erkennen öffentlicher Gebäude */
interface Sign { kind: "sign"; u: number; v: number; z: number; text: string; colour: string; background: string; }
/** Kontrollturm des Flughafens: schmaler Schaft mit verglaster Kanzel */
interface ControlTower { kind: "controlTower"; u: number; v: number; height: number; }
/** Strommast (Gittermast mit Querträgern) */
interface Pylon { kind: "pylon"; u: number; v: number; height: number; }
/** Funkmast mit rotem Licht; base = Höhe des Fußpunkts (z. B. auf einem Dach) */
interface Mast { kind: "mast"; u: number; v: number; height: number; base: number; }
/** Fahnenmast mit Fahne */
interface Flag { kind: "flag"; u: number; v: number; height: number; base: number; colour: string; }
/** Wasserturm: Behälter auf vier Stützen */
interface WaterTank { kind: "waterTank"; u: number; v: number; height: number; }
/** Förderband zwischen zwei Punkten (mit Höhe) */
interface Conveyor { kind: "conveyor"; u0: number; v0: number; z0: number; u1: number; v1: number; z1: number; }

type Item = Box | Tank | Tree | Chimney | Pile | CoolingTower | Dome | Vehicle | Sign | ControlTower | Pylon | Mast |
            Flag | Conveyor | WaterTank;

type Ground = "none" | "parking" | "field" | "runway" | "garden" | "apron" | "yard" | "playground" | "plaza" |
              "gravel";

/** Alles, was auf einer Gebäudekachel gezeichnet wird. */
interface TileDesign {
    lot: string;
    /** zusätzliche Bodenmarkierung */
    ground: Ground;
    items: Item[];
    extra: "none" | "cross" | "crane" | "radar" | "fountain" | "containers";
    /** Höhe in Rautenbreiten, aus der Rauch aufsteigt (−1 = vom höchsten Dach) */
    smokeFrom: number;
}

// ---- Würfeln ohne Zufall -----------------------------------------------------------------------------------

/** Liefert für (seed, k) immer dieselbe Zahl zwischen 0 und 1 („Pseudozufall“). */
function rnd(seed: number, k: number): number {
    const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function pick<T>(list: T[], seed: number, k: number): T {
    return list[Math.floor(rnd(seed, k) * list.length) % list.length];
}

function seedOf(part: BuildingPart, variant: number): number {
    return variant * 31 + part.dx * 7 + part.dy * 13 + part.size * 3 + part.level * 17 + part.value * 5;
}

/*
 * Die Variante einer Gebäudekachel (isoCanvas.ts) besteht aus zwei Teilen:
 *   variant & 3   – „Würfelzahl“ der Kachel selbst (0–3)
 *   variant >> 2  – „Würfelzahl“ der ganzen Zone (0–15), gleich für alle Kacheln eines Gebäudes.
 * Mit der Zonenzahl wird der Bautyp gewählt (z. B. Reihenhäuser oder Blockrand), damit die neun Kacheln einer
 * Zone zusammenpassen.
 */
function zoneVariantOf(variant: number): number {
    return variant >> 2;
}

// ---- Farben (selbst gewählt) --------------------------------------------------------------------------------

const HOUSE_WALLS = [["#c9a98a", "#b8a28c", "#cbb89c"],              // einfache Gegend
                     ["#e3cfae", "#d9c3a5", "#e8d9bd", "#cfd3c2"],
                     ["#f1e6d2", "#efe0c4", "#e4ead9", "#f3dcc8"],
                     ["#fbf6ec", "#eef2f4", "#f6ead8", "#e9efe6"]];     // gehobene Gegend
const HOUSE_ROOFS = ["#8a4b3b", "#a3543c", "#6e4436", "#54606f", "#7b5a3c", "#93463a"];
const APARTMENT_WALLS = ["#c8b8a0", "#d8c7a8", "#e6dccb", "#f0ebe2", "#d9cfc3", "#c9d2d6", "#e2c9b0", "#cfc2d6"];
const OFFICE_WALLS = [["#9aa3ac", "#a7a39a", "#b3a58f"], ["#8fa9c4", "#a5b1bd", "#b9b1a5"],
                      ["#7fa6d1", "#9db8d4", "#8fb5b0"], ["#6c99d6", "#89b0dd", "#5f8fca", "#7a8fa8"]];
const AWNINGS = ["#c0392b", "#2e86c1", "#27ae60", "#e67e22", "#8e44ad", "#d35400"];
const CAR_COLOURS = ["#c0392b", "#2e86c1", "#f2f2f2", "#2c2c2c", "#7f8c8d", "#f1c40f", "#27ae60"];
const INDUSTRY_WALLS = [["#b5a68a", "#a89a80", "#9f9a8f"], ["#a9adb0", "#b7b2a6", "#9fa6a8"]];
const HEDGE = "#4f8a3c";
const LOT_PAVED = "#a8a49a";
const LOT_GRASS = "#86b466";
const LOT_GARDEN = "#7fb15d";

// ---- Bausteine ---------------------------------------------------------------------------------------------

function box(u0: number, v0: number, u1: number, v1: number, height: number, wall: string, roof: string,
             roofStyle: RoofStyle, facade: Facade, extra: { accent?: string, rooftop?: Rooftop, z0?: number } = {}): Box {
    return { accent: extra.accent, facade, height, kind: "box", roof, roofStyle, rooftop: extra.rooftop,
             u0, u1, v0, v1, wall, z0: extra.z0 || 0 };
}

function tree(u: number, v: number, size: number, conifer = false): Tree {
    return { conifer, kind: "tree", size, u, v };
}

function car(u: number, v: number, seed: number, k: number, along: "u" | "v" = "u"): Vehicle {
    return { along, colour: pick(CAR_COLOURS, seed, k), kind: "vehicle", type: "car", u, v };
}

/** Niedrige Hecke als schmaler grüner Quader */
function hedge(u0: number, v0: number, u1: number, v1: number): Box {
    return box(u0, v0, u1, v1, 0.035, HEDGE, "#5c9a49", "flat", "none");
}

/**
 * Gestaffeltes Hochhaus: mehrere Quader übereinander, jeder etwas schmaler als der darunter.
 * tiers: [Einzug vom Kachelrand, Höhe] von unten nach oben.
 */
function stackedTower(tiers: Array<[number, number]>, wall: string, roof: string, facades: Facade[],
                      top: Rooftop): Box[] {
    const boxes: Box[] = [];
    let z = 0;
    tiers.forEach(([inset, height], i) => {
        boxes.push(box(inset, inset, 1 - inset, 1 - inset, height, i === 0 ? shadeHex(wall, 0.92) : wall, roof,
                       "parapet", facades[Math.min(i, facades.length - 1)],
                       { rooftop: i === tiers.length - 1 ? top : "none", z0: z }));
        z += height;
    });
    return boxes;
}

/** Farbe als #rrggbb heller/dunkler (für Bausteine, die wieder eine Hex-Farbe brauchen) */
function shadeHex(colour: string, factor: number): string {
    const n = parseInt(colour.slice(1), 16);
    const c = (s: number) => {
        const x = Math.min(255, Math.round(((n >> s) & 255) * factor)).toString(16);
        return x.length < 2 ? "0" + x : x;
    };
    return "#" + c(16) + c(8) + c(0);
}

// ---- Wohnen ------------------------------------------------------------------------------------------------

/** Einfamilienhaus mit Garten: Größe, Lage, Dachform, Garage, Auto, Hecke und Baum würfeln. */
function smallHouse(seed: number, value: number, floors: number): Item[] {
    const size = 0.4 + rnd(seed, 1) * 0.16 + floors * 0.05;
    const depth = size * (0.75 + rnd(seed, 2) * 0.3);
    const u0 = 0.1 + rnd(seed, 3) * Math.max(0, 0.78 - size);
    const v0 = 0.08 + rnd(seed, 4) * Math.max(0, 0.7 - depth);
    const roofRoll = rnd(seed, 7);
    const items: Item[] = [
        box(u0, v0, u0 + size, v0 + depth, 0.13 * floors, pick(HOUSE_WALLS[value], seed, 5), pick(HOUSE_ROOFS, seed, 6),
            roofRoll < 0.4 ? "gableU" : roofRoll < 0.8 ? "gableV" : "hip", "house",
            { rooftop: rnd(seed, 11) < 0.6 ? "chimney" : "none" }),
    ];

    // Garage oder Carport neben dem Haus, davor oft ein Auto
    const garageLeft = u0 > 0.32;
    const gu0 = garageLeft ? u0 - 0.24 : u0 + size + 0.03;
    if (value >= 1 && gu0 >= 0.04 && gu0 + 0.2 <= 0.96 && rnd(seed, 12) < 0.7) {
        const gv1 = v0 + depth;
        items.push(box(gu0, gv1 - 0.3, gu0 + 0.2, gv1, 0.09, shadeHex(pick(HOUSE_WALLS[value], seed, 5), 0.95),
                       "#7a7a76", "flat", "garage"));
        if (rnd(seed, 13) < 0.65 && gv1 + 0.2 < 0.92) {
            items.push(car(gu0 + 0.1, gv1 + 0.13, seed, 14, "v"));
        }
    }

    // Ein Baum im Garten, wenn Platz ist
    if (rnd(seed, 8) < 0.8) {
        const tu = u0 > 0.3 ? 0.14 : 0.86;
        const tv = v0 > 0.3 ? 0.16 : 0.8;
        items.push(tree(tu, tv, 0.7 + rnd(seed, 10) * 0.4, rnd(seed, 9) < 0.35));
    }
    // Hecke vorn am Grundstück (mit Lücke für den Gartenweg)
    if (value >= 1 && rnd(seed, 15) < 0.6) {
        items.push(hedge(0.04, 0.93, 0.42, 0.98), hedge(0.58, 0.93, 0.96, 0.98));
    }
    return items;
}

/** Reihenhäuser: drei schmale Häuser nebeneinander, hinten Gärten mit Hecken dazwischen. */
function rowHouses(seed: number, value: number): TileDesign {
    const items: Item[] = [];
    const roof = pick(HOUSE_ROOFS, seed, 20);
    for (let i = 0; i < 3; i++) {
        const u0 = 0.03 + i * 0.315;
        const tall = rnd(seed, 21 + i) < 0.3 ? 0.07 : 0;
        items.push(box(u0, 0.1, u0 + 0.315, 0.56, 0.25 + tall, pick(HOUSE_WALLS[value], seed, 30 + i), roof, "gableU",
                       "house", { rooftop: i % 2 === 0 ? "chimney" : "none" }));
        if (i > 0) {
            items.push(hedge(u0 - 0.01, 0.6, u0 + 0.01, 0.96));
        }
    }
    items.push(tree(0.2 + rnd(seed, 40) * 0.6, 0.8, 0.7, rnd(seed, 41) < 0.3));
    return { extra: "none", ground: "garden", items, lot: LOT_GARDEN, smokeFrom: -1 };
}

/** Mehrfamilienhäuser mit Walmdach; in der Mitte der Zone ein Spielplatz. */
function walkUps(part: BuildingPart, seed: number): TileDesign {
    if (part.dx === 1 && part.dy === 1) {
        return { extra: "none", ground: "playground", lot: LOT_GARDEN, smokeFrom: -1,
                 items: [tree(0.15, 0.2, 0.9), tree(0.85, 0.15, 0.8, true), tree(0.82, 0.85, 0.9)] };
    }
    const h = 0.34 + rnd(seed, 2) * 0.12;
    return { extra: "none", ground: "none", lot: LOT_GARDEN, smokeFrom: -1,
             items: [box(0.12, 0.14, 0.88, 0.84, h, pick(APARTMENT_WALLS, seed, 1), pick(HOUSE_ROOFS, seed, 3), "hip",
                         "apartment", { rooftop: rnd(seed, 4) < 0.5 ? "chimney" : "none" }),
                     tree(rnd(seed, 5) < 0.5 ? 0.08 : 0.92, 0.93, 0.6)] };
}

/*
 * Blockrandbebauung: Häuser stehen an der Außenkante der Zone, innen liegt ein grüner Hof.
 * Ecken werden zu einem „L“ aus zwei Quadern. Zur Nachbarkachel hin reicht das Haus bis an den Rand,
 * damit die Häuserzeile durchgehend wirkt.
 */
function perimeterBlock(part: BuildingPart, seed: number, zv: number, height: number): TileDesign {
    const { dx, dy } = part;
    if (dx === 1 && dy === 1) {
        return { extra: "none", ground: "garden", lot: LOT_GARDEN, smokeFrom: -1,
                 items: [tree(0.25, 0.3, 1.0), tree(0.7, 0.6, 1.1), tree(0.35, 0.78, 0.8, true)] };
    }
    const depth = 0.48;
    const edge = 0.04;
    const wall = pick(APARTMENT_WALLS, seed, 1);
    const roof = zv % 2 === 0 ? pick(HOUSE_ROOFS, zv, 2) : "#7f7c76";
    const h = height + rnd(seed, 3) * 0.06;
    const items: Item[] = [];

    // Streifen entlang u-Rand (Zonenrand links bzw. rechts in Kartenrichtung x)
    const uStrip = dx !== 1;
    const vStrip = dy !== 1;
    const ua = dx === 0 ? edge : 1 - depth;
    const ub = dx === 0 ? depth : 1 - edge;
    const va = dy === 0 ? edge : 1 - depth;
    const vb = dy === 0 ? depth : 1 - edge;
    if (uStrip) {
        const v0 = dy === 0 ? edge : 0;
        const v1 = dy === 2 ? 1 - edge : 1;
        items.push(box(ua, v0, ub, v1, h, wall, roof, zv % 2 === 0 ? "gableV" : "parapet", "apartment",
                       { rooftop: zv % 2 === 0 ? "chimney" : "unit" }));
    }
    if (vStrip) {
        // Bei Ecken nur den Rest neben dem u-Streifen belegen
        const u0 = uStrip ? (dx === 0 ? depth : 0) : 0;
        const u1 = uStrip ? (dx === 0 ? 1 : 1 - depth) : 1;
        items.push(box(u0, va, u1, vb, h + (uStrip ? 0.04 : 0), shadeHex(wall, 1.04), roof,
                       zv % 2 === 0 ? "gableU" : "parapet", "apartment"));
    }
    return { extra: "none", ground: "none", items, lot: LOT_GARDEN, smokeFrom: -1 };
}

function residential(part: BuildingPart, seed: number, zv: number): TileDesign {
    const v = Math.max(0, Math.min(3, part.value));
    if (part.size === 1 || part.level <= 1) {
        return { extra: "none", ground: "garden", items: smallHouse(seed, v, part.level === 1 ? 2 : 1),
                 lot: LOT_GARDEN, smokeFrom: -1 };
    }
    const type = zv % 3;
    if (part.level === 2) {
        if (type === 0) { return rowHouses(seed, v); }
        if (type === 1) { return walkUps(part, seed); }
        return perimeterBlock(part, seed, zv, 0.4);
    }

    // Stufe 3: drei Bautypen
    const { dx, dy } = part;
    const wall = pick(APARTMENT_WALLS, zv, 7);
    const centre = dx === 1 && dy === 1;
    const base = { extra: "none" as const, ground: "none" as const, lot: LOT_PAVED, smokeFrom: -1 };

    if (type === 0) {
        // Wohnhochhaus auf einem Sockel mit Läden, ringsum mittelhohe Häuser
        if (centre) {
            return { ...base, items: [
                box(0.06, 0.06, 0.94, 0.94, 0.2, "#d8d2c6", "#7f7c76", "parapet", "shop",
                    { accent: pick(AWNINGS, seed, 3) }),
                box(0.2, 0.2, 0.8, 0.8, 0.95 + rnd(seed, 2) * 0.2, wall, "#7f7c76", "parapet", "apartment",
                    { z0: 0.2 }),
                box(0.32, 0.32, 0.68, 0.68, 0.12, shadeHex(wall, 0.9), "#6f6c66", "flat", "none",
                    { rooftop: "tank", z0: 1.15 + rnd(seed, 2) * 0.2 }),
            ] };
        }
        const h = 0.48 + rnd(seed, 2) * 0.26;
        const items: Item[] = [box(0.07, 0.07, 0.93, 0.93, h, pick(APARTMENT_WALLS, seed, 1), "#7f7c76", "parapet",
                                   "apartment", { rooftop: rnd(seed, 3) < 0.5 ? "unit" : "none" })];
        if (rnd(seed, 4) < 0.45) {
            // zurückgesetztes Dachgeschoss
            items.push(box(0.2, 0.2, 0.8, 0.8, 0.1, shadeHex(pick(APARTMENT_WALLS, seed, 1), 1.05), "#6f6c66",
                           "parapet", "apartment", { z0: h }));
        }
        return { ...base, items };
    }

    if (type === 1) {
        // lange Wohnscheiben über die ganze Zone, dazwischen Grün und Parkplätze
        if (dy === 1) {
            return dx === 1
                ? { ...base, ground: "playground", lot: LOT_GARDEN, items: [tree(0.12, 0.2, 0.9), tree(0.88, 0.8, 1)] }
                : { ...base, ground: "parking", items: [car(0.3, 0.09, seed, 1), car(0.62, 0.09, seed, 2),
                                                        car(0.45, 0.91, seed, 3), tree(0.5, 0.5, 0.8)] };
        }
        const u0 = dx === 0 ? 0.05 : 0;
        const u1 = dx === 2 ? 0.95 : 1;
        return { ...base, lot: LOT_GARDEN, items: [
            box(u0, 0.24, u1, 0.7, dy === 0 ? 0.9 : 0.72, wall, "#76736d", "parapet", "apartment",
                { rooftop: dx === 1 ? "unit" : "none" }),
            tree(0.5, 0.86, 0.7),
        ] };
    }

    // zwei Punkthochhäuser an gegenüberliegenden Ecken, in der Mitte ein kleiner Park
    if ((dx === 0 && dy === 0) || (dx === 2 && dy === 2)) {
        return { ...base, items: stackedTower([[0.12, 1.05 + rnd(seed, 2) * 0.25], [0.26, 0.14]], wall, "#6f6c66",
                                              ["apartment", "apartment"], dx === 0 ? "antenna" : "tank") };
    }
    if (centre) {
        return { ...base, extra: "fountain", ground: "garden", lot: LOT_GRASS,
                 items: [tree(0.18, 0.22, 1), tree(0.82, 0.25, 0.9, true), tree(0.2, 0.8, 0.9, true),
                         tree(0.8, 0.82, 1)] };
    }
    if ((dx + dy) % 2 === 0) {
        return { ...base, ground: "parking", items: [car(0.25, 0.09, seed, 1), car(0.55, 0.91, seed, 2),
                                                     car(0.75, 0.09, seed, 3)] };
    }
    return { ...base, lot: LOT_GARDEN,
             items: [box(0.1, 0.12, 0.9, 0.88, 0.36 + rnd(seed, 2) * 0.1, pick(APARTMENT_WALLS, seed, 1), "#7f7c76",
                         "parapet", "apartment", { rooftop: "unit" })] };
}

// ---- Gewerbe -----------------------------------------------------------------------------------------------

function commercial(part: BuildingPart, seed: number, zv: number): TileDesign {
    const value = Math.max(0, Math.min(3, part.value));
    const wall = pick(OFFICE_WALLS[value], seed, 1);
    const { dx, dy } = part;
    const centre = dx === 1 && dy === 1;
    const base = { extra: "none" as const, ground: "none" as const, lot: LOT_PAVED, smokeFrom: -1 };
    switch (part.level) {
        case 0:
            // kleiner Laden mit Parkplatz
            return { ...base, ground: "parking",
                     items: [box(0.2, 0.2, 0.8, 0.8, 0.16, pick(APARTMENT_WALLS, seed, 3), "#6f6a64", "flat", "shop",
                                 { accent: pick(AWNINGS, seed, 4), rooftop: "unit" }),
                             car(0.3, 0.09, seed, 5), car(0.7, 0.91, seed, 6)] };
        case 1: {
            // zwei Geschäftshäuser nebeneinander, verschieden hoch, mit eigenen Markisen
            const h1 = 0.22 + rnd(seed, 2) * 0.1;
            const h2 = 0.26 + rnd(seed, 3) * 0.14;
            return { ...base, items: [
                box(0.06, 0.1, 0.5, 0.9, h1, pick(APARTMENT_WALLS, seed, 4), "#6f6a64",
                    rnd(seed, 5) < 0.5 ? "gableV" : "parapet", "shop", { accent: pick(AWNINGS, seed, 6) }),
                box(0.5, 0.1, 0.94, 0.9, h2, pick(APARTMENT_WALLS, seed, 7), "#6f6a64", "parapet", "shop",
                    { accent: pick(AWNINGS, seed, 8), rooftop: "unit" }),
            ] };
        }
        case 2: {
            if (zv % 2 === 1) {
                // Kaufhaus über die ganze Zone, in der Mitte ein Oberlicht und das Schild
                const u0 = dx === 0 ? 0.05 : 0;
                const u1 = dx === 2 ? 0.95 : 1;
                const v0 = dy === 0 ? 0.05 : 0;
                const v1 = dy === 2 ? 0.95 : 1;
                const store = pick(APARTMENT_WALLS, zv, 9);
                const items: Item[] = [box(u0, v0, u1, v1, 0.42, store, "#6a6864", "flat", "shop",
                                           { accent: pick(AWNINGS, zv, 10), rooftop: centre ? "skylight" : "unit" })];
                if (centre) {
                    items.push({ background: pick(AWNINGS, zv, 10), colour: "#ffffff", kind: "sign", text: "KAUFHAUS",
                                 u: 0.5, v: 0.5, z: 0.42 });
                }
                return { ...base, items };
            }
            // Bürohäuser, teils mit zurückgesetztem obersten Geschoss
            const h = 0.34 + rnd(seed, 2) * 0.22;
            const items: Item[] = [box(0.07, 0.07, 0.93, 0.93, h, wall, "#5d6670", "parapet",
                                       rnd(seed, 3) < 0.5 ? "office" : "glass",
                                       { rooftop: rnd(seed, 4) < 0.5 ? "unit" : "none" })];
            if (rnd(seed, 5) < 0.5) {
                items.push(box(0.2, 0.2, 0.8, 0.8, 0.1, shadeHex(wall, 1.08), "#5d6670", "parapet", "glass",
                               { rooftop: rnd(seed, 6) < 0.5 ? "antenna" : "unit", z0: h }));
            }
            return { ...base, items };
        }
        case 3: {
            if (centre) {
                // Turm mit Sockel und gestaffelter Krone
                return { ...base, items: [
                    ...stackedTower([[0.04, 0.2], [0.16, 0.85 + rnd(seed, 2) * 0.15], [0.28, 0.18]], wall, "#55606b",
                                    ["shop", "glass", "glass"], "none"),
                    box(0.36, 0.36, 0.64, 0.64, 0.05, shadeHex(wall, 0.8), "#55606b",
                        zv % 2 === 0 ? "spire" : "hip", "none", { z0: 1.23 + rnd(seed, 2) * 0.15 }),
                ] };
            }
            if (dx === 2 && dy === 2 && zv % 2 === 1) {
                // kleiner Platz mit Brunnen
                return { ...base, extra: "fountain", ground: "plaza", lot: "#c9c2b2",
                         items: [tree(0.15, 0.2, 0.8), tree(0.85, 0.2, 0.8), tree(0.2, 0.85, 0.8)] };
            }
            const h = 0.45 + rnd(seed, 2) * 0.4;
            const items: Item[] = [box(0.06, 0.06, 0.94, 0.94, h, wall, "#55606b", "parapet",
                                       rnd(seed, 3) < 0.5 ? "office" : "glass", { rooftop: "unit" })];
            if (rnd(seed, 4) < 0.4) {
                items.push(box(0.22, 0.22, 0.78, 0.78, 0.12, shadeHex(wall, 1.08), "#55606b", "parapet", "glass",
                               { z0: h }));
            }
            return { ...base, items };
        }
        default: {
            if (centre) {
                // Wolkenkratzer: vier Staffeln, oben Antenne oder Spitze
                return { ...base, items: stackedTower([[0.04, 0.22], [0.14, 1.0], [0.24, 0.34], [0.34, 0.12]], wall,
                                                      "#4d5863", ["shop", "glass", "glass", "glass"],
                                                      zv % 2 === 0 ? "antenna" : "helipad") };
            }
            const h = 0.7 + rnd(seed, 2) * 0.5;
            const tiers: Array<[number, number]> = rnd(seed, 3) < 0.5 ? [[0.05, h]] : [[0.05, h * 0.7], [0.18, h * 0.3]];
            return { ...base, items: stackedTower(tiers, pick(OFFICE_WALLS[value], seed, 4), "#4d5863",
                                                  ["glass", rnd(seed, 5) < 0.5 ? "glass" : "office"],
                                                  dx === 0 && dy === 2 ? "helipad" : rnd(seed, 6) < 0.5 ? "antenna" : "unit") };
        }
    }
}

function industrial(part: BuildingPart, seed: number): TileDesign {
    const wall = pick(INDUSTRY_WALLS[Math.max(0, Math.min(1, part.value))], seed, 1);
    const kind = rnd(seed, 2);
    const chimney = part.level >= 1 && part.dx === 2 && part.dy === 0;
    const items: Item[] = [];
    if (part.level >= 1 && kind < 0.3 && !chimney) {
        // Tanklager
        items.push({ colour: pick(["#e9e5dc", "#c9c2b5", "#b55a3c"], seed, 3), height: 0.25 + part.level * 0.05,
                     kind: "tank", radius: 0.18, u: 0.32, v: 0.34 });
        items.push({ colour: pick(["#e9e5dc", "#c9c2b5"], seed, 4), height: 0.2, kind: "tank", radius: 0.15,
                     u: 0.68, v: 0.66 });
    } else {
        const h = [0.18, 0.24, 0.3, 0.36][Math.max(0, Math.min(3, part.level))] * (0.85 + rnd(seed, 5) * 0.3);
        items.push(box(0.06, 0.06, 0.94, 0.94, h, wall, "#6a6a68", kind < 0.65 ? "sawtooth" : "flat", "garage"));
    }
    if (chimney) {
        items.push({ height: 1.0, kind: "chimney", u: 0.72, v: 0.28 });
    }
    return { extra: "none", ground: "none", items, lot: LOT_PAVED, smokeFrom: chimney ? 1.0 : -1 };
}

// ---- Öffentliche Gebäude und Kraftwerke --------------------------------------------------------------------

/*
 * Feuerwache (3 × 3): hinten das Wachgebäude mit Sirene und Schlauchturm (mit Fahne), in der Mitte die
 * Fahrzeughalle mit großen Toren, vorn der Hof mit Drehleiter, Löschfahrzeug und Übungsturm.
 */
function fireStation(part: BuildingPart, none: TileDesign): TileDesign {
    const red = "#c63c32";
    const roof = "#5e5e5c";
    const { dx, dy } = part;
    if (dy === 0) {
        if (dx === 2) {
            return { ...none, items: [box(0.04, 0.04, 0.3, 0.96, 0.34, red, roof, "parapet", "office"),
                                      box(0.32, 0.22, 0.7, 0.6, 0.95, red, "#e9e9e9", "flat", "office"),
                                      { base: 0.95, colour: "#d0312d", height: 0.22, kind: "flag", u: 0.51, v: 0.41 }] };
        }
        return { ...none, items: [box(0.04, 0.04, 0.96, 0.96, 0.34, red, roof, "parapet", "office",
                                      { rooftop: dx === 1 ? "siren" : "unit" })] };
    }
    if (dy === 1) {
        const items: Item[] = [box(0.04, 0.04, 0.96, 0.96, 0.26, red, roof, "parapet", "firebay")];
        if (dx === 1) {
            items.push({ background: "#ffffff", colour: red, kind: "sign", text: "FW", u: 0.5, v: 0.5, z: 0.26 });
        }
        return { ...none, items };
    }
    // Hof mit Fahrzeugen und Übungsturm
    if (dx === 0) {
        return { ...none, ground: "yard", items: [{ kind: "vehicle", type: "ladderTruck", u: 0.5, v: 0.42 }] };
    }
    if (dx === 1) {
        return { ...none, ground: "yard", items: [{ kind: "vehicle", type: "fireTruck", u: 0.5, v: 0.42 }] };
    }
    return { ...none, ground: "yard",
             items: [box(0.52, 0.12, 0.88, 0.48, 0.72, "#b8b2a8", "#7a7a7a", "flat", "office"), tree(0.25, 0.75, 0.8)] };
}

/*
 * Polizeiwache (3 × 3): Bürogebäude in Weiß mit blauem Band, Funkmast auf dem Dach, Eingang mit Vordach und
 * „POLIZEI“-Schild, vorn Parkplatz mit Streifenwagen und Fahnenmasten.
 */
function policeStation(part: BuildingPart, none: TileDesign): TileDesign {
    const wall = "#eef1f5";
    const roof = "#5d6b80";
    const blue = "#2e5aa8";
    const { dx, dy } = part;
    if (dy === 0) {
        const items: Item[] = [box(0.04, 0.04, 0.96, 0.96, 0.42, wall, roof, "parapet", "police",
                                   { rooftop: dx === 0 ? "unit" : "none" })];
        if (dx === 2) {
            items.push({ base: 0.42, height: 0.7, kind: "mast", u: 0.6, v: 0.4 });
        }
        return { ...none, items };
    }
    if (dy === 1) {
        const items: Item[] = [box(0.04, 0.04, 0.96, 0.96, 0.3, wall, roof, "parapet", "police")];
        if (dx === 1) {
            items.push(box(0.3, 0.86, 0.7, 0.99, 0.02, blue, blue, "flat", "none", { z0: 0.1 }));   // Vordach
            items.push({ background: blue, colour: "#ffffff", kind: "sign", text: "POLIZEI", u: 0.5, v: 0.5, z: 0.3 });
        }
        return { ...none, items };
    }
    if (dx === 1) {
        return { ...none, ground: "parking", items: [
            { base: 0, colour: "#2b2b2b", height: 0.55, kind: "flag", u: 0.3, v: 0.5 },
            { base: 0, colour: "#d0312d", height: 0.55, kind: "flag", u: 0.5, v: 0.5 },
            { base: 0, colour: "#f1c40f", height: 0.55, kind: "flag", u: 0.7, v: 0.5 },
        ] };
    }
    return { ...none, ground: "parking", items: [
        { kind: "vehicle", type: "policeCar", u: 0.32, v: 0.25 },
        dx === 0 ? { kind: "vehicle", type: "policeCar", u: 0.68, v: 0.75 }
                 : { colour: "#e8ecf2", kind: "vehicle", type: "van", u: 0.66, v: 0.75 },
    ] };
}

/*
 * Kohlekraftwerk (4 × 4): hinten rechts Kesselhäuser mit vier Schornsteinen (dort, wo die Simulation Rauch
 * zeigt), links die Turbinenhallen, davor Umspannwerk und Brecher, vorn die Kohlehalde mit Förderband und Raupe.
 */
function coalPlant(part: BuildingPart, none: TileDesign): TileDesign {
    const { dx, dy } = part;
    const plant = "#77736e";
    const roof = "#4a4845";
    if (dx >= 2 && dy <= 1) {
        const height = [1.15, 1.0, 1.05, 0.95][(dx - 2) + dy * 2];
        return { ...none, smokeFrom: height,
                 items: [{ height, kind: "chimney", u: 0.5, v: 0.32 },
                         box(0.06, 0.58, 0.94, 0.96, 0.46, plant, roof, "flat", "hall", { rooftop: "unit" })] };
    }
    if (dx <= 1 && dy <= 1) {
        // zwei lange Turbinenhallen, die über beide Kacheln durchlaufen
        return { ...none, items: [box(dx === 0 ? 0.05 : 0, 0.1, dx === 1 ? 1 : 0.95, 0.9, 0.44, "#8b8782", "#5d5a56",
                                      "gableU", "hall")] };
    }
    if (dy === 2 && dx <= 1) {
        // Umspannwerk
        return { ...none, ground: "gravel", lot: "#9c968c", items: [
            { height: 0.55, kind: "pylon", u: 0.28, v: 0.3 }, { height: 0.55, kind: "pylon", u: 0.72, v: 0.7 },
            box(0.55, 0.14, 0.78, 0.36, 0.12, "#8e9496", "#6d7375", "flat", "none"),
            box(0.2, 0.62, 0.43, 0.84, 0.12, "#8e9496", "#6d7375", "flat", "none"),
        ] };
    }
    if (dy === 2) {
        // Brecher und Förderband hinauf zum Kesselhaus
        return dx === 2
            ? { ...none, items: [box(0.2, 0.2, 0.8, 0.8, 0.32, "#8a8680", "#5a5752", "flat", "garage")] }
            : { ...none, items: [{ kind: "conveyor", u0: 0.5, u1: 0.5, v0: 1, v1: 0, z0: 0.12, z1: 0.34 }] };
    }
    // Kohlehalde
    const items: Item[] = [{ colour: "#2a2a2a", kind: "pile", size: 1, u: 0.35, v: 0.4 },
                           { colour: "#333230", kind: "pile", size: 0.8, u: 0.68, v: 0.7 }];
    if (dx === 1) {
        items.push({ kind: "vehicle", type: "bulldozer", u: 0.72, v: 0.25 });
    }
    if (dx === 3) {
        items.length = 1;
        items.push({ kind: "conveyor", u0: 0.5, u1: 0.5, v0: 0.62, v1: 0, z0: 0.02, z1: 0.12 });
    }
    return { ...none, lot: "#6e6a63", items };
}

/*
 * Kernkraftwerk (4 × 4): vier Kühltürme, Reaktorgebäude mit Kuppel, Hilfs- und Verwaltungsgebäude,
 * durchgehende Turbinenhalle, Umspannwerk, Parkplatz, Pforte und Wassertanks.
 */
function nuclearPlant(part: BuildingPart, none: TileDesign, seed: number): TileDesign {
    const { dx, dy } = part;
    if ((dx === 2 || dx === 3) && dy <= 1) {
        return { ...none, items: [{ height: 1.0, kind: "coolingTower", radius: 0.46, u: 0.5, v: 0.5 }], smokeFrom: 1.0 };
    }
    if (dx === 1 && dy === 1) {
        return { ...none, items: [{ colour: "#d8dcd4", height: 0.42, kind: "dome", radius: 0.42, u: 0.5, v: 0.5 }] };
    }
    if (dx === 0 && dy === 1) {
        return { ...none, items: [box(0.08, 0.08, 0.92, 0.92, 0.46, "#cfd5cc", "#8b968a", "parapet", "hall",
                                      { rooftop: "unit" })] };
    }
    if (dy === 0) {
        return { ...none, items: [box(0.1, 0.1, 0.9, 0.9, dx === 0 ? 0.26 : 0.32, "#d7dcd3", "#9aa596", "parapet",
                                      "office", { rooftop: dx === 1 ? "antenna" : "unit" })] };
    }
    if (dy === 2) {
        if (dx === 0) {
            return { ...none, ground: "gravel", lot: "#9c968c", items: [
                { height: 0.6, kind: "pylon", u: 0.3, v: 0.3 }, { height: 0.6, kind: "pylon", u: 0.7, v: 0.7 },
                box(0.58, 0.12, 0.84, 0.36, 0.12, "#8e9496", "#6d7375", "flat", "none")] };
        }
        return { ...none, items: [box(dx === 1 ? 0.06 : 0, 0.08, dx === 3 ? 0.94 : 1, 0.92, 0.36, "#c9d0c6", "#8b968a",
                                      "gableU", "hall")] };
    }
    // vordere Reihe
    if (dx <= 1) {
        return { ...none, ground: "parking", items: [car(0.3, 0.09, seed, 1), car(0.6, 0.09, seed, 2),
                                                     car(0.45, 0.91, seed, 3)] };
    }
    if (dx === 2) {
        return { ...none, items: [box(0.35, 0.55, 0.65, 0.85, 0.14, "#e4e6e1", "#8b968a", "flat", "office"),
                                  tree(0.2, 0.25, 0.8, true)] };
    }
    return { ...none, items: [{ colour: "#e4e6e1", height: 0.3, kind: "tank", radius: 0.2, u: 0.3, v: 0.32 },
                              { colour: "#e4e6e1", height: 0.3, kind: "tank", radius: 0.2, u: 0.7, v: 0.7 }] };
}

/*
 * Flughafen (6 × 6): Terminal mit Glasfront, Kontrollturm, Radar, Hangars, Vorfeld mit geparkten
 * Flugzeugen und eine Start- und Landebahn über die ganze Breite.
 */
function airport(part: BuildingPart, none: TileDesign): TileDesign {
    const { dx, dy } = part;
    const lot = "#9c9c98";
    if (dy >= 4) {
        return { ...none, ground: "runway", lot: "#7c8a5c" };
    }
    if (dx === 2 && dy === 0) {
        return { ...none, extra: "radar", lot };
    }
    if (dx === 2 && dy === 1) {
        return { ...none, items: [{ height: 0.9, kind: "controlTower", u: 0.5, v: 0.5 }], lot };
    }
    if (dx <= 1 && dy <= 1) {
        return { ...none, lot, items: [box(0.04, 0.04, 0.96, 0.96, 0.24, "#c3d2e2", "#8a96a3", "parapet", "glass",
                                           { rooftop: "unit" })] };
    }
    if (dx >= 4 && dy <= 1) {
        return { ...none, lot, items: [box(0.05, 0.05, 0.95, 0.95, 0.3, "#b0b5ba", "#8d9297", "gableU", "garage")] };
    }
    // Vorfeld
    return { ...none, ground: "apron", lot: "#a4a4a0",
             items: (dx + dy) % 2 === 0 ? [{ kind: "vehicle", type: "plane", u: 0.5, v: 0.5 }] : [] };
}

/** Gestaltung einer Gebäudekachel (in Kartenrichtungen). Leere Zonen (level −1) haben kein Gebäude. */
function designFor(part: BuildingPart, variant: number): TileDesign {
    const seed = seedOf(part, variant);
    const zv = zoneVariantOf(variant);
    const centre = part.dx === 1 && part.dy === 1;
    const none: TileDesign = { extra: "none", ground: "none", items: [], lot: LOT_PAVED, smokeFrom: -1 };

    switch (part.zone) {
        case "residential":
            return part.level < 0 ? { ...none, lot: LOT_GRASS } : residential(part, seed, zv);
        case "commercial":
            return part.level < 0 ? none : commercial(part, seed, zv);
        case "industrial":
            return part.level < 0 ? none : industrial(part, seed);
        case "hospital":
            return { ...none, extra: centre ? "cross" : "none",
                     items: [box(0.05, 0.05, 0.95, 0.95, 0.36, "#f6f6f4", "#dcdcdc", "parapet", "office")] };
        case "church":
            return centre
                ? { ...none, lot: LOT_GRASS,
                    items: [box(0.3, 0.3, 0.7, 0.7, 0.75, "#e9dfcb", "#6d4436", "spire", "none")] }
                : { ...none, lot: LOT_GRASS,
                    items: [box(0.08, 0.08, 0.92, 0.92, 0.3, "#e9dfcb", "#7a4a3a",
                                part.dx === 1 ? "gableV" : "gableU", "none")] };
        case "fireStation":
            return fireStation(part, none);
        case "police":
            return policeStation(part, none);
        case "coal":
            return coalPlant(part, none);
        case "nuclear":
            return nuclearPlant(part, none, seed);
        case "port":
            return { ...none, lot: "#8a8f94",
                     extra: part.dx === 3 && part.dy === 0 ? "crane" : (part.dx + part.dy) % 2 === 0 ? "containers" : "none",
                     items: part.dx === 0 && part.dy >= 2
                         ? [box(0.05, 0.05, 0.95, 0.95, 0.22, "#a4a9ae", "#6d7378", "gableU", "garage")] : [] };
        case "airport":
            return airport(part, none);
        case "stadium": {
            if (part.dx >= 1 && part.dx <= 2 && part.dy >= 1 && part.dy <= 2) {
                return { ...none, ground: "field" };
            }
            return { ...none, items: [box(0.02, 0.02, 0.98, 0.98, 0.3, "#c9c9c9",
                                          part.level === 1 ? "#d98b8b" : "#9b9b9b", "flat", "none")] };
        }
        case "park":
            return { ...none, extra: "fountain", ground: "garden", lot: LOT_GRASS,
                     items: [tree(0.2, 0.25, 0.8), tree(0.8, 0.75, 0.7, true)] };
        case "pump":
            // Pumpenhaus mit Satteldach, daneben das blaue Rohr mit Schieber
            return { ...none, lot: "#a7a297", items: [
                box(0.14, 0.18, 0.66, 0.74, 0.22, "#5b7fa3", "#3f5f80", "gableU", "hall"),
                box(0.66, 0.42, 0.96, 0.54, 0.06, "#2f8cff", "#5aa9ff", "flat", "none"),
                { colour: "#2f8cff", height: 0.14, kind: "tank", radius: 0.07, u: 0.82, v: 0.48 },
                { colour: "#c0392b", height: 0.03, kind: "tank", radius: 0.06, u: 0.82, v: 0.48 },
            ] };
        case "waterTower":
            return { ...none, lot: LOT_GRASS, items: [{ height: 0.8, kind: "waterTank", u: 0.5, v: 0.5 },
                                                      tree(0.15, 0.85, 0.7)] };
    }
    return none;
}

// ---- Drehen: Karte → Ansicht --------------------------------------------------------------------------------

/*
 * Die Gestaltung ist in Kartenrichtungen beschrieben (mu, mv von 0 bis 1 innerhalb der Kachel). Gezeichnet wird
 * in Ansichtsrichtungen (u, v). Bei gedrehter Ansicht muss deshalb jeder Punkt mitgedreht werden – sonst würden
 * Gebäude über mehrere Kacheln (Landebahn, Wohnscheibe) nach dem Drehen nicht mehr zusammenpassen.
 * Die Formeln entsprechen mapToView() in projection.ts, nur innerhalb einer Kachel.
 */
export function mapLocalToView(mu: number, mv: number, rotation: number): { u: number, v: number } {
    switch (rotation & 3) {
        case 1: return { u: 1 - mv, v: mu };
        case 2: return { u: 1 - mu, v: 1 - mv };
        case 3: return { u: mv, v: 1 - mu };
        default: return { u: mu, v: mv };
    }
}

function rotateItem(item: Item, rotation: number): Item {
    if (rotation === 0) {
        return item;
    }
    const odd = (rotation & 1) === 1;
    switch (item.kind) {
        case "box": {
            const a = mapLocalToView(item.u0, item.v0, rotation);
            const b = mapLocalToView(item.u1, item.v1, rotation);
            const roofStyle = odd && item.roofStyle === "gableU" ? "gableV"
                            : odd && item.roofStyle === "gableV" ? "gableU" : item.roofStyle;
            return { ...item, roofStyle, u0: Math.min(a.u, b.u), u1: Math.max(a.u, b.u), v0: Math.min(a.v, b.v),
                     v1: Math.max(a.v, b.v) };
        }
        case "conveyor": {
            const a = mapLocalToView(item.u0, item.v0, rotation);
            const b = mapLocalToView(item.u1, item.v1, rotation);
            return { ...item, u0: a.u, u1: b.u, v0: a.v, v1: b.v };
        }
        case "vehicle": {
            const p = mapLocalToView(item.u, item.v, rotation);
            const along = item.along || "u";
            return { ...item, along: odd ? (along === "u" ? "v" : "u") : along, u: p.u, v: p.v };
        }
        default: {
            const p = mapLocalToView(item.u, item.v, rotation);
            return { ...item, u: p.u, v: p.v };
        }
    }
}

/** Höchster Punkt eines Kachelbilds über der Rautenspitze in Pixeln – für die Größe des Zwischenbilds. */
export function requiredHeadroom(part: BuildingPart, tileWidth: number, variant = 0): number {
    const design = designFor(part, variant);
    let height = 0.3;
    for (const item of design.items) {
        switch (item.kind) {
            case "box": {
                const roof = item.roofStyle === "spire" ? 0.4 : item.rooftop === "antenna" ? 0.42 : 0.18;
                height = Math.max(height, item.z0 + item.height + roof);
                break;
            }
            case "tank": case "chimney": case "coolingTower": case "controlTower": case "pylon":
                height = Math.max(height, item.height + 0.15);
                break;
            case "mast": case "flag":
                height = Math.max(height, item.base + item.height + 0.1);
                break;
            case "dome":
                height = Math.max(height, item.height + item.radius * 0.6 + 0.05);
                break;
            case "sign":
                height = Math.max(height, item.z + 0.2);
                break;
            case "conveyor":
                height = Math.max(height, Math.max(item.z0, item.z1) + 0.1);
                break;
            case "waterTank":
                height = Math.max(height, item.height + 0.2);
                break;
        }
    }
    if (design.extra === "crane" || design.extra === "radar") { height = Math.max(height, 0.85); }
    return Math.ceil(height * tileWidth);
}

/** Höhe (Pixel), aus der Rauch aufsteigt: Schornstein oder höchstes Dach. */
export function smokeBase(part: BuildingPart, tileWidth: number, variant = 0): number {
    const design = designFor(part, variant);
    if (design.smokeFrom >= 0) {
        return design.smokeFrom * tileWidth;
    }
    let top = 0;
    for (const item of design.items) {
        if (item.kind === "box") { top = Math.max(top, item.z0 + item.height); }
        if (item.kind === "tank") { top = Math.max(top, item.height); }
    }
    return top * tileWidth;
}

// ---- Zeichnen: Grundformen ---------------------------------------------------------------------------------

function shade(colour: string, factor: number): string {
    const n = parseInt(colour.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
    const b = Math.min(255, Math.round((n & 255) * factor));
    return "rgb(" + r + ", " + g + ", " + b + ")";
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], colour: string | CanvasGradient): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
}

function outline(ctx: CanvasRenderingContext2D, points: Point[], colour: string): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 0.6;
    ctx.stroke();
}

/** Schatten auf dem Boden: fällt nach rechts (Richtung +u), bleibt aber auf der eigenen Kachel. */
function groundShadow(ctx: CanvasRenderingContext2D, g: LocalGeometry, u1: number, v0: number, v1: number,
                      length: number): void {
    const end = Math.min(0.99, u1 + length);
    if (end <= u1) { return; }
    const p = (u: number, v: number) => g.localToScreen(u, v, 0);
    polygon(ctx, [p(u1, v0), p(end, Math.min(0.99, v0 + 0.05)), p(end, Math.min(0.99, v1 + 0.05)), p(u1, v1)],
            "rgba(30, 40, 20, 0.22)");
}

type WallPoint = (t: number, z: number) => Point;

/** Punkte auf der rechten Wand (Rand u = u1) und der linken Wand (Rand v = v1): t läuft entlang der Wand. */
function walls(g: LocalGeometry, b: Box): { right: WallPoint, left: WallPoint } {
    const base = b.z0 * g.tileWidth;
    return {
        left: (t, z) => g.localToScreen(b.u0 + (b.u1 - b.u0) * t, b.v1, base + z),
        right: (t, z) => g.localToScreen(b.u1, b.v0 + (b.v1 - b.v0) * t, base + z),
    };
}

function quadOnWall(wall: WallPoint, t0: number, t1: number, z0: number, z1: number): Point[] {
    return [wall(t0, z0), wall(t1, z0), wall(t1, z1), wall(t0, z1)];
}

/** Fenster, Türen, Schaufenster – auf beiden sichtbaren Wänden. */
function drawFacade(ctx: CanvasRenderingContext2D, g: LocalGeometry, b: Box, heightPx: number): void {
    const w = g.tileWidth;
    const sides = walls(g, b);
    const glassDark = "rgba(40, 60, 85, 0.55)";
    const glassLight = "rgba(215, 232, 245, 0.8)";

    for (const side of [sides.right, sides.left]) {
        const lightSide = side === sides.left;
        const glass = lightSide ? glassLight : glassDark;
        switch (b.facade) {
            case "house": {
                const floors = Math.max(1, Math.round(heightPx / (w * 0.13)));
                for (let f = 0; f < floors; f++) {
                    const z = f * w * 0.13 + w * 0.04;
                    for (const t of [0.18, 0.62]) {
                        polygon(ctx, quadOnWall(side, t, t + 0.2, z, z + w * 0.05),
                                lightSide ? glassLight : "rgba(170, 195, 215, 0.8)");
                    }
                }
                if (lightSide) {
                    polygon(ctx, quadOnWall(side, 0.42, 0.56, 0, w * 0.075), "#6b4a33");   // Haustür
                }
                break;
            }
            case "apartment":
            case "office": {
                const floor = w * (b.facade === "office" ? 0.09 : 0.1);
                const columns = b.facade === "office" ? [0.08, 0.3, 0.52, 0.74] : [0.12, 0.42, 0.72];
                for (let z = floor * 0.35; z + floor * 0.5 < heightPx - floor * 0.15; z += floor) {
                    for (const t of columns) {
                        polygon(ctx, quadOnWall(side, t, t + 0.16, z, z + floor * 0.5), glass);
                    }
                    if (b.facade === "apartment") {
                        // Balkonbrüstung als feine Linie
                        polygon(ctx, quadOnWall(side, 0.05, 0.95, z - floor * 0.08, z - floor * 0.02), "rgba(0, 0, 0, 0.12)");
                    }
                }
                break;
            }
            case "glass": {
                // Glasfassade: durchgehende Fensterbänder, dazwischen schmale Brüstungen
                const floor = w * 0.08;
                polygon(ctx, quadOnWall(side, 0, 1, 0, heightPx),
                        lightSide ? "rgba(170, 205, 235, 0.55)" : "rgba(30, 55, 85, 0.45)");
                for (let z = floor; z < heightPx; z += floor) {
                    polygon(ctx, quadOnWall(side, 0, 1, z - floor * 0.18, z), "rgba(255, 255, 255, 0.25)");
                }
                for (const t of [0.25, 0.5, 0.75]) {
                    polygon(ctx, quadOnWall(side, t - 0.01, t + 0.01, 0, heightPx), "rgba(0, 0, 0, 0.12)");
                }
                break;
            }
            case "shop": {
                // Schaufenster im Erdgeschoss, darüber eine farbige Markise
                polygon(ctx, quadOnWall(side, 0.08, 0.92, w * 0.01, w * 0.075), glass);
                polygon(ctx, quadOnWall(side, 0.04, 0.96, w * 0.075, w * 0.1), b.accent || "#c0392b");
                for (let z = w * 0.13; z < heightPx - w * 0.06; z += w * 0.1) {
                    for (const t of [0.15, 0.45, 0.75]) {
                        polygon(ctx, quadOnWall(side, t, t + 0.14, z, z + w * 0.045), glass);
                    }
                }
                break;
            }
            case "firebay": {
                // Fahrzeughalle der Feuerwache: drei hohe Tore mit weißem Rahmen und Lamellen
                const doorTop = Math.min(heightPx * 0.78, w * 0.17);
                for (const t of [0.05, 0.37, 0.69]) {
                    polygon(ctx, quadOnWall(side, t - 0.015, t + 0.275, 0, doorTop + w * 0.012), "#f4f4f4");
                    polygon(ctx, quadOnWall(side, t, t + 0.26, 0, doorTop), lightSide ? "#8e2a22" : "#6e1f19");
                    for (let z = doorTop * 0.25; z < doorTop; z += doorTop * 0.25) {
                        polygon(ctx, quadOnWall(side, t, t + 0.26, z - 0.6, z + 0.6), "rgba(255, 255, 255, 0.35)");
                    }
                }
                polygon(ctx, quadOnWall(side, 0, 1, heightPx - w * 0.03, heightPx - w * 0.012), "#f4f4f4");
                break;
            }
            case "police": {
                // Fensterreihen wie im Büro, dazu ein blaues Band unter dem Dach und ein blauer Sockel
                const floor = w * 0.1;
                for (let z = floor * 0.35; z + floor * 0.5 < heightPx - floor * 0.4; z += floor) {
                    for (const t of [0.08, 0.3, 0.52, 0.74]) {
                        polygon(ctx, quadOnWall(side, t, t + 0.16, z, z + floor * 0.5), glass);
                    }
                }
                polygon(ctx, quadOnWall(side, 0, 1, heightPx - w * 0.045, heightPx - w * 0.015), "#2e5aa8");
                polygon(ctx, quadOnWall(side, 0, 1, 0, w * 0.018), "#24467f");
                break;
            }
            case "hall": {
                // Industriehalle: hohe, schmale Fensterbänder und Lisenen
                for (let t = 0.06; t < 0.94; t += 0.125) {
                    polygon(ctx, quadOnWall(side, t, t + 0.06, heightPx * 0.25, heightPx * 0.85), glass);
                }
                polygon(ctx, quadOnWall(side, 0, 1, heightPx * 0.92, heightPx), "rgba(0, 0, 0, 0.12)");
                break;
            }
            case "garage": {
                // große Tore, oben ein Fensterband
                for (const t of [0.12, 0.55]) {
                    polygon(ctx, quadOnWall(side, t, t + 0.3, 0, Math.min(heightPx * 0.55, w * 0.12)), "rgba(60, 60, 60, 0.45)");
                }
                if (heightPx > w * 0.18) {
                    polygon(ctx, quadOnWall(side, 0.05, 0.95, heightPx * 0.72, heightPx * 0.86), glass);
                }
                break;
            }
        }
    }
}

function drawSmallBox(ctx: CanvasRenderingContext2D, g: LocalGeometry, u0: number, v0: number, u1: number, v1: number,
                      z0: number, h: number, colour: string): void {
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
    polygon(ctx, [p(u1, v0, z0), p(u1, v1, z0), p(u1, v1, z0 + h), p(u1, v0, z0 + h)], shade(colour, 0.7));
    polygon(ctx, [p(u0, v1, z0), p(u1, v1, z0), p(u1, v1, z0 + h), p(u0, v1, z0 + h)], shade(colour, 0.86));
    polygon(ctx, [p(u0, v0, z0 + h), p(u1, v0, z0 + h), p(u1, v1, z0 + h), p(u0, v1, z0 + h)], colour);
}

/** Zylinder (Tank, Schornstein, Kühlturm): Körper zwischen zwei Ellipsen, oben eine helle Ellipse. */
function drawCylinder(ctx: CanvasRenderingContext2D, g: LocalGeometry, u: number, v: number, radius: number,
                      z0: number, h: number, colour: string): void {
    const c0 = g.localToScreen(u, v, z0);
    const c1 = g.localToScreen(u, v, z0 + h);
    const rx = radius * g.tileWidth * 0.71;
    const ry = rx / 2;
    const body = ctx.createLinearGradient(c0.x - rx, 0, c0.x + rx, 0);
    body.addColorStop(0, shade(colour, 0.98));
    body.addColorStop(0.6, shade(colour, 0.82));
    body.addColorStop(1, shade(colour, 0.6));
    ctx.beginPath();
    ctx.ellipse(c0.x, c0.y, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(c1.x - rx, c1.y);
    ctx.ellipse(c1.x, c1.y, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c1.x, c1.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(colour, 1.08);
    ctx.fill();
}

function drawRoof(ctx: CanvasRenderingContext2D, g: LocalGeometry, b: Box, heightPx: number): void {
    const w = g.tileWidth;
    const base = b.z0 * w;
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, base + z);
    const { u0, u1, v0, v1 } = b;
    const top = [p(u0, v0, heightPx), p(u1, v0, heightPx), p(u1, v1, heightPx), p(u0, v1, heightPx)];

    switch (b.roofStyle) {
        case "flat":
            polygon(ctx, top, b.roof);
            break;
        case "parapet": {
            // Flachdach mit hellem Rand (Attika)
            polygon(ctx, top, shade(b.roof, 1.25));
            const i = Math.min(0.04, (u1 - u0) * 0.08);
            polygon(ctx, [p(u0 + i, v0 + i, heightPx), p(u1 - i, v0 + i, heightPx), p(u1 - i, v1 - i, heightPx),
                          p(u0 + i, v1 - i, heightPx)], b.roof);
            break;
        }
        case "gableU": {
            // Satteldach, First in u-Richtung
            const ridge = w * 0.11;
            const mid = (v0 + v1) / 2;
            const r0 = p(u0, mid, heightPx + ridge);
            const r1 = p(u1, mid, heightPx + ridge);
            polygon(ctx, [p(u0, v0, heightPx), p(u1, v0, heightPx), r1, r0], shade(b.roof, 1.15));   // hintere Fläche
            polygon(ctx, [p(u1, v0, heightPx), p(u1, v1, heightPx), r1], shade(b.wall, 0.72));         // Giebel rechts
            polygon(ctx, [p(u0, v1, heightPx), p(u1, v1, heightPx), r1, r0], b.roof);                  // vordere Fläche
            break;
        }
        case "gableV": {
            // Satteldach, First in v-Richtung
            const ridge = w * 0.11;
            const mid = (u0 + u1) / 2;
            const r0 = p(mid, v0, heightPx + ridge);
            const r1 = p(mid, v1, heightPx + ridge);
            polygon(ctx, [p(u0, v0, heightPx), p(u0, v1, heightPx), r1, r0], shade(b.roof, 1.15));
            polygon(ctx, [p(u0, v1, heightPx), p(u1, v1, heightPx), r1], shade(b.wall, 0.88));         // Giebel links
            polygon(ctx, [p(u1, v0, heightPx), p(u1, v1, heightPx), r1, r0], shade(b.roof, 0.78));
            break;
        }
        case "hip":
        case "spire": {
            const apex = p((u0 + u1) / 2, (v0 + v1) / 2, heightPx + w * (b.roofStyle === "spire" ? 0.35 : 0.12));
            polygon(ctx, [top[0], top[1], apex], shade(b.roof, 1.1));
            polygon(ctx, [top[0], top[3], apex], b.roof);
            polygon(ctx, [top[1], top[2], apex], shade(b.roof, 0.7));
            polygon(ctx, [top[3], top[2], apex], shade(b.roof, 0.88));
            break;
        }
        case "sawtooth": {
            // Sheddach: schräge Dachflächen mit senkrechten Fensterbändern
            polygon(ctx, top, shade(b.roof, 0.95));
            const teeth = 3;
            const rise = w * 0.07;
            for (let i = 0; i < teeth; i++) {
                const a = u0 + (u1 - u0) * (i / teeth);
                const c = u0 + (u1 - u0) * ((i + 1) / teeth);
                polygon(ctx, [p(a, v0, heightPx), p(c, v0, heightPx + rise), p(c, v1, heightPx + rise), p(a, v1, heightPx)],
                        shade(b.roof, 1.15));
                polygon(ctx, [p(c, v0, heightPx), p(c, v0, heightPx + rise), p(c, v1, heightPx + rise), p(c, v1, heightPx)],
                        "rgba(200, 220, 235, 0.9)");
            }
            break;
        }
    }

    // Aufbauten auf Flachdächern
    const cu = (u0 + u1) / 2;
    const cv = (v0 + v1) / 2;
    const roofZ = base + heightPx;
    switch (b.rooftop) {
        case "unit":
            drawSmallBox(ctx, g, cu - 0.12, cv - 0.08, cu + 0.04, cv + 0.08, roofZ, w * 0.05, "#c4c4c0");
            break;
        case "tank":
            drawCylinder(ctx, g, cu, cv, 0.1, roofZ, w * 0.12, "#8e8a84");
            break;
        case "chimney": {
            // Schornstein aus Ziegeln im hinteren Teil des Dachs
            const su = u0 + (u1 - u0) * 0.28;
            const sv = v0 + (v1 - v0) * 0.3;
            drawSmallBox(ctx, g, su - 0.045, sv - 0.045, su + 0.045, sv + 0.045, roofZ, w * 0.115, "#8a4b3b");
            break;
        }
        case "siren":
            drawCylinder(ctx, g, cu, cv, 0.05, roofZ, w * 0.08, "#9a9a96");
            drawCylinder(ctx, g, cu, cv, 0.09, roofZ + w * 0.08, w * 0.03, "#5a5a58");
            break;
        case "skylight":
            drawSmallBox(ctx, g, cu - 0.22, cv - 0.22, cu + 0.22, cv + 0.22, roofZ, w * 0.04, "#bcd6ea");
            break;
        case "antenna": {
            const foot = p(cu, cv, heightPx);
            const tip = p(cu, cv, heightPx + w * 0.35);
            ctx.strokeStyle = "#555";
            ctx.lineWidth = Math.max(1, w / 64);
            ctx.beginPath();
            ctx.moveTo(foot.x, foot.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, Math.max(1, w / 50), 0, Math.PI * 2);
            ctx.fillStyle = "#d0312d";
            ctx.fill();
            break;
        }
        case "helipad": {
            const c = p(cu, cv, heightPx);
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, w * 0.18, w * 0.09, 0, 0, Math.PI * 2);
            ctx.fillStyle = "#3d3d3d";
            ctx.fill();
            ctx.fillStyle = "#f2d43b";
            ctx.font = "bold " + Math.round(w * 0.11) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("H", c.x, c.y + 1);
            break;
        }
    }
}

function drawBox(ctx: CanvasRenderingContext2D, g: LocalGeometry, b: Box): void {
    const heightPx = b.height * g.tileWidth;
    const base = b.z0 * g.tileWidth;
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, base + z);
    const { u0, u1, v0, v1 } = b;
    if (b.z0 === 0) {
        groundShadow(ctx, g, u1, v0, v1, b.height * 0.5);
    }
    const right = [p(u1, v0, 0), p(u1, v1, 0), p(u1, v1, heightPx), p(u1, v0, heightPx)];
    const left = [p(u0, v1, 0), p(u1, v1, 0), p(u1, v1, heightPx), p(u0, v1, heightPx)];
    polygon(ctx, right, shade(b.wall, 0.72));
    polygon(ctx, left, shade(b.wall, 0.9));
    drawFacade(ctx, g, b, heightPx);
    // feine Kanten, damit Formen auch bei ähnlichen Farben unterscheidbar bleiben
    outline(ctx, right, "rgba(0, 0, 0, 0.18)");
    outline(ctx, left, "rgba(0, 0, 0, 0.12)");
    drawRoof(ctx, g, b, heightPx);
}

function drawTree(ctx: CanvasRenderingContext2D, g: LocalGeometry, t: Tree): void {
    const base = g.localToScreen(t.u, t.v, 0);
    const s = g.tileWidth * 0.1 * t.size;
    ctx.beginPath();
    ctx.ellipse(base.x + s * 0.6, base.y + s * 0.15, s * 0.9, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 40, 20, 0.25)";
    ctx.fill();
    ctx.fillStyle = "#5b4026";
    ctx.fillRect(base.x - s * 0.12, base.y - s * 1.1, s * 0.24, s * 1.1);
    if (t.conifer) {
        polygon(ctx, [{ x: base.x - s * 0.8, y: base.y - s * 0.7 }, { x: base.x, y: base.y - s * 3 },
                      { x: base.x + s * 0.8, y: base.y - s * 0.7 }], "#2d5e34");
        polygon(ctx, [{ x: base.x, y: base.y - s * 3 }, { x: base.x + s * 0.8, y: base.y - s * 0.7 },
                      { x: base.x + s * 0.1, y: base.y - s * 0.7 }], "#234a29");
    } else {
        ctx.beginPath();
        ctx.arc(base.x, base.y - s * 1.7, s, 0, Math.PI * 2);
        ctx.fillStyle = "#3f7d36";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(base.x - s * 0.3, base.y - s * 2, s * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = "#5c9a49";
        ctx.fill();
    }
}

function drawChimney(ctx: CanvasRenderingContext2D, g: LocalGeometry, c: Chimney): void {
    const w = g.tileWidth;
    drawCylinder(ctx, g, c.u, c.v, 0.1, 0, c.height * w, "#8b8682");
    drawCylinder(ctx, g, c.u, c.v, 0.1, c.height * w - w * 0.1, w * 0.06, "#c9483f");
    drawCylinder(ctx, g, c.u, c.v, 0.1, c.height * w - w * 0.04, w * 0.04, "#f2f2f2");
}

function drawItem(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Item): void {
    switch (item.kind) {
        case "box": drawBox(ctx, g, item); break;
        case "tank":
            groundShadow(ctx, g, item.u + item.radius, item.v - item.radius, item.v + item.radius, item.height * 0.5);
            drawCylinder(ctx, g, item.u, item.v, item.radius, 0, item.height * g.tileWidth, item.colour);
            break;
        case "tree": drawTree(ctx, g, item); break;
        case "chimney": drawChimney(ctx, g, item); break;
        case "coolingTower": drawCoolingTower(ctx, g, item); break;
        case "dome": drawDome(ctx, g, item); break;
        case "vehicle": drawVehicle(ctx, g, item); break;
        case "sign": drawSign(ctx, g, item); break;
        case "controlTower": drawControlTower(ctx, g, item); break;
        case "pile": drawPile(ctx, g, item); break;
        case "pylon": drawPylon(ctx, g, item); break;
        case "mast": drawMast(ctx, g, item); break;
        case "flag": drawFlag(ctx, g, item); break;
        case "conveyor": drawConveyor(ctx, g, item); break;
        case "waterTank": drawWaterTank(ctx, g, item); break;
    }
}

/** Wasserturm: vier Stützen, darauf ein runder Behälter mit blauem Band und flacher Kuppel */
function drawWaterTank(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: WaterTank): void {
    const w = g.tileWidth;
    const legTop = item.height * 0.6 * w;
    ctx.strokeStyle = "#6b6b68";
    ctx.lineWidth = Math.max(1.5, w / 50);
    ctx.beginPath();
    for (const [du, dv] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) {
        const foot = g.localToScreen(item.u + du, item.v + dv, 0);
        const top = g.localToScreen(item.u + du * 0.8, item.v + dv * 0.8, legTop);
        ctx.moveTo(foot.x, foot.y);
        ctx.lineTo(top.x, top.y);
    }
    // Querstreben
    const a = g.localToScreen(item.u - 0.18, item.v + 0.18, legTop * 0.5);
    const b = g.localToScreen(item.u + 0.18, item.v + 0.18, legTop * 0.5);
    const c = g.localToScreen(item.u + 0.18, item.v - 0.18, legTop * 0.5);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    drawCylinder(ctx, g, item.u, item.v, 0.06, 0, legTop, "#8d8d8a");                       // Steigrohr
    drawCylinder(ctx, g, item.u, item.v, 0.28, legTop, item.height * 0.4 * w, "#d7dde3");    // Behälter
    drawCylinder(ctx, g, item.u, item.v, 0.285, legTop + item.height * 0.14 * w, item.height * 0.1 * w, "#2f8cff");
    const top = g.localToScreen(item.u, item.v, item.height * w);
    const rx = 0.28 * w * 0.71;
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, rx, rx * 0.35, 0, Math.PI, 0);
    ctx.ellipse(top.x, top.y, rx, rx / 2, 0, 0, Math.PI);
    ctx.fillStyle = "#bfc7cf";
    ctx.fill();
}

/** Halde als flacher Kegel mit heller und dunkler Seite */
function drawPile(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Pile): void {
    const w = g.tileWidth;
    const c = g.localToScreen(item.u, item.v, 0);
    const rx = w * 0.3 * item.size;
    const ry = rx / 2;
    const peak = { x: c.x - rx * 0.1, y: c.y - w * 0.16 * item.size };
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(item.colour, 0.8);
    ctx.fill();
    polygon(ctx, [{ x: c.x - rx, y: c.y }, peak, { x: c.x + rx * 0.2, y: c.y + ry }], shade(item.colour, 1.35));
    polygon(ctx, [{ x: c.x + rx * 0.2, y: c.y + ry }, peak, { x: c.x + rx, y: c.y }], shade(item.colour, 0.9));
}

/** Strommast: Gitterturm mit zwei Querträgern und Isolatoren */
function drawPylon(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Pylon): void {
    const w = g.tileWidth;
    const h = item.height * w;
    const foot = g.localToScreen(item.u, item.v, 0);
    const spread = w * 0.06;
    ctx.strokeStyle = "#6b6f72";
    ctx.lineWidth = Math.max(1, w / 80);
    ctx.beginPath();
    ctx.moveTo(foot.x - spread, foot.y);
    ctx.lineTo(foot.x, foot.y - h);
    ctx.lineTo(foot.x + spread, foot.y);
    for (let i = 1; i < 4; i++) {
        const y = foot.y - h * i / 4;
        const s = spread * (1 - i / 4);
        ctx.moveTo(foot.x - s, y);
        ctx.lineTo(foot.x + s, y + h / 8);
    }
    for (const [z, arm] of [[0.72, 0.16], [0.9, 0.11]]) {
        ctx.moveTo(foot.x - w * arm, foot.y - h * z);
        ctx.lineTo(foot.x + w * arm, foot.y - h * z);
    }
    ctx.stroke();
    ctx.fillStyle = "#3d4a57";
    for (const [z, arm] of [[0.72, 0.16], [0.9, 0.11]]) {
        for (const s of [-1, 1]) {
            ctx.fillRect(foot.x + s * w * arm - 1, foot.y - h * z, 2, Math.max(2, w / 40));
        }
    }
}

/** Funkmast: schlanker Gittermast mit rotem Licht an der Spitze */
function drawMast(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Mast): void {
    const w = g.tileWidth;
    const foot = g.localToScreen(item.u, item.v, item.base * w);
    const h = item.height * w;
    const s = w * 0.025;
    ctx.strokeStyle = "#8a8e92";
    ctx.lineWidth = Math.max(1, w / 90);
    ctx.beginPath();
    ctx.moveTo(foot.x - s, foot.y);
    ctx.lineTo(foot.x, foot.y - h);
    ctx.lineTo(foot.x + s, foot.y);
    for (let i = 1; i < 6; i++) {
        const y = foot.y - h * i / 6;
        const k = s * (1 - i / 6);
        ctx.moveTo(foot.x - k, y);
        ctx.lineTo(foot.x + k, y - h / 12);
    }
    ctx.stroke();
    // Richtfunkschüsseln
    ctx.fillStyle = "#e9ecef";
    ctx.beginPath();
    ctx.ellipse(foot.x - s * 1.6, foot.y - h * 0.62, w * 0.02, w * 0.03, 0, 0, Math.PI * 2);
    ctx.ellipse(foot.x + s * 1.6, foot.y - h * 0.48, w * 0.02, w * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(foot.x, foot.y - h, Math.max(1.5, w / 45), 0, Math.PI * 2);
    ctx.fillStyle = "#e0322b";
    ctx.fill();
}

/** Fahnenmast mit Fahne (die Fahne zeigt nach rechts) */
function drawFlag(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Flag): void {
    const w = g.tileWidth;
    const foot = g.localToScreen(item.u, item.v, item.base * w);
    const h = item.height * w;
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = Math.max(1, w / 90);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(foot.x, foot.y - h);
    ctx.stroke();
    const fw = w * 0.11;
    const fh = w * 0.06;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y - h);
    ctx.quadraticCurveTo(foot.x + fw * 0.5, foot.y - h - fh * 0.25, foot.x + fw, foot.y - h + fh * 0.1);
    ctx.lineTo(foot.x + fw, foot.y - h + fh);
    ctx.quadraticCurveTo(foot.x + fw * 0.5, foot.y - h + fh * 0.75, foot.x, foot.y - h + fh);
    ctx.closePath();
    ctx.fillStyle = item.colour;
    ctx.fill();
}

/** Förderband: schmales, schräges Band auf Stützen */
function drawConveyor(ctx: CanvasRenderingContext2D, g: LocalGeometry, item: Conveyor): void {
    const w = g.tileWidth;
    const a = g.localToScreen(item.u0, item.v0, item.z0 * w);
    const b = g.localToScreen(item.u1, item.v1, item.z1 * w);
    ctx.strokeStyle = "#6b6b68";
    ctx.lineWidth = Math.max(1, w / 80);
    ctx.beginPath();
    for (const t of [0.25, 0.75]) {
        const u = item.u0 + (item.u1 - item.u0) * t;
        const v = item.v0 + (item.v1 - item.v0) * t;
        const z = (item.z0 + (item.z1 - item.z0) * t) * w;
        const top = g.localToScreen(u, v, z);
        const foot = g.localToScreen(u, v, 0);
        ctx.moveTo(foot.x, foot.y);
        ctx.lineTo(top.x, top.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#3e3d3b";
    ctx.lineWidth = Math.max(2, w / 22);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = "#9a958c";
    ctx.lineWidth = Math.max(1, w / 60);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - w * 0.012);
    ctx.lineTo(b.x, b.y - w * 0.012);
    ctx.stroke();
}

function drawCoolingTower(ctx: CanvasRenderingContext2D, g: LocalGeometry, t: CoolingTower): void {
    const w = g.tileWidth;
    const base = g.localToScreen(t.u, t.v, 0);
    const h = t.height * w;
    const r = t.radius * w * 0.71;
    // Umriss: unten breit, bei 70 % Höhe am schmalsten, oben wieder etwas breiter
    const waist = r * 0.62;
    const top = r * 0.72;
    const body = ctx.createLinearGradient(base.x - r, 0, base.x + r, 0);
    body.addColorStop(0, "#eceee9");
    body.addColorStop(0.55, "#c9ccc5");
    body.addColorStop(1, "#9ea29a");
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, r, r / 2, 0, 0, Math.PI);
    ctx.quadraticCurveTo(base.x - waist * 0.9, base.y - h * 0.7, base.x - top, base.y - h);
    ctx.lineTo(base.x + top, base.y - h);
    ctx.quadraticCurveTo(base.x + waist * 0.9, base.y - h * 0.7, base.x + r, base.y);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    // Öffnung oben
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - h, top, top / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5f625c";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - h, top, top / 2, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = "#f4f5f2";
    ctx.lineWidth = Math.max(1, w / 64);
    ctx.stroke();
}

function drawDome(ctx: CanvasRenderingContext2D, g: LocalGeometry, d: Dome): void {
    const w = g.tileWidth;
    drawCylinder(ctx, g, d.u, d.v, d.radius, 0, d.height * w, d.colour);
    const top = g.localToScreen(d.u, d.v, d.height * w);
    const rx = d.radius * w * 0.71;
    const dome = ctx.createRadialGradient(top.x - rx * 0.3, top.y - rx * 0.5, rx * 0.1, top.x, top.y, rx);
    dome.addColorStop(0, "#ffffff");
    dome.addColorStop(1, "#b9beb5");
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, rx, rx * 0.6, 0, Math.PI, 0);
    ctx.ellipse(top.x, top.y, rx, rx / 2, 0, 0, Math.PI);
    ctx.fillStyle = dome;
    ctx.fill();
}

function drawControlTower(ctx: CanvasRenderingContext2D, g: LocalGeometry, t: ControlTower): void {
    const w = g.tileWidth;
    drawCylinder(ctx, g, t.u, t.v, 0.1, 0, t.height * w * 0.8, "#d6d6d2");
    drawCylinder(ctx, g, t.u, t.v, 0.2, t.height * w * 0.8, t.height * w * 0.12, "#5c8fb8");   // Glaskanzel
    drawCylinder(ctx, g, t.u, t.v, 0.22, t.height * w * 0.92, t.height * w * 0.04, "#8e8e8a");  // Dach
}

/** Kleines Fahrzeug auf dem Hof (Löschfahrzeug, Streifenwagen) oder geparktes Flugzeug. */
function drawVehicle(ctx: CanvasRenderingContext2D, g: LocalGeometry, v: Vehicle): void {
    const w = g.tileWidth;
    if (v.type === "plane") {
        const c = g.localToScreen(v.u, v.v, w * 0.04);
        ctx.beginPath();
        ctx.ellipse(c.x + w * 0.05, c.y + w * 0.04, w * 0.22, w * 0.06, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, w * 0.24, w * 0.055, -0.46, 0, Math.PI * 2);
        ctx.fillStyle = "#f6f6f6";
        ctx.fill();
        polygon(ctx, [{ x: c.x - w * 0.02, y: c.y - w * 0.16 }, { x: c.x + w * 0.07, y: c.y },
                      { x: c.x - w * 0.02, y: c.y + w * 0.16 }, { x: c.x - w * 0.06, y: c.y }], "#dcdcdc");
        polygon(ctx, [{ x: c.x - w * 0.2, y: c.y + w * 0.06 }, { x: c.x - w * 0.23, y: c.y - w * 0.04 },
                      { x: c.x - w * 0.17, y: c.y + w * 0.05 }], "#2c7fb8");
        return;
    }
    // Längs- und Querausdehnung je nach Fahrzeug; along = Fahrtrichtung in Ansichtsrichtungen
    const sizes: { [type: string]: [number, number, number] } = {   // Länge, Breite, Höhe (Rautenbreiten)
        bulldozer: [0.2, 0.16, 0.08], car: [0.16, 0.09, 0.045], fireTruck: [0.32, 0.15, 0.1],
        ladderTruck: [0.4, 0.15, 0.1], policeCar: [0.2, 0.1, 0.05], van: [0.22, 0.11, 0.07],
    };
    const [length, width, height] = sizes[v.type] || sizes.car;
    const alongU = (v.along || "u") === "u";
    const halfU = (alongU ? length : width) / 2;
    const halfV = (alongU ? width : length) / 2;
    const u0 = v.u - halfU;
    const u1 = v.u + halfU;
    const v0 = v.v - halfV;
    const v1 = v.v + halfV;
    const colours: { [type: string]: string } = {
        bulldozer: "#e5b21c", fireTruck: "#d0312d", ladderTruck: "#d0312d", policeCar: "#f2f4f7",
    };
    const body = v.colour || colours[v.type] || "#c0392b";
    drawSmallBox(ctx, g, u0, v0, u1, v1, 0, w * height, body);

    switch (v.type) {
        case "car": case "policeCar": case "van": {
            // Fahrgastzelle mit Scheiben
            const iu = alongU ? (u1 - u0) * 0.22 : 0.012;
            const iv = alongU ? 0.012 : (v1 - v0) * 0.22;
            drawSmallBox(ctx, g, u0 + iu, v0 + iv, u1 - iu, v1 - iv, w * height, w * 0.03,
                         v.type === "van" ? body : "#6f8fa8");
            if (v.type === "policeCar") {
                drawSmallBox(ctx, g, v.u - 0.02, v.v - 0.02, v.u + 0.02, v.v + 0.02, w * (height + 0.03), w * 0.015,
                             "#3d8bff");
            }
            break;
        }
        case "fireTruck":
            drawSmallBox(ctx, g, u0 + 0.03, v0 + 0.02, u1 - 0.08, v1 - 0.02, w * height, w * 0.015, "#c9c9c9");
            drawSmallBox(ctx, g, v.u - 0.02, v.v - 0.02, v.u + 0.02, v.v + 0.02, w * (height + 0.015), w * 0.015,
                         "#3d8bff");
            break;
        case "ladderTruck": {
            // Drehleiter: Drehkranz und lange Leiter, die schräg nach hinten liegt
            drawCylinder(ctx, g, alongU ? u1 - 0.1 : v.u, alongU ? v.v : v1 - 0.1, 0.05, w * height, w * 0.03, "#8d8d8a");
            const a = g.localToScreen(alongU ? u1 - 0.1 : v.u, alongU ? v.v : v1 - 0.1, w * (height + 0.04));
            const b = g.localToScreen(alongU ? u0 + 0.02 : v.u, alongU ? v.v : v0 + 0.02, w * (height + 0.07));
            ctx.strokeStyle = "#d9d9d6";
            ctx.lineWidth = Math.max(2, w / 30);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            break;
        }
        case "bulldozer": {
            // Kabine und Schild vorn
            drawSmallBox(ctx, g, v.u - 0.04, v.v - 0.04, v.u + 0.04, v.v + 0.04, w * height, w * 0.05, "#d9a514");
            const bu0 = alongU ? u1 : u0;
            const bv0 = alongU ? v0 : v1;
            drawSmallBox(ctx, g, bu0, bv0, alongU ? u1 + 0.03 : u1, alongU ? v1 : v1 + 0.03, 0, w * 0.05, "#7a7a76");
            break;
        }
    }
}

/** Schild mit kurzem Text auf dem Dach. Der Text steht aufrecht, damit er gut lesbar ist. */
function drawSign(ctx: CanvasRenderingContext2D, g: LocalGeometry, s: Sign): void {
    const w = g.tileWidth;
    const c = g.localToScreen(s.u, s.v, s.z * w + w * 0.06);
    const size = Math.max(7, Math.round(w * (s.text.length > 3 ? 0.09 : 0.15)));
    ctx.font = "bold " + size + "px sans-serif";
    const width = ctx.measureText(s.text).width + size * 0.6;
    const height = size * 1.3;
    ctx.fillStyle = s.background;
    ctx.fillRect(c.x - width / 2, c.y - height / 2, width, height);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - width / 2, c.y - height / 2, width, height);
    ctx.fillStyle = s.colour;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.text, c.x, c.y + 1);
}

/** Vordere Ecke eines Objekts (Reihenfolge innerhalb der Kachel: hinten zuerst). */
function depthOf(item: Item): number {
    switch (item.kind) {
        // Aufbauten auf einem Quader (z0 > 0) nach dem Quader darunter zeichnen
        case "box": return item.u1 + item.v1 + (item.z0 > 0 ? 1 + item.z0 : 0);
        case "tank": return item.u + item.v + item.radius * 2;
        case "sign": return 9;   // Schilder zuletzt, damit sie oben liegen
        case "mast": case "flag": return item.base > 0 ? 8 : item.u + item.v;
        case "conveyor": return Math.max(item.u0 + item.v0, item.u1 + item.v1);
        default: return item.u + item.v;
    }
}

// ---- Boden und Zusätze ---------------------------------------------------------------------------------------

function drawGroundMarks(ctx: CanvasRenderingContext2D, g: LocalGeometry, design: TileDesign, frame: number): void {
    const p = (u: number, v: number) => g.localToScreen(u, v, 0);
    switch (design.ground) {
        case "parking":
            for (const v of [0.09, 0.91]) {
                for (let u = 0.15; u < 0.9; u += 0.14) {
                    polygon(ctx, [p(u, v - 0.04), p(u + 0.012, v - 0.04), p(u + 0.012, v + 0.04), p(u, v + 0.04)],
                            "rgba(255, 255, 255, 0.6)");
                }
            }
            break;
        case "garden":
            polygon(ctx, [p(0.45, 0.86), p(0.55, 0.86), p(0.55, 1), p(0.45, 1)], "#cdbf9c");   // Gartenweg
            break;
        case "field": {
            polygon(ctx, [p(0, 0), p(1, 0), p(1, 1), p(0, 1)], "#4caf50");
            for (let i = 0; i < 4; i++) {
                polygon(ctx, [p(i * 0.25, 0), p(i * 0.25 + 0.125, 0), p(i * 0.25 + 0.125, 1), p(i * 0.25, 1)],
                        "rgba(255, 255, 255, 0.07)");
            }
            polygon(ctx, [p(0.48, 0), p(0.52, 0), p(0.52, 1), p(0.48, 1)], "rgba(255, 255, 255, 0.7)");
            if (frame >= 0) {
                // Spiel läuft: Spieler als Punkte, die sich mit dem Animationsbild bewegen
                const players: Array<[number, number, string]> = [[0.2, 0.3, "#d0312d"], [0.35, 0.7, "#d0312d"],
                    [0.7, 0.25, "#2c7fb8"], [0.8, 0.65, "#2c7fb8"], [0.55, 0.5, "#ffffff"]];
                players.forEach((pl, i) => {
                    const shift = 0.08 * Math.sin((frame + i * 2) * Math.PI / 4);
                    const c = p(pl[0] + shift, pl[1] - shift);
                    ctx.beginPath();
                    ctx.arc(c.x, c.y - 2, Math.max(1.5, g.tileWidth / 40), 0, Math.PI * 2);
                    ctx.fillStyle = pl[2];
                    ctx.fill();
                });
            }
            break;
        }
        case "runway":
            polygon(ctx, [p(0, 0.06), p(1, 0.06), p(1, 0.94), p(0, 0.94)], "#4a4a4a");
            polygon(ctx, [p(0, 0.08), p(1, 0.08), p(1, 0.11), p(0, 0.11)], "#e8e8e8");
            polygon(ctx, [p(0, 0.89), p(1, 0.89), p(1, 0.92), p(0, 0.92)], "#e8e8e8");
            polygon(ctx, [p(0.15, 0.48), p(0.55, 0.48), p(0.55, 0.52), p(0.15, 0.52)], "#f2f2f2");
            break;
        case "apron":
            polygon(ctx, [p(0.47, 0), p(0.53, 0), p(0.53, 1), p(0.47, 1)], "rgba(242, 212, 59, 0.8)");   // Rollweg-Linie
            break;
        case "playground": {
            // Sandkasten, Schaukel und Rutsche
            polygon(ctx, [p(0.3, 0.3), p(0.6, 0.3), p(0.6, 0.6), p(0.3, 0.6)], "#e3cf98");
            polygon(ctx, [p(0.27, 0.27), p(0.63, 0.27), p(0.63, 0.3), p(0.27, 0.3)], "#a0784e");
            const w = g.tileWidth;
            const s0 = g.localToScreen(0.68, 0.38, 0);
            const s1 = g.localToScreen(0.68, 0.62, 0);
            const t0 = g.localToScreen(0.68, 0.38, w * 0.12);
            const t1 = g.localToScreen(0.68, 0.62, w * 0.12);
            ctx.strokeStyle = "#c0392b";
            ctx.lineWidth = Math.max(1, w / 60);
            ctx.beginPath();
            ctx.moveTo(s0.x, s0.y); ctx.lineTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(s1.x, s1.y);
            ctx.stroke();
            const r0 = g.localToScreen(0.4, 0.72, w * 0.1);
            const r1 = g.localToScreen(0.6, 0.82, 0);
            ctx.strokeStyle = "#2e86c1";
            ctx.lineWidth = Math.max(1.5, w / 40);
            ctx.beginPath();
            ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y);
            ctx.stroke();
            break;
        }
        case "plaza":
            // Pflaster im Fischgrät-Eindruck: helle Streifen
            for (let i = 0; i < 6; i++) {
                const a = 0.05 + i * 0.16;
                polygon(ctx, [p(a, 0.05), p(a + 0.08, 0.05), p(a + 0.08, 0.95), p(a, 0.95)], "rgba(255, 255, 255, 0.12)");
            }
            break;
        case "gravel":
            for (let i = 0; i < 24; i++) {
                const a = p(((i * 37) % 97) / 100 + 0.015, ((i * 61) % 89) / 100 + 0.04);
                ctx.fillStyle = i % 2 === 0 ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.15)";
                ctx.fillRect(a.x, a.y, 1.5, 1.5);
            }
            break;
        case "yard":
            polygon(ctx, [p(0.05, 0.05), p(0.95, 0.05), p(0.95, 0.95), p(0.05, 0.95)], "#b9b4a8");
            for (let i = 0; i < 5; i++) {
                polygon(ctx, [p(0.1 + i * 0.18, 0.88), p(0.18 + i * 0.18, 0.88), p(0.18 + i * 0.18, 0.95),
                              p(0.1 + i * 0.18, 0.95)], i % 2 === 0 ? "#d0312d" : "#f2f2f2");
            }
            break;
    }
}

function drawExtra(ctx: CanvasRenderingContext2D, g: LocalGeometry, design: TileDesign, frame: number): void {
    const p = (u: number, v: number, z = 0) => g.localToScreen(u, v, z);
    const w = g.tileWidth;
    switch (design.extra) {
        case "cross": {
            const z = 0.36 * w;
            polygon(ctx, [p(0.42, 0.2, z), p(0.58, 0.2, z), p(0.58, 0.8, z), p(0.42, 0.8, z)], "#d0312d");
            polygon(ctx, [p(0.2, 0.42, z), p(0.8, 0.42, z), p(0.8, 0.58, z), p(0.2, 0.58, z)], "#d0312d");
            break;
        }
        case "containers": {
            const colours = ["#c0392b", "#2c7fb8", "#e1a33b", "#27ae60"];
            let i = 0;
            for (const [u, v] of [[0.12, 0.15], [0.55, 0.18], [0.18, 0.55], [0.58, 0.6]]) {
                drawSmallBox(ctx, g, u, v, u + 0.3, v + 0.22, 0, w * 0.1, colours[i++ % colours.length]);
            }
            break;
        }
        case "crane": {
            ctx.strokeStyle = "#e1a33b";
            ctx.lineWidth = Math.max(1.5, w / 28);
            const base = p(0.5, 0.5);
            const top = p(0.5, 0.5, w * 0.75);
            const arm = p(0.5, -0.5, w * 0.75);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.lineTo(arm.x, arm.y);
            ctx.stroke();
            break;
        }
        case "radar": {
            ctx.strokeStyle = "#555";
            ctx.lineWidth = Math.max(1.5, w / 40);
            const base = p(0.5, 0.5);
            const top = p(0.5, 0.5, w * 0.5);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.stroke();
            // Die Schüssel dreht sich mit dem Animationsbild (8 Bilder = eine Umdrehung)
            const turn = frame >= 0 ? Math.abs(Math.cos(frame * Math.PI / 4)) : 1;
            ctx.beginPath();
            ctx.ellipse(top.x, top.y, w * 0.14 * Math.max(0.2, turn), w * 0.06, -0.3, 0, Math.PI * 2);
            ctx.fillStyle = "#e8e8e8";
            ctx.fill();
            break;
        }
        case "fountain": {
            const c = p(0.5, 0.5);
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, w * 0.2, w * 0.1, 0, 0, Math.PI * 2);
            ctx.fillStyle = "#b9c3cc";
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, w * 0.15, w * 0.075, 0, 0, Math.PI * 2);
            ctx.fillStyle = "#4a90d9";
            ctx.fill();
            // Wasserstrahl, der mit dem Animationsbild höher und niedriger wird
            const jet = w * (0.12 + 0.05 * ((frame < 0 ? 0 : frame) % 4));
            ctx.strokeStyle = "rgba(210, 232, 255, 0.95)";
            ctx.lineWidth = Math.max(1.5, w / 40);
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x, c.y - jet);
            ctx.stroke();
            break;
        }
    }
}

/**
 * Zeichnet Boden und Gebäudeteil einer Kachel. (0, 0) des Kontexts ist die obere Rautenspitze.
 * rotation: Drehung der Ansicht (0–3); die Gestaltung wird damit von Karten- in Ansichtsrichtungen gedreht.
 */
export function drawBuildingPart(ctx: CanvasRenderingContext2D, g: LocalGeometry, part: BuildingPart,
                                 frame = -1, variant = 0, rotation = 0): void {
    const design = designFor(part, variant);
    // Boden und Zusätze werden Punkt für Punkt gedreht
    const turned: LocalGeometry = {
        localToScreen: (u: number, v: number, lift = 0) => {
            const q = mapLocalToView(u, v, rotation);
            return g.localToScreen(q.u, q.v, lift);
        },
        tileWidth: g.tileWidth,
    };
    const p = (u: number, v: number) => g.localToScreen(u, v, 0);
    polygon(ctx, [p(0, 0), p(1, 0), p(1, 1), p(0, 1)], design.lot);
    drawGroundMarks(ctx, turned, design, frame);

    const items = design.items.map((item) => rotateItem(item, rotation)).sort((a, b) => depthOf(a) - depthOf(b));
    for (const item of items) {
        drawItem(ctx, g, item);
    }
    drawExtra(ctx, turned, design, frame);
}

/** Drei Rauchwolken, die mit dem Animationsbild nach oben wandern und größer werden. */
export function drawSmoke(ctx: CanvasRenderingContext2D, g: LocalGeometry, baseZ: number, frame: number): void {
    for (let i = 0; i < 3; i++) {
        const step = (frame + i * 2) % 6;           // 0 … 5: Wolke steigt, dann neue Wolke unten
        const z = baseZ + g.tileWidth * (0.06 + step * 0.06);
        const c = g.localToScreen(0.5 + step * 0.02, 0.5 - step * 0.03, z);
        ctx.beginPath();
        ctx.arc(c.x, c.y, g.tileWidth * (0.05 + step * 0.015), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(110, 110, 110, " + (0.55 - step * 0.08) + ")";
        ctx.fill();
    }
}

/** Gelber Blitz: Diese Zone hat keinen Strom (blinkt, gesteuert vom AnimationManager). */
export function drawLightning(ctx: CanvasRenderingContext2D, g: LocalGeometry, baseZ: number): void {
    const c = g.localToScreen(0.5, 0.5, baseZ + g.tileWidth * 0.12);
    const s = g.tileWidth * 0.12;
    ctx.beginPath();
    ctx.moveTo(c.x + s * 0.3, c.y - s * 1.6);
    ctx.lineTo(c.x - s * 0.6, c.y + s * 0.1);
    ctx.lineTo(c.x - s * 0.05, c.y + s * 0.1);
    ctx.lineTo(c.x - s * 0.35, c.y + s * 1.5);
    ctx.lineTo(c.x + s * 0.65, c.y - s * 0.3);
    ctx.lineTo(c.x + s * 0.1, c.y - s * 0.3);
    ctx.closePath();
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "#7a5b00";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
}
