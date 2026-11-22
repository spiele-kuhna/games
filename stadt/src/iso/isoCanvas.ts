/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * IsoCanvas zeichnet die Karte isometrisch. Es hat dieselben öffentlichen Methoden wie GameCanvas
 * (gameCanvas.js), damit Game, Werkzeuge und Meldungen nicht wissen müssen, welche Ansicht aktiv ist.
 *
 * Unterschiede zur Draufsicht:
 *  - Kachelkoordinaten werden immer ABSOLUT geliefert (getTileOrigin() ist (0, 0)).
 *  - Es wird nicht jedes Bild gezeichnet, sondern nur, wenn sich etwas geändert hat (Karte, Ausschnitt,
 *    Zoom, Drehung oder Bau-Vorschau).
 *  - Die Bewegung der Karte erfolgt in Bildschirmrichtungen (nach oben, unten, links, rechts).
 *
 * Noch nicht enthalten (folgende Arbeitspakete): Gebäude mit Höhe (AP 3), Animationen und Fahrzeuge (AP 4),
 * Bedienung für Zoom, Drehen und Touch (AP 5), Geländehöhen (AP 8–10).
 */

import { Position } from "../position";
import {
    forEachTileBackToFront, GridSize, mapToView, Point, projectToScreen, Rotation, screenToView,
    screenToViewFraction, viewSize, ViewParams, ViewRect, visibleViewRect, viewToMap,
} from "./projection";
import { IsoTilePainter, PaintRequest } from "./isoPainter";
import { describeTile, EAST, NORTH, rotateMask, SOUTH, WEST } from "./tileKinds";

/** Was IsoCanvas von der Karte braucht (GameMap erfüllt das). */
interface MapLike {
    readonly width: number;
    readonly height: number;
    getTileValue(x: number, y: number): number;
}

/** Bau-Vorschau, wie sie Game.calculateMouseForPaint() liefert. */
interface MouseBox {
    x: number;
    y: number;
    width: number;
    height: number;
    colour: string;
}

/** Erlaubte Zoomstufen: Breite einer Raute in Pixeln. */
export const ZOOM_LEVELS = [32, 64, 128];

const BACKGROUND = "#1e2a24";

/** Schritte in der Ansicht für die vier Richtungen der Bitmasken. */
const VIEW_STEPS = [
    { dx: 0, dy: -1, mask: NORTH }, { dx: 1, dy: 0, mask: EAST },
    { dx: 0, dy: 1, mask: SOUTH }, { dx: -1, dy: 0, mask: WEST },
];

export class IsoCanvas {

    ready = false;
    canvasWidth = 0;
    canvasHeight = 0;

    private map: MapLike | null = null;
    private tileWidth = 64;
    private rotation: Rotation = 0;
    private originX = 0;
    private originY = 0;
    private pixelRatio = 1;
    private painter: IsoTilePainter | null = null;

    private dimensionsChanged = true;
    private lastSignature = "";
    private lastValues: number[] = [];

    constructor(private readonly canvas: HTMLCanvasElement) {
        window.addEventListener("resize", () => { this.dimensionsChanged = true; }, false);
    }

    init(map: MapLike): void {
        this.map = map;
        this.ready = true;
        // Nur ausmessen, nicht ins Canvas schreiben: Beim Start ist vielleicht noch die Draufsicht aktiv.
        this.measure();
        this.dimensionsChanged = true;
        this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));
    }

    /** Wird aufgerufen, wenn die Ansicht eingeschaltet wird: Das Canvas-Element teilen wir mit GameCanvas. */
    activate(): void {
        this.dimensionsChanged = true;
        this.lastSignature = "";
    }

    // ---- Ansicht einstellen ---------------------------------------------------------------------------------

    get zoom(): number {
        return this.tileWidth;
    }

    /** Zoom ändern; die Kachel in der Bildschirmmitte bleibt in der Mitte. */
    setZoom(tileWidth: number): void {
        if (ZOOM_LEVELS.indexOf(tileWidth) === -1 || tileWidth === this.tileWidth) {
            return;
        }
        const centre = this.centreTile();
        this.tileWidth = tileWidth;
        this.painter = null;
        this.centreOnView(centre.x, centre.y);
    }

    get currentRotation(): Rotation {
        return this.rotation;
    }

    /** Ansicht um 90° drehen (+1 im Uhrzeigersinn, −1 dagegen); die Mitte bleibt die Mitte. */
    rotate(direction: 1 | -1): void {
        const centre = this.centreMapPoint();
        this.rotation = (((this.rotation + direction) % 4 + 4) % 4) as Rotation;
        this.centreOnMapPoint(centre.x, centre.y);
    }

    centreOn(x: number | Point, y?: number): void {
        if (typeof x === "object") {
            y = x.y;
            x = x.x;
        }
        // Mitte der Kachel: + 0.5
        this.centreOnMapPoint(x + 0.5, (y as number) + 0.5);
    }

    // Bewegung in Bildschirmrichtungen; Schrittweite eine Viertel-Rautenhöhe pro Aufruf
    moveNorth(): void { this.scrollBy(0, this.scrollStep()); }
    moveSouth(): void { this.scrollBy(0, -this.scrollStep()); }
    moveWest(): void { this.scrollBy(this.scrollStep(), 0); }
    moveEast(): void { this.scrollBy(-this.scrollStep(), 0); }

    /** Karte um (dx, dy) Pixel verschieben, z. B. beim Ziehen mit der Maus (ab AP 5). */
    scrollBy(dx: number, dy: number): void {
        this.originX += dx;
        this.originY += dy;
        this.keepMapInView();
    }

    // ---- Umrechnung Bildschirm → Kachel (wie GameCanvas) ---------------------------------------------------

    getTileOrigin(): Point {
        return { x: 0, y: 0 };
    }

    getMaxTile(): Point {
        const map = this.requireMap();
        return { x: map.width - 1, y: map.height - 1 };
    }

    /** Liefert die Kachel unter einem Canvas-Punkt (CSS-Pixel) oder null außerhalb der Karte. */
    canvasCoordinateToTileCoordinate(x: number, y: number): Point | null {
        if (x < 0 || y < 0 || x >= this.canvasWidth || y >= this.canvasHeight) {
            return null;
        }
        const map = this.requireMap();
        const size = viewSize(map, this.rotation);
        const tile = screenToView(x, y, 0, this.viewParams());
        if (tile.x < 0 || tile.y < 0 || tile.x >= size.width || tile.y >= size.height) {
            return null;
        }
        return viewToMap(tile.x, tile.y, map, this.rotation);
    }

    /** In der Isometrie gleich canvasCoordinateToTileCoordinate(), weil getTileOrigin() (0, 0) ist. */
    canvasCoordinateToTileOffset(x: number, y: number): Point | null {
        return this.canvasCoordinateToTileCoordinate(x, y);
    }

    canvasCoordinateToPosition(x: number, y: number): Position | null {
        const tile = this.canvasCoordinateToTileCoordinate(x, y);
        return tile === null ? null : new Position(tile.x, tile.y);
    }

    /** Mitte einer Kachel auf dem Bildschirm. */
    tileToCanvasCoordinate(x: number | Point, y?: number): Point {
        if (typeof x === "object") {
            y = x.y;
            x = x.x;
        }
        const view = mapToView(x, y as number, this.requireMap(), this.rotation);
        return projectToScreen(view.x + 0.5, view.y + 0.5, 0, this.viewParams());
    }

    positionToCanvasCoordinate(p: Point): Point {
        return this.tileToCanvasCoordinate(p);
    }

    // ---- Kompatibilität mit GameCanvas ---------------------------------------------------------------------

    changeTileSet(): void {
        // Winterkacheln gibt es in der Isometrie (noch) nicht.
    }

    screenshotVisible(): string {
        return this.canvas.toDataURL();
    }

    /** Die ganze Karte als ein Bild wäre für Safari zu groß (docs/PLAN.md 3.5) – daher nur der Ausschnitt. */
    screenshotMap(): string {
        return this.screenshotVisible();
    }

    shoogle(): void {
        // Erdbeben-Wackeln gibt es auch in GameCanvas nicht.
    }

    disallowOffMap(): void {
        // keepMapInView() hält die Karte ohnehin sichtbar.
    }

    // ---- Zeichnen -------------------------------------------------------------------------------------------

    /**
     * Wird von Game in jedem Bild aufgerufen. Sprites zeichnen wir erst ab Arbeitspaket 4.
     */
    paint(mouse: MouseBox | null): void {
        if (!this.ready) {
            throw new Error("Not ready!");
        }
        if (this.dimensionsChanged) {
            this.updateDimensions();
        }

        const map = this.requireMap();
        const view = this.viewParams();
        const size = viewSize(map, this.rotation);
        const painter = this.requirePainter();
        const rect = visibleViewRect(this.canvasWidth, this.canvasHeight, 0, painter.headroom, view, size);

        // Hat sich seit dem letzten Bild etwas geändert? Wenn nicht, sparen wir uns das Zeichnen.
        const values = rect === null ? [] : this.collectValues(rect, map);
        const signature = [this.canvasWidth, this.canvasHeight, this.tileWidth, this.rotation, this.originX,
                           this.originY, mouse ? [mouse.x, mouse.y, mouse.width, mouse.colour].join(",") : "-",
                           rect ? [rect.minX, rect.maxX, rect.minY, rect.maxY].join(",") : "-"].join("|");
        if (signature === this.lastSignature && this.sameValues(values)) {
            return;
        }
        this.lastSignature = signature;
        this.lastValues = values;

        const ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        if (rect !== null) {
            this.drawTiles(ctx, rect, map, view, painter);
        }
        if (mouse) {
            this.drawMouseBox(ctx, mouse, map, view);
        }
    }

    private drawTiles(ctx: CanvasRenderingContext2D, rect: ViewRect, map: MapLike, view: ViewParams,
                      painter: IsoTilePainter): void {
        const halfWidth = this.tileWidth / 2;
        const tileHeight = this.tileWidth / 2;

        forEachTileBackToFront(rect, (vx, vy) => {
            const top = projectToScreen(vx, vy, 0, view);
            // Kacheln, die ganz außerhalb liegen, überspringen
            if (top.x + halfWidth < 0 || top.x - halfWidth > this.canvasWidth ||
                top.y + tileHeight < 0 || top.y - painter.headroom > this.canvasHeight) {
                return;
            }
            painter.drawTile(ctx, top.x, top.y, this.paintRequestFor(vx, vy, map));
        });
    }

    /** Alles, was der Zeichner für eine Ansichtskachel wissen muss. */
    private paintRequestFor(vx: number, vy: number, map: MapLike): PaintRequest {
        const tile = viewToMap(vx, vy, map, this.rotation);
        const raw = describeTile(map.getTileValue(tile.x, tile.y));

        // Anschlüsse aus Karten- in Ansichtsrichtungen drehen
        const look = {
            bridge: raw.bridge,
            cover: raw.cover,
            ground: raw.ground,
            rails: rotateMask(raw.rails, this.rotation),
            roads: rotateMask(raw.roads, this.rotation),
            wires: rotateMask(raw.wires, this.rotation),
            zone: raw.zone,
        };

        // Wasser: An welchen Seiten (Ansicht) grenzt Land? Dort zeichnen wir Strand.
        let landSides = 0;
        if (look.ground === "water") {
            const size = viewSize(map, this.rotation);
            for (const step of VIEW_STEPS) {
                const nx = vx + step.dx;
                const ny = vy + step.dy;
                if (nx < 0 || ny < 0 || nx >= size.width || ny >= size.height) {
                    continue;
                }
                const neighbour = viewToMap(nx, ny, map, this.rotation);
                if (describeTile(map.getTileValue(neighbour.x, neighbour.y)).ground === "land") {
                    landSides |= step.mask;
                }
            }
        }

        return { landSides, look, variant: this.variantFor(tile.x, tile.y) };
    }

    /** Feste „Zufallszahl“ 0–3 je Kartenkachel, damit Wiesen und Wasser lebendiger aussehen – auch nach Drehen. */
    private variantFor(x: number, y: number): number {
        return ((x * 73856093) ^ (y * 19349663)) & 3;
    }

    /*
     * Bau-Vorschau: der Umriss der Fläche, die das Werkzeug belegen würde. Größere Gebäude werden – wie in
     * buildingTool.js – von der Kachel links oberhalb der Mitte aus gebaut.
     */
    private drawMouseBox(ctx: CanvasRenderingContext2D, mouse: MouseBox, map: MapLike, view: ViewParams): void {
        if (mouse.width <= 0) {
            return;
        }
        const shift = mouse.width > 2 ? 1 : 0;
        const firstX = mouse.x - shift;
        const firstY = mouse.y - shift;
        const a = mapToView(firstX, firstY, map, this.rotation);
        const b = mapToView(firstX + mouse.width - 1, firstY + mouse.height - 1, map, this.rotation);
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);

        const corners = [projectToScreen(minX, minY, 0, view), projectToScreen(maxX + 1, minY, 0, view),
                         projectToScreen(maxX + 1, maxY + 1, 0, view), projectToScreen(minX, maxY + 1, 0, view)];
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = mouse.colour;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = mouse.colour;
        ctx.stroke();
    }

    // ---- Hilfsfunktionen ------------------------------------------------------------------------------------

    private collectValues(rect: ViewRect, map: MapLike): number[] {
        const values: number[] = [];
        for (let vy = rect.minY; vy <= rect.maxY; vy++) {
            for (let vx = rect.minX; vx <= rect.maxX; vx++) {
                const tile = viewToMap(vx, vy, map, this.rotation);
                values.push(map.getTileValue(tile.x, tile.y));
            }
        }
        return values;
    }

    private sameValues(values: number[]): boolean {
        if (values.length !== this.lastValues.length) {
            return false;
        }
        for (let i = 0; i < values.length; i++) {
            if (values[i] !== this.lastValues[i]) {
                return false;
            }
        }
        return true;
    }

    /** Größe des Containers ablesen (CSS-Pixel) und die Pixeldichte des Bildschirms. */
    private measure(): void {
        const parent = this.canvas.parentNode as HTMLElement;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.canvasWidth = parent.clientWidth;
        this.canvasHeight = parent.clientHeight;
    }

    /** Größe des Canvas an den Container anpassen; für Retina-Bildschirme mit mehr echten Pixeln. */
    private updateDimensions(): void {
        const centre = this.ready && this.canvasWidth > 0 ? this.centreMapPoint() : null;

        this.measure();
        this.canvas.width = Math.round(this.canvasWidth * this.pixelRatio);
        this.canvas.height = Math.round(this.canvasHeight * this.pixelRatio);
        this.canvas.style.width = this.canvasWidth + "px";
        this.canvas.style.height = this.canvasHeight + "px";

        if (this.painter !== null && this.painter.pixelRatio !== this.pixelRatio) {
            this.painter = null;
        }
        this.dimensionsChanged = false;
        this.lastSignature = "";
        if (centre !== null) {
            this.centreOnMapPoint(centre.x, centre.y);
        }
    }

    private viewParams(): ViewParams {
        return {
            heightStep: this.tileWidth / 8,
            originX: this.originX,
            originY: this.originY,
            tileWidth: this.tileWidth,
        };
    }

    private scrollStep(): number {
        return this.tileWidth / 8;
    }

    /** Punkt der Karte (mit Nachkommastellen) in der Bildschirmmitte. */
    private centreMapPoint(): Point {
        const map = this.requireMap();
        const view = screenToViewFraction(this.canvasWidth / 2, this.canvasHeight / 2, 0, this.viewParams());
        return this.viewPointToMapPoint(view.x, view.y, map);
    }

    private centreTile(): Point {
        return screenToViewFraction(this.canvasWidth / 2, this.canvasHeight / 2, 0, this.viewParams());
    }

    /*
     * Kartenpunkt → Ansichtspunkt mit Nachkommastellen. mapToView() rechnet mit Kacheln (ganzen Zahlen);
     * für Punkte zwischen den Kacheln drehen wir um die Kartenmitte. Die Ecke (0, 0) einer Kachel ist dabei
     * je nach Drehung eine andere Ecke – deshalb rechnen wir mit der Kachelgröße W bzw. H statt W − 1.
     */
    private mapPointToViewPoint(x: number, y: number, map: GridSize): Point {
        switch (this.rotation) {
            case 0: return { x, y };
            case 1: return { x: map.height - y, y: x };
            case 2: return { x: map.width - x, y: map.height - y };
            default: return { x: y, y: map.width - x };
        }
    }

    private viewPointToMapPoint(vx: number, vy: number, map: GridSize): Point {
        switch (this.rotation) {
            case 0: return { x: vx, y: vy };
            case 1: return { x: vy, y: map.height - vx };
            case 2: return { x: map.width - vx, y: map.height - vy };
            default: return { x: map.width - vy, y: vx };
        }
    }

    private centreOnMapPoint(x: number, y: number): void {
        const view = this.mapPointToViewPoint(x, y, this.requireMap());
        this.centreOnView(view.x, view.y);
    }

    /** Den Ansichtspunkt (vx, vy) in die Bildschirmmitte schieben. */
    private centreOnView(vx: number, vy: number): void {
        const halfWidth = this.tileWidth / 2;
        const halfHeight = this.tileWidth / 4;
        this.originX = this.canvasWidth / 2 - (vx - vy) * halfWidth;
        this.originY = this.canvasHeight / 2 - (vx + vy) * halfHeight;
        this.keepMapInView();
    }

    /** Die Bildschirmmitte darf die Karte nicht verlassen – sonst sieht man nur noch Hintergrund. */
    private keepMapInView(): void {
        const map = this.requireMap();
        const size = viewSize(map, this.rotation);
        const centre = screenToViewFraction(this.canvasWidth / 2, this.canvasHeight / 2, 0, this.viewParams());
        const clampedX = Math.min(Math.max(centre.x, 0), size.width);
        const clampedY = Math.min(Math.max(centre.y, 0), size.height);
        if (clampedX !== centre.x || clampedY !== centre.y) {
            const halfWidth = this.tileWidth / 2;
            const halfHeight = this.tileWidth / 4;
            this.originX = this.canvasWidth / 2 - (clampedX - clampedY) * halfWidth;
            this.originY = this.canvasHeight / 2 - (clampedX + clampedY) * halfHeight;
        }
    }

    private requireMap(): MapLike {
        if (this.map === null) {
            throw new Error("IsoCanvas used before init()");
        }
        return this.map;
    }

    private requirePainter(): IsoTilePainter {
        if (this.painter === null) {
            this.painter = new IsoTilePainter(this.tileWidth, this.pixelRatio);
        }
        return this.painter;
    }
}
