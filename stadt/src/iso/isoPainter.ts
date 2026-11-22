/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Zeichnet einzelne isometrische Kacheln – komplett selbst, ohne Bilddateien (prozedural).
 *
 * Jede Kachelart wird nur EINMAL pro Zoomstufe auf ein kleines unsichtbares Canvas gemalt und danach nur noch
 * kopiert (Zwischenspeicher, engl. cache). Das ist viel schneller, als jede Kachel in jedem Bild neu zu malen.
 *
 * Gezeichnet wird in „Kachelkoordinaten“ (u, v) von 0 bis 1:
 *
 *            (0,0)           u läuft nach rechts unten (Ansicht +vx),
 *            /    \          v läuft nach links unten  (Ansicht +vy).
 *        (0,1)    (1,0)      Die Mitte der Kachel ist (0.5, 0.5).
 *            \    /
 *            (1,1)
 *
 * So kann man eine Straße einfach als Rechteck „u von 0.5 bis 1, v von 0.38 bis 0.62“ beschreiben; die
 * Funktion localToScreen() macht daraus die schräge Form auf dem Bildschirm.
 */

import { EAST, NORTH, SOUTH, TileLook, WEST, ZoneType } from "./tileKinds";

/** Farben – alle selbst gewählt. */
const COLOURS = {
    asphalt: "#5b5e63",
    asphaltEdge: "#44474b",
    ballast: "#8a8176",
    bridgeDeck: "#7b7f86",
    bridgeRail: "#d8d8d8",
    fireDark: "#5a2a1a",
    fireOrange: "#f08a24",
    fireYellow: "#ffd23f",
    flood: "#6f8fa8",
    grass: ["#7aa95c", "#76a458", "#7ead60", "#73a055"],
    gridLine: "rgba(0, 0, 0, 0.07)",
    laneMark: "rgba(255, 255, 255, 0.75)",
    pole: "#6b4f35",
    radioactive: "#c8d24a",
    rail: "#3d3d40",
    rubble: "#8c7b6b",
    rubbleStone: "#5e5248",
    sand: "#e0cc8f",
    sleeper: "#6b5a48",
    treeCrown: ["#2f6b2f", "#3a7a35", "#2c5f2a"],
    treeTrunk: "#5b4026",
    water: ["#3f7fbf", "#3b7aba", "#4383c3", "#3d7dbd"],
    wire: "#2a2a2a",
};

/** Platzhalter-Farben für Zonen bis Arbeitspaket 3 (dort kommen echte Gebäude). */
const ZONE_COLOURS: { [zone in ZoneType]: string } = {
    airport: "#a9adb3",
    church: "#d9cfb8",
    coal: "#6e6e6e",
    commercial: "#6f9fd8",
    fireStation: "#d9534f",
    hospital: "#eeeeee",
    industrial: "#e3c650",
    nuclear: "#bccbb8",
    park: "#5aa64a",
    police: "#3f5fa8",
    port: "#7fa3b8",
    residential: "#a7dc78",
    stadium: "#8e6bb8",
};

interface ScreenPoint {
    x: number;
    y: number;
}

/** Was zu einer Kachel gehört, die gezeichnet werden soll (Anschlüsse bereits in Ansichtsrichtungen). */
export interface PaintRequest {
    readonly look: TileLook;
    /** Bei Wasserkacheln: Richtungen (Ansicht), in denen Land angrenzt → dort Sandstrand. */
    readonly landSides: number;
    /** 0–3, damit nicht jede Wiese gleich aussieht. */
    readonly variant: number;
}

export class IsoTilePainter {

    private cache: { [key: string]: HTMLCanvasElement } = {};

    /**
     * @param tileWidth Breite einer Raute in CSS-Pixeln
     * @param pixelRatio devicePixelRatio, damit es auf Retina-Bildschirmen scharf bleibt
     */
    constructor(readonly tileWidth: number, readonly pixelRatio: number) {}

    get tileHeight(): number {
        return this.tileWidth / 2;
    }

    /** Platz über der oberen Rautenspitze für Bäume und Masten, die nach oben hinausragen. */
    get headroom(): number {
        return Math.ceil(this.tileWidth * 0.5);
    }

    /** Zeichnet eine Kachel, deren obere Rautenspitze bei (sx, sy) liegt. */
    drawTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, request: PaintRequest): void {
        const image = this.imageFor(request);
        ctx.drawImage(image, sx - this.tileWidth / 2, sy - this.headroom,
                      this.tileWidth, this.tileHeight + this.headroom);
    }

    /** Anzahl der zwischengespeicherten Kachelbilder (für Tests und Leistungsmessung). */
    get cachedImages(): number {
        return Object.keys(this.cache).length;
    }

    private imageFor(request: PaintRequest): HTMLCanvasElement {
        const look = request.look;
        const key = [look.ground, look.cover, look.zone, look.roads, look.rails, look.wires, look.bridge,
                     request.landSides, request.variant].join("|");
        let image = this.cache[key];
        if (!image) {
            image = this.renderImage(request);
            this.cache[key] = image;
        }
        return image;
    }

    private renderImage(request: PaintRequest): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(this.tileWidth * this.pixelRatio);
        canvas.height = Math.ceil((this.tileHeight + this.headroom) * this.pixelRatio);
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        // Ab hier zeichnen wir in CSS-Pixeln; (0, 0) ist die obere Spitze der Raute.
        ctx.scale(this.pixelRatio, this.pixelRatio);
        ctx.translate(this.tileWidth / 2, this.headroom);

        const look = request.look;
        this.drawGround(ctx, request);
        this.drawCover(ctx, look, request.variant);
        if (look.roads !== 0) { this.drawRoads(ctx, look.roads, look.bridge); }
        if (look.rails !== 0) { this.drawRails(ctx, look.rails); }
        if (look.wires !== 0) { this.drawWires(ctx, look.wires); }
        return canvas;
    }

    // ---- Grundformen ----------------------------------------------------------------------------------------

    /** Kachelkoordinaten (u, v) → Pixel relativ zur oberen Rautenspitze. */
    private localToScreen(u: number, v: number, lift = 0): ScreenPoint {
        return {
            x: (u - v) * this.tileWidth / 2,
            y: (u + v) * this.tileHeight / 2 - lift,
        };
    }

    /** Ein in (u, v) achsenparalleles Rechteck – auf dem Bildschirm ein schräges Viereck. */
    private fillLocalRect(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number,
                          colour: string): void {
        const corners = [this.localToScreen(u0, v0), this.localToScreen(u1, v0),
                         this.localToScreen(u1, v1), this.localToScreen(u0, v1)];
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
    }

    private fillDiamond(ctx: CanvasRenderingContext2D, colour: string): void {
        this.fillLocalRect(ctx, 0, 0, 1, 1, colour);
    }

    /*
     * Ein Streifen von der Kachelmitte zum Rand in Richtung direction, quer gemessen von low bis high.
     * Damit zeichnen wir Straßen, Schotterbetten und Schienen.
     */
    private fillArm(ctx: CanvasRenderingContext2D, direction: number, low: number, high: number,
                    colour: string): void {
        switch (direction) {
            case NORTH: this.fillLocalRect(ctx, low, 0, high, 0.5, colour); break;
            case SOUTH: this.fillLocalRect(ctx, low, 0.5, high, 1, colour); break;
            case EAST: this.fillLocalRect(ctx, 0.5, low, 1, high, colour); break;
            case WEST: this.fillLocalRect(ctx, 0, low, 0.5, high, colour); break;
        }
    }

    // ---- Untergrund -----------------------------------------------------------------------------------------

    private drawGround(ctx: CanvasRenderingContext2D, request: PaintRequest): void {
        if (request.look.ground === "water") {
            this.fillDiamond(ctx, COLOURS.water[request.variant]);
            // Sandstrand an den Seiten, an denen Land angrenzt
            const beach = 0.16;
            if (request.landSides & NORTH) { this.fillLocalRect(ctx, 0, 0, 1, beach, COLOURS.sand); }
            if (request.landSides & SOUTH) { this.fillLocalRect(ctx, 0, 1 - beach, 1, 1, COLOURS.sand); }
            if (request.landSides & EAST) { this.fillLocalRect(ctx, 1 - beach, 0, 1, 1, COLOURS.sand); }
            if (request.landSides & WEST) { this.fillLocalRect(ctx, 0, 0, beach, 1, COLOURS.sand); }
            return;
        }

        this.fillDiamond(ctx, COLOURS.grass[request.variant]);
        // Ganz feines Raster, damit man die Kacheln beim Bauen abzählen kann
        const top = this.localToScreen(0, 0);
        const right = this.localToScreen(1, 0);
        const left = this.localToScreen(0, 1);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(top.x, top.y);
        ctx.lineTo(right.x, right.y);
        ctx.strokeStyle = COLOURS.gridLine;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ---- Bewuchs, Trümmer, Zonen ----------------------------------------------------------------------------

    private drawCover(ctx: CanvasRenderingContext2D, look: TileLook, variant: number): void {
        switch (look.cover) {
            case "trees": this.drawTrees(ctx, 3, variant); break;
            case "denseTrees": this.drawTrees(ctx, 6, variant); break;
            case "rubble": this.drawRubble(ctx); break;
            case "flood": this.fillLocalRect(ctx, 0.05, 0.05, 0.95, 0.95, COLOURS.flood); break;
            case "radioactive": this.drawRadioactive(ctx); break;
            case "fire": this.drawFire(ctx); break;
            case "zone": this.drawZonePlaceholder(ctx, look.zone); break;
        }
    }

    private drawTrees(ctx: CanvasRenderingContext2D, count: number, variant: number): void {
        // Feste, leicht verschobene Plätze; die Variante dreht die Liste, damit Wälder nicht gleichförmig wirken.
        const spots = [[0.3, 0.3], [0.7, 0.35], [0.35, 0.7], [0.72, 0.72], [0.5, 0.15], [0.15, 0.55],
                       [0.85, 0.5], [0.55, 0.85]];
        const chosen: number[][] = [];
        for (let i = 0; i < count; i++) {
            chosen.push(spots[(i + variant * 3) % spots.length]);
        }
        // Hintere Bäume zuerst, damit vordere sie überdecken (kleine Summe u + v = weiter hinten).
        chosen.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));

        const crown = this.tileWidth * 0.11;
        for (let i = 0; i < chosen.length; i++) {
            const base = this.localToScreen(chosen[i][0], chosen[i][1]);
            ctx.fillStyle = COLOURS.treeTrunk;
            ctx.fillRect(base.x - crown * 0.15, base.y - crown * 1.2, crown * 0.3, crown * 1.2);
            ctx.beginPath();
            ctx.arc(base.x, base.y - crown * 1.6, crown, 0, Math.PI * 2);
            ctx.fillStyle = COLOURS.treeCrown[(i + variant) % COLOURS.treeCrown.length];
            ctx.fill();
        }
    }

    private drawRubble(ctx: CanvasRenderingContext2D): void {
        this.fillLocalRect(ctx, 0.1, 0.1, 0.9, 0.9, COLOURS.rubble);
        const stones = [[0.3, 0.4], [0.6, 0.3], [0.5, 0.65], [0.7, 0.7], [0.25, 0.7]];
        for (const stone of stones) {
            this.fillLocalRect(ctx, stone[0] - 0.06, stone[1] - 0.06, stone[0] + 0.06, stone[1] + 0.06,
                               COLOURS.rubbleStone);
        }
    }

    private drawRadioactive(ctx: CanvasRenderingContext2D): void {
        this.fillLocalRect(ctx, 0.08, 0.08, 0.92, 0.92, COLOURS.radioactive);
        const centre = this.localToScreen(0.5, 0.5);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, this.tileHeight * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = "#333";
        ctx.fill();
    }

    private drawFire(ctx: CanvasRenderingContext2D): void {
        this.fillLocalRect(ctx, 0.1, 0.1, 0.9, 0.9, COLOURS.fireDark);
        const flames = [[0.35, 0.4, 0.9], [0.65, 0.45, 1.2], [0.5, 0.7, 1]];
        for (const flame of flames) {
            const base = this.localToScreen(flame[0], flame[1]);
            const height = this.tileHeight * 0.6 * flame[2];
            const width = this.tileWidth * 0.09;
            ctx.beginPath();
            ctx.moveTo(base.x - width, base.y);
            ctx.lineTo(base.x, base.y - height);
            ctx.lineTo(base.x + width, base.y);
            ctx.closePath();
            ctx.fillStyle = COLOURS.fireOrange;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(base.x - width * 0.5, base.y);
            ctx.lineTo(base.x, base.y - height * 0.55);
            ctx.lineTo(base.x + width * 0.5, base.y);
            ctx.closePath();
            ctx.fillStyle = COLOURS.fireYellow;
            ctx.fill();
        }
    }

    /** Bis Arbeitspaket 3: Zone als farbige Fläche mit dunklerem Rand. */
    private drawZonePlaceholder(ctx: CanvasRenderingContext2D, zone: ZoneType | null): void {
        const colour = zone !== null ? ZONE_COLOURS[zone] : "#999";
        this.fillLocalRect(ctx, 0.04, 0.04, 0.96, 0.96, "rgba(0, 0, 0, 0.25)");
        this.fillLocalRect(ctx, 0.1, 0.1, 0.9, 0.9, colour);
    }

    // ---- Verkehrswege und Leitungen -------------------------------------------------------------------------

    private forEachDirection(mask: number, action: (direction: number) => void): void {
        for (const direction of [NORTH, EAST, SOUTH, WEST]) {
            if (mask & direction) {
                action(direction);
            }
        }
    }

    private drawRoads(ctx: CanvasRenderingContext2D, mask: number, bridge: boolean): void {
        const edge = bridge ? COLOURS.bridgeRail : COLOURS.asphaltEdge;
        const surface = bridge ? COLOURS.bridgeDeck : COLOURS.asphalt;

        // Erst der etwas breitere Rand, dann die Fahrbahn darauf
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.3, 0.7, edge));
        this.fillLocalRect(ctx, 0.3, 0.3, 0.7, 0.7, edge);
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.34, 0.66, surface));
        this.fillLocalRect(ctx, 0.34, 0.34, 0.66, 0.66, surface);

        // Mittellinie als kurze Striche, nicht auf Kreuzungen
        const isStraight = mask === (NORTH | SOUTH) || mask === (EAST | WEST);
        if (isStraight) {
            const alongU = mask === (EAST | WEST);
            for (const start of [0.08, 0.42, 0.76]) {
                if (alongU) {
                    this.fillLocalRect(ctx, start, 0.485, start + 0.16, 0.515, COLOURS.laneMark);
                } else {
                    this.fillLocalRect(ctx, 0.485, start, 0.515, start + 0.16, COLOURS.laneMark);
                }
            }
        }
    }

    private drawRails(ctx: CanvasRenderingContext2D, mask: number): void {
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.36, 0.64, COLOURS.ballast));
        this.fillLocalRect(ctx, 0.36, 0.36, 0.64, 0.64, COLOURS.ballast);

        // Schwellen quer zur Fahrtrichtung
        this.forEachDirection(mask, (d) => {
            for (const at of [0.08, 0.24, 0.4]) {
                const pos = d === NORTH || d === WEST ? at : 1 - at - 0.05;
                if (d === EAST || d === WEST) {
                    this.fillLocalRect(ctx, pos, 0.39, pos + 0.05, 0.61, COLOURS.sleeper);
                } else {
                    this.fillLocalRect(ctx, 0.39, pos, 0.61, pos + 0.05, COLOURS.sleeper);
                }
            }
        });

        // Zwei Schienen je Arm
        this.forEachDirection(mask, (d) => {
            this.fillArm(ctx, d, 0.43, 0.46, COLOURS.rail);
            this.fillArm(ctx, d, 0.54, 0.57, COLOURS.rail);
        });
        this.fillLocalRect(ctx, 0.43, 0.43, 0.57, 0.57, COLOURS.rail);
        this.fillLocalRect(ctx, 0.46, 0.46, 0.54, 0.54, COLOURS.ballast);
    }

    private drawWires(ctx: CanvasRenderingContext2D, mask: number): void {
        const poleHeight = this.tileHeight * 0.9;
        const base = this.localToScreen(0.5, 0.5);
        const top = this.localToScreen(0.5, 0.5, poleHeight);

        // Leitungen vom Mast zur Kachelkante, wo sie am nächsten Mast weitergehen
        const edgeMiddle: { [direction: number]: number[] } = {
            [NORTH]: [0.5, 0], [EAST]: [1, 0.5], [SOUTH]: [0.5, 1], [WEST]: [0, 0.5],
        };
        ctx.strokeStyle = COLOURS.wire;
        ctx.lineWidth = Math.max(1, this.tileWidth / 64);
        this.forEachDirection(mask, (d) => {
            const end = this.localToScreen(edgeMiddle[d][0], edgeMiddle[d][1], poleHeight);
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        });

        // Mast mit Querträger
        ctx.strokeStyle = COLOURS.pole;
        ctx.lineWidth = Math.max(1.5, this.tileWidth / 32);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.moveTo(top.x - this.tileWidth * 0.06, top.y + 2);
        ctx.lineTo(top.x + this.tileWidth * 0.06, top.y + 2);
        ctx.stroke();
    }
}
