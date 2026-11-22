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

import { BuildingPart } from "./buildingTable";
import { drawBuildingPart, drawLightning, drawSmoke, requiredHeadroom, smokeBase } from "./isoBuildings";
import { EAST, NORTH, SOUTH, TileLook, Traffic, WEST, ZoneType } from "./tileKinds";

/** Farben – alle selbst gewählt. */
const COLOURS = {
    asphalt: "#4f5257",
    sidewalk: "#c8c2b4",
    asphaltEdge: "#44474b",
    ballast: "#8a8176",
    bridgeDeck: "#7b7f86",
    bridgeRail: "#d8d8d8",
    fireDark: "#5a2a1a",
    fireOrange: "#f08a24",
    fireYellow: "#ffd23f",
    flood: "#6f8fa8",
    grass: ["#7cab5c", "#77a557", "#80af61", "#74a254"],
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

/** Farben leerer Zonen (bebaute Zonen zeichnet isoBuildings.ts). */
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
    /** Gebäudeteil auf dieser Kachel (aus buildingTable.ts) oder null */
    readonly building: BuildingPart | null;
    /** Verkehr auf der Straße (Stärke und Animationsbild) */
    readonly traffic: Traffic;
    /** Animationsbild (Feuer, Radar, Brunnen …) oder −1 */
    readonly frame: number;
    /** Rauch über dieser Kachel */
    readonly smoke: boolean;
    /** Blitz-Symbol: Zone ohne Strom */
    readonly lightning: boolean;
}

/** Ein zwischengespeichertes Kachelbild und wie weit es über die Rautenspitze hinausragt. */
interface CachedImage {
    canvas: HTMLCanvasElement;
    headroom: number;
}

export class IsoTilePainter {

    private cache: { [key: string]: CachedImage } = {};

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

    /** So hoch kann ein Gebäude höchstens über seine Kachel hinausragen (für den sichtbaren Ausschnitt). */
    get maxHeadroom(): number {
        return Math.ceil(this.tileWidth * 2.5);
    }

    /** Zeichnet eine Kachel, deren obere Rautenspitze bei (sx, sy) liegt. */
    drawTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, request: PaintRequest): void {
        const image = this.imageFor(request);
        ctx.drawImage(image.canvas, sx - this.tileWidth / 2, sy - image.headroom,
                      this.tileWidth, this.tileHeight + image.headroom);
    }

    /** Anzahl der zwischengespeicherten Kachelbilder (für Tests und Leistungsmessung). */
    get cachedImages(): number {
        return Object.keys(this.cache).length;
    }

    private imageFor(request: PaintRequest): CachedImage {
        const look = request.look;
        const b = request.building;
        const key = [look.ground, look.cover, look.zone, look.roads, look.rails, look.wires, look.bridge,
                     request.landSides, request.variant,
                     b ? [b.zone, b.size, b.dx, b.dy, b.level, b.value].join(",") : "-",
                     request.traffic.level, request.traffic.frame, request.frame, request.smoke,
                     request.lightning].join("|");
        let image = this.cache[key];
        if (!image) {
            image = this.renderImage(request);
            this.cache[key] = image;
        }
        return image;
    }

    private renderImage(request: PaintRequest): CachedImage {
        // Gebäude brauchen mehr Platz nach oben als flache Kacheln
        let headroom = request.building !== null
            ? Math.max(this.headroom, requiredHeadroom(request.building, this.tileWidth, request.variant) + 4)
            : this.headroom;
        if (request.smoke || request.lightning) {
            headroom += Math.ceil(this.tileWidth * 0.5);   // Platz für Rauchwolken bzw. den Blitz
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(this.tileWidth * this.pixelRatio);
        canvas.height = Math.ceil((this.tileHeight + headroom) * this.pixelRatio);
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        // Ab hier zeichnen wir in CSS-Pixeln; (0, 0) ist die obere Spitze der Raute.
        ctx.scale(this.pixelRatio, this.pixelRatio);
        ctx.translate(this.tileWidth / 2, headroom);

        const look = request.look;
        this.drawGround(ctx, request);
        if (look.cover === "zone") {
            this.drawZone(ctx, look.zone, request.building, request.frame, request.variant);
        } else {
            this.drawCover(ctx, look, request.variant, request.frame);
        }
        if (look.roads !== 0) {
            this.drawRoads(ctx, look.roads, look.bridge);
            if (request.traffic.level > 0) { this.drawCars(ctx, look.roads, request.traffic); }
        }
        if (look.rails !== 0) { this.drawRails(ctx, look.rails); }
        if (look.wires !== 0) { this.drawWires(ctx, look.wires); }

        const top = request.building !== null ? smokeBase(request.building, this.tileWidth, request.variant) : 0;
        if (request.smoke && request.frame >= 0) { drawSmoke(ctx, this, top, request.frame); }
        if (request.lightning) { drawLightning(ctx, this, top); }
        return { canvas, headroom };
    }

    /*
     * Zonen: leere Zonen als farbig umrandete Fläche, bebaute als Gebäude mit Höhe (isoBuildings.ts).
     * Brunnen im Park stehen nicht in der Gebäudetabelle, werden aber genauso gezeichnet.
     */
    private drawZone(ctx: CanvasRenderingContext2D, zone: ZoneType | null, building: BuildingPart | null,
                     frame: number, variant: number): void {
        if (zone === "park") {
            drawBuildingPart(ctx, this, { dx: 0, dy: 0, level: 0, size: 1, value: 0, zone: "park" }, frame, variant);
            return;
        }
        if (building === null || building.level < 0) {
            this.drawZonePlaceholder(ctx, zone);
            return;
        }
        drawBuildingPart(ctx, this, building, frame, variant);
    }

    /*
     * Autos auf der Straße: bei wenig Verkehr eins, bei viel Verkehr zwei je Straßenarm. Mit jedem
     * Animationsbild rücken sie ein Stück weiter – so sieht es aus, als würden sie fahren.
     */
    private drawCars(ctx: CanvasRenderingContext2D, mask: number, traffic: Traffic): void {
        const colours = ["#d0312d", "#f2f2f2", "#2c7fb8", "#e1a33b", "#3a3a3a"];
        const perArm = traffic.level;
        let colour = 0;
        this.forEachDirection(mask, (direction) => {
            for (let i = 0; i < perArm; i++) {
                // Position entlang des Arms: 0 = Kachelrand, 0.5 = Mitte
                const along = ((traffic.frame * 0.12 + i * 0.25 + direction * 0.07) % 0.42) + 0.04;
                const lane = i % 2 === 0 ? 0.42 : 0.54;   // rechte bzw. linke Fahrspur
                const length = 0.12;
                const width = 0.07;
                let u0: number;
                let v0: number;
                let u1: number;
                let v1: number;
                if (direction === EAST || direction === WEST) {
                    const start = direction === WEST ? along : 1 - along - length;
                    u0 = start; u1 = start + length; v0 = lane; v1 = lane + width;
                } else {
                    const start = direction === NORTH ? along : 1 - along - length;
                    v0 = start; v1 = start + length; u0 = lane; u1 = lane + width;
                }
                this.fillLocalBox(ctx, u0, v0, u1, v1, this.tileWidth * 0.035, colours[colour++ % colours.length]);
            }
        });
    }

    /** Kleiner Quader (Auto) in Kachelkoordinaten. */
    private fillLocalBox(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number,
                         height: number, colour: string): void {
        const p = (u: number, v: number, z: number) => this.localToScreen(u, v, z);
        const face = (points: ScreenPoint[], fill: string) => {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) { ctx.lineTo(points[i].x, points[i].y); }
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
        };
        face([p(u1, v0, 0), p(u1, v1, 0), p(u1, v1, height), p(u1, v0, height)], "rgba(0, 0, 0, 0.35)");
        face([p(u0, v1, 0), p(u1, v1, 0), p(u1, v1, height), p(u0, v1, height)], "rgba(0, 0, 0, 0.2)");
        face([p(u0, v0, height), p(u1, v0, height), p(u1, v1, height), p(u0, v1, height)], colour);
    }

    // ---- Grundformen ----------------------------------------------------------------------------------------

    /** Kachelkoordinaten (u, v) → Pixel relativ zur oberen Rautenspitze. */
    localToScreen(u: number, v: number, lift = 0): ScreenPoint {
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
            this.drawWaves(ctx, request.variant);
            // Sandstrand an den Seiten, an denen Land angrenzt
            const beach = 0.16;
            if (request.landSides & NORTH) { this.fillLocalRect(ctx, 0, 0, 1, beach, COLOURS.sand); }
            if (request.landSides & SOUTH) { this.fillLocalRect(ctx, 0, 1 - beach, 1, 1, COLOURS.sand); }
            if (request.landSides & EAST) { this.fillLocalRect(ctx, 1 - beach, 0, 1, 1, COLOURS.sand); }
            if (request.landSides & WEST) { this.fillLocalRect(ctx, 0, 0, beach, 1, COLOURS.sand); }
            return;
        }

        this.fillDiamond(ctx, COLOURS.grass[request.variant]);
        this.drawGrassTexture(ctx, request.variant);
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

    /** Feste „Zufallszahl“ 0–1 für Kachelvariante und Nummer – damit Muster nicht überall gleich aussehen. */
    private noise(variant: number, k: number): number {
        const x = Math.sin(variant * 91.7 + k * 47.3) * 24634.6345;
        return x - Math.floor(x);
    }

    /** Wiese: helle und dunkle Grasbüschel als kleine Striche. */
    private drawGrassTexture(ctx: CanvasRenderingContext2D, variant: number): void {
        for (let i = 0; i < 14; i++) {
            const u = 0.06 + this.noise(variant, i) * 0.88;
            const v = 0.06 + this.noise(variant, i + 50) * 0.88;
            const p = this.localToScreen(u, v);
            ctx.fillStyle = i % 3 === 0 ? "rgba(255, 255, 220, 0.16)" : "rgba(20, 60, 10, 0.16)";
            ctx.fillRect(p.x, p.y - 1.5, Math.max(1, this.tileWidth / 48), Math.max(1.5, this.tileWidth / 30));
        }
    }

    /** Wasser: ein paar helle Wellenstriche. */
    private drawWaves(ctx: CanvasRenderingContext2D, variant: number): void {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = Math.max(1, this.tileWidth / 64);
        for (let i = 0; i < 3; i++) {
            const u = 0.2 + this.noise(variant, i) * 0.55;
            const v = 0.2 + this.noise(variant, i + 9) * 0.55;
            const a = this.localToScreen(u, v);
            const len = this.tileWidth * 0.08;
            ctx.beginPath();
            ctx.moveTo(a.x - len, a.y);
            ctx.quadraticCurveTo(a.x - len / 2, a.y - len * 0.3, a.x, a.y);
            ctx.quadraticCurveTo(a.x + len / 2, a.y + len * 0.3, a.x + len, a.y);
            ctx.stroke();
        }
    }

    // ---- Bewuchs, Trümmer, Zonen ----------------------------------------------------------------------------

    private drawCover(ctx: CanvasRenderingContext2D, look: TileLook, variant: number, frame: number): void {
        switch (look.cover) {
            case "trees": this.drawTrees(ctx, 3, variant); break;
            case "denseTrees": this.drawTrees(ctx, 6, variant); break;
            case "rubble": this.drawRubble(ctx); break;
            case "flood": this.fillLocalRect(ctx, 0.05, 0.05, 0.95, 0.95, COLOURS.flood); break;
            case "radioactive": this.drawRadioactive(ctx); break;
            case "fire": this.drawFire(ctx, frame); break;
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

        for (let i = 0; i < chosen.length; i++) {
            const base = this.localToScreen(chosen[i][0], chosen[i][1]);
            const size = this.tileWidth * (0.09 + this.noise(variant, i + 20) * 0.04);
            const conifer = this.noise(variant, i + 30) < 0.35;
            // Schatten nach rechts
            ctx.beginPath();
            ctx.ellipse(base.x + size * 0.6, base.y + size * 0.1, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(20, 40, 10, 0.25)";
            ctx.fill();
            ctx.fillStyle = COLOURS.treeTrunk;
            ctx.fillRect(base.x - size * 0.12, base.y - size * 1.1, size * 0.24, size * 1.1);
            if (conifer) {
                ctx.beginPath();
                ctx.moveTo(base.x - size * 0.8, base.y - size * 0.6);
                ctx.lineTo(base.x, base.y - size * 3.1);
                ctx.lineTo(base.x + size * 0.8, base.y - size * 0.6);
                ctx.closePath();
                ctx.fillStyle = "#2d5e34";
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(base.x, base.y - size * 3.1);
                ctx.lineTo(base.x + size * 0.8, base.y - size * 0.6);
                ctx.lineTo(base.x + size * 0.1, base.y - size * 0.6);
                ctx.closePath();
                ctx.fillStyle = "#224a29";
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(base.x, base.y - size * 1.7, size, 0, Math.PI * 2);
                ctx.fillStyle = COLOURS.treeCrown[(i + variant) % COLOURS.treeCrown.length];
                ctx.fill();
                ctx.beginPath();
                ctx.arc(base.x - size * 0.3, base.y - size * 2, size * 0.55, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(160, 210, 120, 0.45)";
                ctx.fill();
            }
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

    private drawFire(ctx: CanvasRenderingContext2D, frame: number): void {
        // Flammenhöhen ändern sich mit dem Animationsbild – das Feuer flackert
        const flicker = [1, 0.75, 1.15, 0.85, 1.05, 0.7, 1.2, 0.9];
        const f = frame < 0 ? 0 : frame;
        this.fillLocalRect(ctx, 0.1, 0.1, 0.9, 0.9, COLOURS.fireDark);
        const flames = [[0.35, 0.4, 0.9], [0.65, 0.45, 1.2], [0.5, 0.7, 1]];
        for (const flame of flames) {
            const base = this.localToScreen(flame[0], flame[1]);
            const height = this.tileHeight * 0.6 * flame[2] * flicker[(f + flames.indexOf(flame) * 3) % 8];
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

    /** Leere Zone: farbige Fläche mit dunklerem Rand – hier darf gebaut werden, es steht aber noch nichts. */
    private drawZonePlaceholder(ctx: CanvasRenderingContext2D, zone: ZoneType | null): void {
        const colour = zone !== null ? ZONE_COLOURS[zone] : "#999";
        ctx.globalAlpha = 0.45;
        this.fillLocalRect(ctx, 0.03, 0.03, 0.97, 0.97, colour);
        ctx.globalAlpha = 1;
        // Rand wie abgesteckt: kurze Striche in der Zonenfarbe
        for (let i = 0; i < 6; i++) {
            const a = 0.05 + i * 0.16;
            this.fillLocalRect(ctx, a, 0.03, a + 0.08, 0.07, colour);
            this.fillLocalRect(ctx, 0.03, a, 0.07, a + 0.08, colour);
        }
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
        const edge = bridge ? COLOURS.bridgeRail : COLOURS.sidewalk;
        const surface = bridge ? COLOURS.bridgeDeck : COLOURS.asphalt;

        // Erst der Gehweg (bzw. das Brückengeländer), dann die Fahrbahn darauf
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.24, 0.76, edge));
        this.fillLocalRect(ctx, 0.24, 0.24, 0.76, 0.76, edge);
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.24, 0.255, "rgba(0, 0, 0, 0.18)"));
        this.forEachDirection(mask, (d) => this.fillArm(ctx, d, 0.32, 0.68, surface));
        this.fillLocalRect(ctx, 0.32, 0.32, 0.68, 0.68, surface);

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
