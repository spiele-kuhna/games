/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Gebäude mit Höhe – komplett selbst gezeichnet aus einfachen Formen.
 *
 * Jede Kachel eines Gebäudes zeichnet ihren eigenen „Turm“ (docs/PLAN.md, 3.3): einen Quader auf ihrer Fläche,
 * mit Dach oben und den zwei Seitenwänden, die man von vorn sieht. Liegen mehrere gleich hohe Quader
 * nebeneinander, verdecken die vorderen die inneren Wände der hinteren – es entsteht ein großes Gebäude.
 * Unterschiedlich hohe Quader ergeben z. B. ein Hochhaus mit niedrigerem Sockel.
 *
 *          Dach
 *         /\
 *        /  \
 *       |\  /|       linke Wand (zur Ansicht +vy) etwas dunkler,
 *       | \/ |       rechte Wand (zur Ansicht +vx) am dunkelsten –
 *        \ | /       so wirkt es, als käme das Licht von links oben.
 *         \|/
 */

import { BuildingPart } from "./buildingTable";

/** Was die Gebäude-Zeichnung vom IsoTilePainter braucht. */
export interface LocalGeometry {
    readonly tileWidth: number;
    /** Kachelkoordinaten (u, v) und Höhe über dem Boden in Pixeln → Pixel relativ zur oberen Rautenspitze */
    localToScreen(u: number, v: number, lift?: number): { x: number, y: number };
}

/** Beschreibung eines einzelnen Quaders auf einer Kachel. */
interface Column {
    /** Höhe in Rautenbreiten (1 = so hoch wie die Kachel breit ist) */
    height: number;
    /** Abstand zum Kachelrand (0 = ganze Kachel, 0.2 = kleines Haus mit Garten) */
    inset: number;
    wall: string;
    roof: string;
    roofStyle: "flat" | "hip" | "spire";
    windows: boolean;
}

/** Boden unter dem Gebäude und was zusätzlich obendrauf kommt. */
interface BuildingLook {
    lot: string;
    column: Column | null;
    extra: "none" | "chimney" | "cross" | "field" | "runway" | "containers" | "crane" | "radar" | "fountain";
}

// ---- Farben (selbst gewählt) --------------------------------------------------------------------------------

const RES_WALLS = ["#c9b59b", "#dcc8a4", "#ebdcc1", "#f4eee2"];
const RES_ROOFS = ["#8a5a44", "#a0523d", "#7b4a3a", "#56708f"];
const COM_WALLS = ["#a3adb8", "#93b2cf", "#82aad6", "#729ddd"];
const IND_WALLS = ["#b8ab8f", "#a7a7a2"];
const LOT_PAVED = "#a9a59b";
const LOT_GRASS = "#86b466";

/** Höhenstufen je Ausbaustufe, in Rautenbreiten */
const RES_HEIGHT = [0.16, 0.24, 0.45, 0.6];
const COM_HEIGHT = [0.16, 0.26, 0.45, 0.7, 0.9];
const IND_HEIGHT = [0.18, 0.24, 0.3, 0.36];

function isCentre(part: BuildingPart): boolean {
    return part.dx === 1 && part.dy === 1;
}

/** Wie sieht diese Kachel des Gebäudes aus? Leere Zonen (level −1) haben kein Gebäude. */
export function lookFor(part: BuildingPart): BuildingLook {
    const v = Math.max(0, Math.min(3, part.value));
    switch (part.zone) {
        case "residential": {
            if (part.level < 0) { return { column: null, extra: "none", lot: LOT_GRASS }; }
            const small = part.size === 1 || part.level <= 1;
            let height = RES_HEIGHT[part.level];
            if (part.level === 3 && isCentre(part)) { height = 1.2; }      // Wohnturm in der Mitte
            return {
                column: { height, inset: small ? (part.level === 0 ? 0.2 : 0.12) : 0.04, roof: RES_ROOFS[v],
                          roofStyle: small ? "hip" : "flat", wall: RES_WALLS[v], windows: !small },
                extra: "none",
                lot: small ? LOT_GRASS : LOT_PAVED,
            };
        }
        case "commercial": {
            if (part.level < 0) { return { column: null, extra: "none", lot: LOT_PAVED }; }
            let height = COM_HEIGHT[part.level];
            if (part.level >= 3 && isCentre(part)) { height *= 1.7; }     // Bürohochhaus in der Mitte
            return {
                column: { height, inset: part.level === 0 ? 0.12 : 0.04, roof: "#5d6b7a", roofStyle: "flat",
                          wall: COM_WALLS[v], windows: part.level >= 1 },
                extra: "none",
                lot: LOT_PAVED,
            };
        }
        case "industrial": {
            if (part.level < 0) { return { column: null, extra: "none", lot: LOT_PAVED }; }
            const chimney = part.level >= 1 && part.dx === 2 && part.dy === 0;
            return {
                column: { height: IND_HEIGHT[part.level], inset: 0.04, roof: "#6d6d6d", roofStyle: "flat",
                          wall: IND_WALLS[Math.min(1, part.value)], windows: false },
                extra: chimney ? "chimney" : "none",
                lot: LOT_PAVED,
            };
        }
        case "hospital":
            return { column: { height: 0.35, inset: 0.04, roof: "#d9d9d9", roofStyle: "flat", wall: "#f4f4f4",
                               windows: true },
                     extra: isCentre(part) ? "cross" : "none", lot: LOT_PAVED };
        case "church":
            return { column: isCentre(part)
                         ? { height: 0.85, inset: 0.3, roof: "#6d4436", roofStyle: "spire", wall: "#e6dcc8", windows: false }
                         : { height: 0.28, inset: 0.06, roof: "#7a4a3a", roofStyle: "hip", wall: "#e6dcc8", windows: false },
                     extra: "none", lot: LOT_GRASS };
        case "fireStation":
            return { column: { height: 0.26, inset: 0.05, roof: "#7a2a24", roofStyle: "flat", wall: "#c9483f",
                               windows: true },
                     extra: "none", lot: LOT_PAVED };
        case "police":
            return { column: { height: 0.26, inset: 0.05, roof: "#25386a", roofStyle: "flat", wall: "#4a68b0",
                               windows: true },
                     extra: "none", lot: LOT_PAVED };
        case "coal": {
            const chimney = part.dx >= 2 && part.dy <= 1;
            return { column: chimney ? null : { height: 0.35, inset: 0.03, roof: "#4f4f4f", roofStyle: "flat",
                                                wall: "#7d7d7d", windows: false },
                     extra: chimney ? "chimney" : "none", lot: LOT_PAVED };
        }
        case "nuclear": {
            const core = part.dx >= 1 && part.dx <= 2 && part.dy >= 1 && part.dy <= 2;
            return { column: { height: core ? 0.55 : 0.2, inset: core ? 0.02 : 0.05, roof: core ? "#c3ccbf" : "#9aa596",
                               roofStyle: "flat", wall: "#d7dcd3", windows: false },
                     extra: "none", lot: LOT_PAVED };
        }
        case "port":
            return { column: null, extra: part.dx === 3 && part.dy === 0 ? "crane"
                                          : (part.dx + part.dy) % 2 === 0 ? "containers" : "none",
                     lot: "#8a8f94" };
        case "airport": {
            if (part.dx === 2 && part.dy === 0) { return { column: null, extra: "radar", lot: "#9a9a9a" }; }
            const terminal = part.dx <= 1 && part.dy <= 1;
            return { column: terminal ? { height: 0.22, inset: 0.03, roof: "#8a96a3", roofStyle: "flat",
                                          wall: "#b9c7d6", windows: true } : null,
                     extra: part.dy >= 4 ? "runway" : "none", lot: "#9a9a9a" };
        }
        case "stadium": {
            const field = part.dx >= 1 && part.dx <= 2 && part.dy >= 1 && part.dy <= 2;
            return { column: field ? null : { height: 0.3, inset: 0.02, roof: part.level === 1 ? "#c7a0a0" : "#9b9b9b",
                                              roofStyle: "flat", wall: "#c9c9c9", windows: false },
                     extra: field ? "field" : "none", lot: LOT_PAVED };
        }
        case "park":
            return { column: null, extra: "fountain", lot: LOT_GRASS };
    }
    return { column: null, extra: "none", lot: LOT_PAVED };
}

/** Wie hoch ragt diese Kachel höchstens über die Rautenspitze hinaus (Pixel)? Für die Bildgröße. */
export function requiredHeadroom(part: BuildingPart, tileWidth: number): number {
    const look = lookFor(part);
    let height = look.column ? look.column.height + (look.column.roofStyle === "flat" ? 0 : 0.35) : 0;
    if (look.extra === "chimney") { height = Math.max(height, 1.05); }
    if (look.extra === "crane" || look.extra === "radar") { height = Math.max(height, 0.75); }
    return Math.ceil(height * tileWidth);
}

// ---- Zeichnen -----------------------------------------------------------------------------------------------

function shade(colour: string, factor: number): string {
    // #rrggbb um factor (0–1) abdunkeln
    const n = parseInt(colour.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return "rgb(" + r + ", " + g + ", " + b + ")";
}

function polygon(ctx: CanvasRenderingContext2D, points: Array<{ x: number, y: number }>, colour: string): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
}

/** Ein Quader von (lo, lo) bis (hi, hi) in Kachelkoordinaten, Höhe in Pixeln. */
function drawBox(ctx: CanvasRenderingContext2D, g: LocalGeometry, lo: number, hi: number, heightPx: number,
                 wall: string, roof: string): void {
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
    // rechte Wand (Rand u = hi) und linke Wand (Rand v = hi); die hinteren Wände sieht man nie
    polygon(ctx, [p(hi, lo, 0), p(hi, hi, 0), p(hi, hi, heightPx), p(hi, lo, heightPx)], shade(wall, 0.72));
    polygon(ctx, [p(lo, hi, 0), p(hi, hi, 0), p(hi, hi, heightPx), p(lo, hi, heightPx)], shade(wall, 0.88));
    polygon(ctx, [p(lo, lo, heightPx), p(hi, lo, heightPx), p(hi, hi, heightPx), p(lo, hi, heightPx)], roof);
}

function drawWindows(ctx: CanvasRenderingContext2D, g: LocalGeometry, lo: number, hi: number, heightPx: number): void {
    const floor = g.tileWidth * 0.11;
    const windowHeight = floor * 0.45;
    ctx.fillStyle = "rgba(225, 236, 245, 0.75)";
    for (let z = floor * 0.45; z + windowHeight < heightPx - floor * 0.2; z += floor) {
        for (const t of [0.2, 0.6]) {
            const a = lo + (hi - lo) * t;
            const b = a + (hi - lo) * 0.22;
            // rechte Wand
            polygon(ctx, [g.localToScreen(hi, a, z), g.localToScreen(hi, b, z),
                          g.localToScreen(hi, b, z + windowHeight), g.localToScreen(hi, a, z + windowHeight)],
                    "rgba(225, 236, 245, 0.55)");
            // linke Wand
            polygon(ctx, [g.localToScreen(a, hi, z), g.localToScreen(b, hi, z),
                          g.localToScreen(b, hi, z + windowHeight), g.localToScreen(a, hi, z + windowHeight)],
                    "rgba(225, 236, 245, 0.75)");
        }
    }
}

/** Walmdach (Pyramide) bzw. Kirchturmspitze auf einem Quader. */
function drawPointedRoof(ctx: CanvasRenderingContext2D, g: LocalGeometry, lo: number, hi: number, baseZ: number,
                         roofHeight: number, roof: string): void {
    const apex = g.localToScreen(0.5, 0.5, baseZ + roofHeight);
    const p = (u: number, v: number) => g.localToScreen(u, v, baseZ);
    // hintere Dachflächen zuerst, dann die vorderen
    polygon(ctx, [p(lo, lo), p(hi, lo), apex], roof);
    polygon(ctx, [p(lo, lo), p(lo, hi), apex], roof);
    polygon(ctx, [p(hi, lo), p(hi, hi), apex], shade(roof, 0.7));
    polygon(ctx, [p(lo, hi), p(hi, hi), apex], shade(roof, 0.85));
}

function drawChimney(ctx: CanvasRenderingContext2D, g: LocalGeometry): void {
    const heightPx = g.tileWidth * 0.95;
    drawBox(ctx, g, 0.38, 0.62, heightPx, "#8b8b8b", "#444444");
    // rot-weißer Ring oben
    const ring = g.tileWidth * 0.08;
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
    polygon(ctx, [p(0.62, 0.38, heightPx - ring), p(0.62, 0.62, heightPx - ring), p(0.62, 0.62, heightPx),
                  p(0.62, 0.38, heightPx)], "#b03a2e");
    polygon(ctx, [p(0.38, 0.62, heightPx - ring), p(0.62, 0.62, heightPx - ring), p(0.62, 0.62, heightPx),
                  p(0.38, 0.62, heightPx)], "#c9483f");
}

function drawExtra(ctx: CanvasRenderingContext2D, g: LocalGeometry, look: BuildingLook, roofZ: number,
                   frame: number): void {
    const p = (u: number, v: number, z = 0) => g.localToScreen(u, v, z);
    switch (look.extra) {
        case "chimney":
            drawChimney(ctx, g);
            break;
        case "cross": {
            // rotes Kreuz auf dem Dach des Krankenhauses
            polygon(ctx, [p(0.42, 0.2, roofZ), p(0.58, 0.2, roofZ), p(0.58, 0.8, roofZ), p(0.42, 0.8, roofZ)], "#d0312d");
            polygon(ctx, [p(0.2, 0.42, roofZ), p(0.8, 0.42, roofZ), p(0.8, 0.58, roofZ), p(0.2, 0.58, roofZ)], "#d0312d");
            break;
        }
        case "field":
            polygon(ctx, [p(0, 0), p(1, 0), p(1, 1), p(0, 1)], "#4caf50");
            polygon(ctx, [p(0.48, 0), p(0.52, 0), p(0.52, 1), p(0.48, 1)], "rgba(255, 255, 255, 0.7)");
            if (frame >= 0) {
                // Spiel läuft: Spieler als Punkte, die sich mit dem Animationsbild bewegen
                const players = [[0.2, 0.3, "#d0312d"], [0.35, 0.7, "#d0312d"], [0.7, 0.25, "#2c7fb8"],
                                 [0.8, 0.65, "#2c7fb8"], [0.55, 0.5, "#ffffff"]];
                players.forEach((pl, i) => {
                    const shift = 0.08 * Math.sin((frame + i * 2) * Math.PI / 4);
                    const c = p((pl[0] as number) + shift, (pl[1] as number) - shift);
                    ctx.beginPath();
                    ctx.arc(c.x, c.y - 2, Math.max(1.5, g.tileWidth / 40), 0, Math.PI * 2);
                    ctx.fillStyle = pl[2] as string;
                    ctx.fill();
                });
            }
            break;
        case "runway":
            polygon(ctx, [p(0, 0.1), p(1, 0.1), p(1, 0.9), p(0, 0.9)], "#4a4a4a");
            polygon(ctx, [p(0.15, 0.47), p(0.55, 0.47), p(0.55, 0.53), p(0.15, 0.53)], "#f2f2f2");
            break;
        case "containers": {
            const colours = ["#c0392b", "#2c7fb8", "#e1a33b"];
            let i = 0;
            for (const [u, v] of [[0.15, 0.15], [0.55, 0.2], [0.2, 0.55]]) {
                const h = g.tileWidth * 0.1;
                drawBoxAt(ctx, g, u, v, u + 0.3, v + 0.25, h, colours[i++ % colours.length]);
            }
            break;
        }
        case "crane": {
            ctx.strokeStyle = "#e1a33b";
            ctx.lineWidth = Math.max(1.5, g.tileWidth / 32);
            const base = p(0.5, 0.5);
            const top = p(0.5, 0.5, g.tileWidth * 0.7);
            const arm = p(0.5, -0.4, g.tileWidth * 0.7);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.lineTo(arm.x, arm.y);
            ctx.stroke();
            break;
        }
        case "radar": {
            ctx.strokeStyle = "#555";
            ctx.lineWidth = Math.max(1.5, g.tileWidth / 40);
            const base = p(0.5, 0.5);
            const top = p(0.5, 0.5, g.tileWidth * 0.5);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.stroke();
            ctx.beginPath();
            // Die Schüssel dreht sich mit dem Animationsbild (8 Bilder = eine Umdrehung)
            const turn = frame >= 0 ? Math.abs(Math.cos(frame * Math.PI / 4)) : 1;
            ctx.ellipse(top.x, top.y, g.tileWidth * 0.14 * Math.max(0.2, turn), g.tileWidth * 0.06, -0.3, 0,
                        Math.PI * 2);
            ctx.fillStyle = "#e8e8e8";
            ctx.fill();
            break;
        }
        case "fountain": {
            const c = p(0.5, 0.5);
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, g.tileWidth * 0.18, g.tileWidth * 0.09, 0, 0, Math.PI * 2);
            ctx.fillStyle = "#9fb3c8";
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, g.tileWidth * 0.12, g.tileWidth * 0.06, 0, 0, Math.PI * 2);
            ctx.fillStyle = "#4a90d9";
            ctx.fill();
            // Wasserstrahl, der mit dem Animationsbild höher und niedriger wird
            const jet = g.tileWidth * (0.12 + 0.05 * ((frame < 0 ? 0 : frame) % 4));
            ctx.strokeStyle = "rgba(200, 225, 255, 0.9)";
            ctx.lineWidth = Math.max(1.5, g.tileWidth / 40);
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x, c.y - jet);
            ctx.stroke();
            break;
        }
    }
}

/** Kleiner Quader mit beliebigem Rechteck (für Container). */
function drawBoxAt(ctx: CanvasRenderingContext2D, g: LocalGeometry, u0: number, v0: number, u1: number, v1: number,
                   heightPx: number, colour: string): void {
    const p = (u: number, v: number, z: number) => g.localToScreen(u, v, z);
    polygon(ctx, [p(u1, v0, 0), p(u1, v1, 0), p(u1, v1, heightPx), p(u1, v0, heightPx)], shade(colour, 0.72));
    polygon(ctx, [p(u0, v1, 0), p(u1, v1, 0), p(u1, v1, heightPx), p(u0, v1, heightPx)], shade(colour, 0.88));
    polygon(ctx, [p(u0, v0, heightPx), p(u1, v0, heightPx), p(u1, v1, heightPx), p(u0, v1, heightPx)], colour);
}

/** Zeichnet Boden und Gebäudeteil einer Kachel. (0, 0) des Kontexts ist die obere Rautenspitze. */
export function drawBuildingPart(ctx: CanvasRenderingContext2D, g: LocalGeometry, part: BuildingPart,
                                 frame = -1): void {
    const look = lookFor(part);
    polygon(ctx, [g.localToScreen(0, 0), g.localToScreen(1, 0), g.localToScreen(1, 1), g.localToScreen(0, 1)], look.lot);

    let roofZ = 0;
    const column = look.column;
    if (column !== null) {
        const lo = column.inset;
        const hi = 1 - column.inset;
        const heightPx = column.height * g.tileWidth;
        drawBox(ctx, g, lo, hi, heightPx, column.wall, column.roof);
        if (column.windows) {
            drawWindows(ctx, g, lo, hi, heightPx);
        }
        if (column.roofStyle === "hip") {
            drawPointedRoof(ctx, g, lo, hi, heightPx, g.tileWidth * 0.14, column.roof);
        } else if (column.roofStyle === "spire") {
            drawPointedRoof(ctx, g, lo, hi, heightPx, g.tileWidth * 0.35, column.roof);
        }
        roofZ = heightPx;
        // Reaktor in Betrieb: das Dach glüht im Takt
        if (part.zone === "nuclear" && frame >= 0) {
            const glow = ["rgba(120, 220, 255, 0.35)", "rgba(120, 220, 255, 0.55)", "rgba(120, 220, 255, 0.75)",
                          "rgba(120, 220, 255, 0.55)"][frame % 4];
            polygon(ctx, [g.localToScreen(lo, lo, heightPx), g.localToScreen(hi, lo, heightPx),
                          g.localToScreen(hi, hi, heightPx), g.localToScreen(lo, hi, heightPx)], glow);
        }
    }
    drawExtra(ctx, g, look, roofZ, frame);
}

/** Höhe (Pixel), aus der Rauch aufsteigt: oben aus dem Schornstein oder vom Dach. */
export function smokeBase(part: BuildingPart, tileWidth: number): number {
    const look = lookFor(part);
    if (look.extra === "chimney") {
        return tileWidth * 0.95;
    }
    return look.column ? look.column.height * tileWidth : 0;
}

/** Drei Rauchwolken, die mit dem Animationsbild nach oben wandern und größer werden. */
export function drawSmoke(ctx: CanvasRenderingContext2D, g: LocalGeometry, baseZ: number, frame: number): void {
    for (let i = 0; i < 3; i++) {
        const step = (frame + i * 2) % 6;           // 0 … 5: Wolke steigt, dann neue Wolke unten
        const z = baseZ + g.tileWidth * (0.06 + step * 0.06);
        const c = g.localToScreen(0.5 + step * 0.02, 0.5 - step * 0.03, z);
        ctx.beginPath();
        ctx.arc(c.x, c.y, g.tileWidth * (0.05 + step * 0.015), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(90, 90, 90, " + (0.55 - step * 0.08) + ")";
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
