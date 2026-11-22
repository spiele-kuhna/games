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
type Facade = "none" | "house" | "apartment" | "office" | "glass" | "shop" | "garage";

/** Ein Quader auf der Kachel: Grundfläche (u0, v0)–(u1, v1), Höhe in Rautenbreiten. */
interface Box {
    kind: "box";
    u0: number; v0: number; u1: number; v1: number;
    height: number;
    wall: string;
    roof: string;
    roofStyle: RoofStyle;
    facade: Facade;
    /** Farbe der Markise über dem Schaufenster (nur facade = "shop") */
    accent?: string;
    /** kleine Aufbauten auf dem Flachdach */
    rooftop?: "none" | "unit" | "antenna" | "helipad" | "tank";
}

interface Tank { kind: "tank"; u: number; v: number; radius: number; height: number; colour: string; }
interface Tree { kind: "tree"; u: number; v: number; size: number; conifer: boolean; }
interface Chimney { kind: "chimney"; u: number; v: number; height: number; }
interface Pile { kind: "pile"; u: number; v: number; colour: string; }

type Item = Box | Tank | Tree | Chimney | Pile;

/** Alles, was auf einer Gebäudekachel gezeichnet wird. */
interface TileDesign {
    lot: string;
    /** zusätzliche Bodenmarkierung */
    ground: "none" | "parking" | "field" | "runway" | "garden";
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

// ---- Farben (selbst gewählt) --------------------------------------------------------------------------------

const HOUSE_WALLS = [["#c9a98a", "#b8a28c", "#cbb89c"],              // einfache Gegend
                     ["#e3cfae", "#d9c3a5", "#e8d9bd", "#cfd3c2"],
                     ["#f1e6d2", "#efe0c4", "#e4ead9", "#f3dcc8"],
                     ["#fbf6ec", "#eef2f4", "#f6ead8", "#e9efe6"]];     // gehobene Gegend
const HOUSE_ROOFS = ["#8a4b3b", "#a3543c", "#6e4436", "#54606f", "#7b5a3c", "#93463a"];
const APARTMENT_WALLS = ["#c8b8a0", "#d8c7a8", "#e6dccb", "#f0ebe2", "#d9cfc3", "#c9d2d6"];
const OFFICE_WALLS = [["#9aa3ac", "#a7a39a"], ["#8fa9c4", "#a5b1bd"], ["#7fa6d1", "#9db8d4"],
                      ["#6c99d6", "#89b0dd", "#5f8fca"]];
const AWNINGS = ["#c0392b", "#2e86c1", "#27ae60", "#e67e22", "#8e44ad"];
const INDUSTRY_WALLS = [["#b5a68a", "#a89a80", "#9f9a8f"], ["#a9adb0", "#b7b2a6", "#9fa6a8"]];
const LOT_PAVED = "#a8a49a";
const LOT_GRASS = "#86b466";
const LOT_GARDEN = "#7fb15d";

// ---- Gestaltung je Gebäudeart --------------------------------------------------------------------------------

function box(u0: number, v0: number, u1: number, v1: number, height: number, wall: string, roof: string,
             roofStyle: RoofStyle, facade: Facade, extra: { accent?: string, rooftop?: Box["rooftop"] } = {}): Box {
    return { accent: extra.accent, facade, height, kind: "box", roof, roofStyle, rooftop: extra.rooftop,
             u0, u1, v0, v1, wall };
}

/** Kleines Haus mit Garten: Größe, Lage, Dachrichtung und Farben würfeln. */
function smallHouse(seed: number, value: number, floors: number): Item[] {
    const size = 0.42 + rnd(seed, 1) * 0.18 + floors * 0.06;
    const depth = size * (0.75 + rnd(seed, 2) * 0.3);
    const u0 = 0.1 + rnd(seed, 3) * Math.max(0, 0.8 - size);
    const v0 = 0.1 + rnd(seed, 4) * Math.max(0, 0.8 - depth);
    const items: Item[] = [
        box(u0, v0, u0 + size, v0 + depth, 0.13 * floors, pick(HOUSE_WALLS[value], seed, 5), pick(HOUSE_ROOFS, seed, 6),
            rnd(seed, 7) < 0.5 ? "gableU" : "gableV", "house"),
    ];
    // Ein Baum im Garten, wenn Platz ist
    if (rnd(seed, 8) < 0.75) {
        const tu = u0 > 0.3 ? 0.16 : 0.84;
        const tv = v0 > 0.3 ? 0.18 : 0.84;
        items.push({ conifer: rnd(seed, 9) < 0.35, kind: "tree", size: 0.7 + rnd(seed, 10) * 0.4, u: tu, v: tv });
    }
    return items;
}

function residential(part: BuildingPart, seed: number): TileDesign {
    const v = Math.max(0, Math.min(3, part.value));
    if (part.size === 1 || part.level <= 1) {
        return { extra: "none", ground: "garden", items: smallHouse(seed, v, part.level === 1 ? 2 : 1),
                 lot: LOT_GARDEN, smokeFrom: -1 };
    }
    const wall = pick(APARTMENT_WALLS.slice(v, v + 3), seed, 1);
    if (part.level === 2) {
        const h = 0.38 + rnd(seed, 2) * 0.16;
        return { extra: "none", ground: "none", lot: LOT_PAVED, smokeFrom: -1,
                 items: [box(0.08, 0.08, 0.92, 0.92, h, wall, "#8d8a84", "parapet", "apartment",
                             { rooftop: rnd(seed, 3) < 0.4 ? "unit" : "none" })] };
    }
    // Stufe 3: Wohnturm in der Mitte, ringsum mittelhohe Blöcke
    const centre = part.dx === 1 && part.dy === 1;
    const h = centre ? 1.15 + rnd(seed, 2) * 0.2 : 0.55 + rnd(seed, 2) * 0.2;
    const inset = centre ? 0.14 : 0.06;
    return { extra: "none", ground: "none", lot: LOT_PAVED, smokeFrom: -1,
             items: [box(inset, inset, 1 - inset, 1 - inset, h, wall, "#7f7c76", "parapet", "apartment",
                         { rooftop: centre ? "tank" : (rnd(seed, 3) < 0.5 ? "unit" : "none") })] };
}

function commercial(part: BuildingPart, seed: number): TileDesign {
    const wall = pick(OFFICE_WALLS[Math.max(0, Math.min(3, part.value))], seed, 1);
    const centre = part.dx === 1 && part.dy === 1;
    const jitter = 0.8 + rnd(seed, 2) * 0.4;
    const base = { extra: "none" as const, ground: "none" as const, lot: LOT_PAVED, smokeFrom: -1 };
    switch (part.level) {
        case 0:
            return { ...base, ground: "parking",
                     items: [box(0.18, 0.18, 0.82, 0.82, 0.16, pick(APARTMENT_WALLS, seed, 3), "#6f6a64", "flat", "shop",
                                 { accent: pick(AWNINGS, seed, 4), rooftop: "unit" })] };
        case 1:
            return { ...base,
                     items: [box(0.08, 0.08, 0.92, 0.92, 0.28 * jitter, pick(APARTMENT_WALLS, seed, 3), "#6f6a64",
                                 "parapet", "shop", { accent: pick(AWNINGS, seed, 4), rooftop: "unit" })] };
        case 2:
            return { ...base,
                     items: [box(0.07, 0.07, 0.93, 0.93, 0.48 * jitter, wall, "#5d6670", "parapet", "office",
                                 { rooftop: rnd(seed, 5) < 0.5 ? "unit" : "none" })] };
        case 3: {
            const inset = centre ? 0.12 : 0.06;
            return { ...base,
                     items: [box(inset, inset, 1 - inset, 1 - inset, (centre ? 1.25 : 0.72) * jitter, wall, "#55606b",
                                 "parapet", "glass", { rooftop: centre ? "antenna" : "unit" })] };
        }
        default: {
            const inset = centre ? 0.14 : 0.05;
            return { ...base,
                     items: [box(inset, inset, 1 - inset, 1 - inset, (centre ? 1.9 : 0.95) * jitter, wall, "#4d5863",
                                 "parapet", "glass",
                                 { rooftop: centre ? "helipad" : (rnd(seed, 5) < 0.5 ? "antenna" : "unit") })] };
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

/** Gestaltung einer Gebäudekachel. Leere Zonen (level −1) haben kein Gebäude. */
function designFor(part: BuildingPart, variant: number): TileDesign {
    const seed = seedOf(part, variant);
    const centre = part.dx === 1 && part.dy === 1;
    const none: TileDesign = { extra: "none", ground: "none", items: [], lot: LOT_PAVED, smokeFrom: -1 };

    switch (part.zone) {
        case "residential":
            return part.level < 0 ? { ...none, lot: LOT_GRASS } : residential(part, seed);
        case "commercial":
            return part.level < 0 ? none : commercial(part, seed);
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
            return { ...none, items: [box(0.06, 0.06, 0.94, 0.94, 0.27, "#c9483f", "#7a2a24", "parapet", "garage")] };
        case "police":
            return { ...none, items: [box(0.06, 0.06, 0.94, 0.94, 0.27, "#4a68b0", "#25386a", "parapet", "office")] };
        case "coal": {
            if (part.dx >= 2 && part.dy <= 1) {
                return { ...none, items: [{ height: 1.0, kind: "chimney", u: 0.5, v: 0.5 }], smokeFrom: 1.0 };
            }
            if (part.dy === 3) {
                return { ...none, items: [{ colour: "#2a2a2a", kind: "pile", u: 0.5, v: 0.55 }] };
            }
            return { ...none, items: [box(0.04, 0.04, 0.96, 0.96, 0.38, "#7d7d7b", "#4f4f4e", "sawtooth", "garage")] };
        }
        case "nuclear": {
            if (part.dx >= 1 && part.dx <= 2 && part.dy >= 1 && part.dy <= 2) {
                return { ...none, items: [{ colour: "#d9ded6", height: 0.6, kind: "tank", radius: 0.4, u: 0.5, v: 0.5 }] };
            }
            return { ...none, items: [box(0.06, 0.06, 0.94, 0.94, 0.2, "#d7dcd3", "#9aa596", "parapet", "none")] };
        }
        case "port":
            return { ...none, lot: "#8a8f94",
                     extra: part.dx === 3 && part.dy === 0 ? "crane" : (part.dx + part.dy) % 2 === 0 ? "containers" : "none",
                     items: part.dx === 0 && part.dy >= 2
                         ? [box(0.05, 0.05, 0.95, 0.95, 0.22, "#a4a9ae", "#6d7378", "gableU", "garage")] : [] };
        case "airport": {
            if (part.dx === 2 && part.dy === 0) { return { ...none, extra: "radar", lot: "#9a9a9a" }; }
            if (part.dx <= 1 && part.dy <= 1) {
                return { ...none, lot: "#9a9a9a",
                         items: [box(0.04, 0.04, 0.96, 0.96, 0.22, "#c3d2e2", "#8a96a3", "flat", "glass")] };
            }
            if (part.dx >= 4 && part.dy <= 1) {
                return { ...none, lot: "#9a9a9a",
                         items: [box(0.06, 0.06, 0.94, 0.94, 0.28, "#b0b5ba", "#8d9297", "gableV", "garage")] };
            }
            return { ...none, ground: part.dy >= 4 ? "runway" : "none", lot: "#9a9a9a" };
        }
        case "stadium": {
            if (part.dx >= 1 && part.dx <= 2 && part.dy >= 1 && part.dy <= 2) {
                return { ...none, ground: "field" };
            }
            return { ...none, items: [box(0.02, 0.02, 0.98, 0.98, 0.3, "#c9c9c9",
                                          part.level === 1 ? "#d98b8b" : "#9b9b9b", "flat", "none")] };
        }
        case "park":
            return { ...none, extra: "fountain", ground: "garden", lot: LOT_GRASS,
                     items: [{ conifer: false, kind: "tree", size: 0.8, u: 0.2, v: 0.25 },
                             { conifer: true, kind: "tree", size: 0.7, u: 0.8, v: 0.75 }] };
    }
    return none;
}

/** Höchster Punkt eines Kachelbilds über der Rautenspitze in Pixeln – für die Größe des Zwischenbilds. */
export function requiredHeadroom(part: BuildingPart, tileWidth: number, variant = 0): number {
    const design = designFor(part, variant);
    let height = 0.3;
    for (const item of design.items) {
        if (item.kind === "box") {
            const roof = item.roofStyle === "spire" ? 0.4 : item.rooftop === "antenna" ? 0.42 : 0.16;
            height = Math.max(height, item.height + roof);
        } else if (item.kind === "tank" || item.kind === "chimney") {
            height = Math.max(height, item.height + 0.15);
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
        if (item.kind === "box" || item.kind === "tank") { top = Math.max(top, item.height); }
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
    return {
        left: (t, z) => g.localToScreen(b.u0 + (b.u1 - b.u0) * t, b.v1, z),
        right: (t, z) => g.localToScreen(b.u1, b.v0 + (b.v1 - b.v0) * t, z),
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
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
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
    switch (b.rooftop) {
        case "unit":
            drawSmallBox(ctx, g, cu - 0.12, cv - 0.08, cu + 0.04, cv + 0.08, heightPx, w * 0.05, "#c4c4c0");
            break;
        case "tank":
            drawCylinder(ctx, g, cu, cv, 0.1, heightPx, w * 0.12, "#8e8a84");
            break;
        case "antenna": {
            const base = p(cu, cv, heightPx);
            const tip = p(cu, cv, heightPx + w * 0.35);
            ctx.strokeStyle = "#555";
            ctx.lineWidth = Math.max(1, w / 64);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
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
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
    const { u0, u1, v0, v1 } = b;
    groundShadow(ctx, g, u1, v0, v1, b.height * 0.5);
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
        case "pile": {
            const c = g.localToScreen(item.u, item.v, 0);
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, g.tileWidth * 0.3, g.tileWidth * 0.12, 0, Math.PI, 0);
            ctx.fillStyle = item.colour;
            ctx.fill();
            break;
        }
    }
}

/** Vordere Ecke eines Objekts (Reihenfolge innerhalb der Kachel: hinten zuerst). */
function depthOf(item: Item): number {
    switch (item.kind) {
        case "box": return item.u1 + item.v1;
        case "tank": return item.u + item.v + item.radius * 2;
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
            polygon(ctx, [p(0, 0.1), p(1, 0.1), p(1, 0.9), p(0, 0.9)], "#4a4a4a");
            polygon(ctx, [p(0.15, 0.47), p(0.55, 0.47), p(0.55, 0.53), p(0.15, 0.53)], "#f2f2f2");
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

/** Zeichnet Boden und Gebäudeteil einer Kachel. (0, 0) des Kontexts ist die obere Rautenspitze. */
export function drawBuildingPart(ctx: CanvasRenderingContext2D, g: LocalGeometry, part: BuildingPart,
                                 frame = -1, variant = 0): void {
    const design = designFor(part, variant);
    const p = (u: number, v: number) => g.localToScreen(u, v, 0);
    polygon(ctx, [p(0, 0), p(1, 0), p(1, 1), p(0, 1)], design.lot);
    drawGroundMarks(ctx, g, design, frame);

    const items = design.items.slice().sort((a, b) => depthOf(a) - depthOf(b));
    for (const item of items) {
        drawItem(ctx, g, item);
    }

    // Reaktor in Betrieb: über dem Kühlturm leuchtet es im Takt
    if (part.zone === "nuclear" && frame >= 0 && items.length > 0 && items[0].kind === "tank") {
        const glow = ["rgba(120, 220, 255, 0.35)", "rgba(120, 220, 255, 0.55)", "rgba(120, 220, 255, 0.75)",
                      "rgba(120, 220, 255, 0.55)"][frame % 4];
        const c = g.localToScreen(0.5, 0.5, 0.6 * g.tileWidth);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, g.tileWidth * 0.28, g.tileWidth * 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
    }
    drawExtra(ctx, g, design, frame);
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
