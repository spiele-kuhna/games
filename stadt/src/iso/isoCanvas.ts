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
 * Noch nicht enthalten (folgende Arbeitspakete): Bedienung für Zoom, Drehen und Touch (AP 5),
 * Geländehöhen (AP 8–10).
 */

import { AnimationManager } from "../animationManager";
import { Position } from "../position";
import {
    forEachTileBackToFront, GridSize, mapToView, Point, projectToScreen, Rotation, screenToView,
    screenToViewFraction, viewSize, ViewParams, ViewRect, visibleViewRect, viewToMap,
} from "./projection";
import { buildingPartOf } from "./buildingTable";
import { IsoTilePainter, PaintRequest, WaterLook } from "./isoPainter";
import { blinkOn } from "../water/waterIcons";
import { drawSprite, SpriteLike, spriteCentre } from "./isoSprites";
import { nextZoomLevel, zoomOrigin } from "../ui/gestures";
import {
    animationFrameOf, describeTile, EAST, isSmoke, LIGHTNING_BOLT, NORTH, rotateMask, SOUTH, trafficOf, WEST,
} from "./tileKinds";

/** Dorfplaner: Was IsoCanvas vom Wassernetz braucht (WaterManager erfüllt das). */
interface WaterSourceLike {
    readonly revision: number;
    hasPipe(x: number, y: number): boolean;
    isFlowing(x: number, y: number): boolean;
    isWatered(x: number, y: number): boolean;
    kindAt(x: number, y: number): number;
}

/** Sprite-Art Schiff (spriteConstants.ts) */
const SHIP_SPRITE = 4;

/** Ansteigende Brücken: größte Höhe (Rautenbreiten) und Länge der Rampe (Kacheln) */
const BRIDGE_HEIGHT = 0.32;
const BRIDGE_RAMP = 1.5;

/** Eine Umdrehung des Radars am Flughafen in Millisekunden */
const RADAR_TURN_MS = 4000;

/** Was IsoCanvas von der Karte braucht (GameMap erfüllt das). */
interface MapLike {
    readonly width: number;
    readonly height: number;
    getTileValue(x: number, y: number): number;
    /** Kachelwerte MIT Merkmal-Bits eines Rechtecks, zeilenweise (gameMap.js) */
    getTileValuesForPainting(x: number, y: number, w: number, h: number, result?: number[]): number[];
}

/** Der AnimationManager (animationManager.js) ersetzt Kachelwerte durch das aktuelle Animationsbild. */
interface AnimationLike {
    getTiles(values: number[], offsetX: number, offsetY: number, width: number, height: number,
             isPaused: boolean): void;
}

/** Woher die Sprites kommen (spriteManager.js). */
interface SpriteSource {
    getSpriteList(): SpriteLike[];
}

/** Verkehrsdichte der Simulation (BlockMap trafficDensityMap, Werte 0–240), wird nur gelesen. */
interface TrafficSource {
    worldGet(x: number, y: number): number;
}

/*
 * Ab dieser Verkehrsdichte zeigt die 3D-Ansicht Autos. Die Simulation selbst markiert eine Straße erst ab 64
 * als „mit Verkehr“ (road.js); so früh sieht man in einer jungen Stadt sonst kaum ein Auto.
 */
const LIGHT_TRAFFIC_FROM = 12;

/** Alle so viele Millisekunden rücken die Autos ein kleines Stück weiter (8 Schritte je Durchlauf). */
const CAR_STEP_MS = 220;

/** Bau-Vorschau, wie sie Game.calculateMouseForPaint() liefert. */
interface MouseBox {
    x: number;
    y: number;
    width: number;
    height: number;
    colour: string;
}

/** Erlaubte Zoomstufen: Breite einer Raute in Pixeln. */
export const ZOOM_LEVELS = [32, 48, 64, 96, 128];

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

    // Animationen: eigener AnimationManager wie in GameCanvas; animierte Werte des Karten-Rechtecks
    private animation: AnimationLike | null = null;
    private sprites: SpriteSource | null = null;
    private water: WaterSourceLike | null = null;
    private underground = false;
    private trafficSource: TrafficSource | null = null;
    /** Takt für Autos auf Straßen mit wenig Verkehr (viermal pro Sekunde ein Schritt) */
    private trafficTick = 0;
    private animated: number[] = [];
    private animatedX = 0;
    private animatedY = 0;
    private animatedWidth = 0;

    constructor(private readonly canvas: HTMLCanvasElement) {
        window.addEventListener("resize", () => { this.dimensionsChanged = true; }, false);
    }

    init(map: MapLike, sprites?: SpriteSource, traffic?: TrafficSource): void {
        this.map = map;
        this.sprites = sprites || null;
        this.trafficSource = traffic || null;
        // AnimationManager ist eine JavaScript-Konstruktorfunktion; TypeScript kennt ihren Typ nicht genau.
        this.animation = new (AnimationManager as any)(map) as AnimationLike;
        this.ready = true;
        // Nur ausmessen, nicht ins Canvas schreiben: Beim Start ist vielleicht noch die Draufsicht aktiv.
        this.measure();
        this.dimensionsChanged = true;
        this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));
    }

    /** Dorfplaner: Wassernetz für Rohre und Tropfen */
    setWaterSource(water: WaterSourceLike): void {
        this.water = water;
    }

    /** Dorfplaner: Untergrundansicht ein- oder ausschalten */
    setUnderground(underground: boolean): void {
        this.underground = underground;
        this.lastSignature = "";
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

    /**
     * Eine Zoomstufe näher (+1) oder weiter weg (−1); der Kartenpunkt unter (x, y) bleibt dabei an seiner
     * Stelle – so zoomt man „auf den Mauszeiger zu“ bzw. zwischen die Finger.
     */
    zoomAt(step: number, x: number, y: number): void {
        const newWidth = nextZoomLevel(ZOOM_LEVELS, this.tileWidth, step);
        if (newWidth === this.tileWidth) {
            return;
        }
        const origin = zoomOrigin(this.originX, this.originY, x, y, this.tileWidth, newWidth);
        this.tileWidth = newWidth;
        this.painter = null;
        this.originX = origin.x;
        this.originY = origin.y;
        this.keepMapInView();
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
     * Wird von Game in jedem Bild aufgerufen. Die Sprites, die Game mitgibt, sind nach Draufsicht-Pixeln
     * ausgewählt; IsoCanvas holt sich deshalb selbst alle aktiven Sprites vom SpriteManager.
     */
    paint(mouse: MouseBox | null, _sprites?: unknown, isPaused?: boolean): void {
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
        const rect = visibleViewRect(this.canvasWidth, this.canvasHeight, 0, painter.maxHeadroom, view, size);

        // Hat sich seit dem letzten Bild etwas geändert? Wenn nicht, sparen wir uns das Zeichnen.
        // Kachelwerte mit Animationen (Verkehr, Rauch, Blinken …) – sie ändern sich etwa alle 50 ms
        const values = rect === null ? [] : this.animateRect(rect, map, isPaused === true);
        const sprites = this.activeSprites();
        // Eigener, ruhiger Takt für fahrende Autos (unabhängig vom schnellen Animationstakt der Simulation)
        this.trafficTick = isPaused === true ? this.trafficTick : Math.floor(Date.now() / CAR_STEP_MS);
        const waterState = this.water ? [this.underground ? 1 : 0, this.water.revision, blinkOn(Date.now()) ? 1 : 0].join(",")
                                      : "-";
        const signature = [waterState, this.trafficTick, this.canvasWidth, this.canvasHeight, this.tileWidth, this.rotation, this.originX,
                           this.originY, mouse ? [mouse.x, mouse.y, mouse.width, mouse.colour].join(",") : "-",
                           rect ? [rect.minX, rect.maxX, rect.minY, rect.maxY].join(",") : "-",
                           sprites.map((s) => [s.type, s.frame, s.x, s.y].join(",")).join(";")].join("|");
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
        if (!this.underground) {
            // Schiffe zuerst, darüber die Brücken in ihrer Nähe (das Schiff fährt darunter durch), dann der Rest
            const ships = sprites.filter((s) => s.type === SHIP_SPRITE);
            this.drawSprites(ctx, ships, map, view);
            this.drawBridgeDecksOver(ctx, ships, map, view);
            this.drawSprites(ctx, sprites.filter((s) => s.type !== SHIP_SPRITE), map, view);
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
                top.y + tileHeight < 0 || top.y - painter.maxHeadroom > this.canvasHeight) {
                return;
            }
            // Auf ganze Bildschirmpixel runden: Nach Zoom oder Verschieben liegt der Ursprung oft zwischen zwei
            // Pixeln, dann würde der Browser die Kachelbilder weichzeichnen (unscharfe Grafik).
            const px = Math.round(top.x * this.pixelRatio) / this.pixelRatio;
            const py = Math.round(top.y * this.pixelRatio) / this.pixelRatio;
            painter.drawTile(ctx, px, py, this.paintRequestFor(vx, vy, map));
        });
    }

    /** Alles, was der Zeichner für eine Ansichtskachel wissen muss. */
    private paintRequestFor(vx: number, vy: number, map: MapLike): PaintRequest {
        const tile = viewToMap(vx, vy, map, this.rotation);
        const value = map.getTileValue(tile.x, tile.y);
        // Animationsbild an dieser Stelle; beim Blinken stromloser Zonen ersetzt der Blitz die Mittelkachel
        const animatedValue = this.animatedValueAt(tile.x, tile.y, value);
        const lightning = animatedValue === LIGHTNING_BOLT;
        const shown = lightning ? value : animatedValue;
        const raw = describeTile(shown);

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

        const building = raw.cover === "zone" ? buildingPartOf(value) : null;
        // Radar am Flughafen: eigene, ruhige Drehung (eine Umdrehung in RADAR_TURN_MS)
        const radar = building !== null && building.zone === "airport" && building.dx === 2 && building.dy === 0;
        // Gebäude: zur Kachel-Würfelzahl kommt eine für die ganze Zone (von ihrer Ecke aus berechnet)
        const variant = building !== null
            ? this.variantFor(tile.x, tile.y) + 4 * this.zoneVariantFor(tile.x - building.dx, tile.y - building.dy)
            : this.variantFor(tile.x, tile.y);
        return {
            building,
            frame: radar ? Math.floor(Date.now() / (RADAR_TURN_MS / 8)) % 8 : animationFrameOf(shown),
            landSides,
            lightning,
            look,
            smoke: isSmoke(shown),
            rotation: this.rotation,
            traffic: this.trafficFor(shown, raw.roads !== 0, tile.x, tile.y),
            variant,
            water: this.waterLookFor(tile.x, tile.y, building),
            bridgeHeights: raw.bridge && raw.roads !== 0 ? this.bridgeHeightsFor(tile.x, tile.y, raw.roads, map) : null,
        };
    }

    /** Verkehr: von der Simulation markiert, sonst aus der Verkehrsdichte (nur Anzeige). */
    private trafficFor(value: number, isRoad: boolean, x: number, y: number) {
        const marked = trafficOf(value);
        const frame = this.trafficTick % 8;
        if (marked.level > 0) {
            return { frame, level: marked.level };
        }
        if (!isRoad || this.trafficSource === null) {
            return marked;
        }
        const density = this.trafficSource.worldGet(x, y);
        return density >= LIGHT_TRAFFIC_FROM ? { frame, level: 1 } : marked;
    }

    /*
     * Animationen für den sichtbaren Bereich berechnen. Ein gedrehtes, achsenparalleles Rechteck ist auf der Karte
     * wieder achsenparallel – deshalb können wir dem AnimationManager einfach das passende Karten-Rechteck geben.
     * Er schaltet Animationsbilder weiter, lässt stromlose Zonen blinken und beendet abgelaufene Explosionen.
     */
    private animateRect(rect: ViewRect, map: MapLike, isPaused: boolean): number[] {
        const a = viewToMap(rect.minX, rect.minY, map, this.rotation);
        const b = viewToMap(rect.maxX, rect.maxY, map, this.rotation);
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const width = Math.abs(a.x - b.x) + 1;
        const height = Math.abs(a.y - b.y) + 1;

        const values = map.getTileValuesForPainting(x0, y0, width, height, []);
        if (this.animation !== null) {
            this.animation.getTiles(values, x0, y0, width, height, isPaused);
        }
        this.animated = values;
        this.animatedX = x0;
        this.animatedY = y0;
        this.animatedWidth = width;
        return values;
    }

    private animatedValueAt(x: number, y: number, fallback: number): number {
        const index = (y - this.animatedY) * this.animatedWidth + (x - this.animatedX);
        const value = this.animated[index];
        return value === undefined ? fallback : value;
    }

    /** Alle Sprites, die gerade unterwegs sind (Bild 0 heißt bei der Simulation: inaktiv). */
    private activeSprites(): SpriteLike[] {
        if (this.sprites === null) {
            return [];
        }
        return this.sprites.getSpriteList().filter((s) => s.frame !== 0);
    }

    /** Brückenplatten rund um jedes Schiff noch einmal zeichnen, damit sie über dem Schiff liegen. */
    private drawBridgeDecksOver(ctx: CanvasRenderingContext2D, ships: SpriteLike[], map: MapLike,
                                view: ViewParams): void {
        if (ships.length === 0) {
            return;
        }
        const painter = this.requirePainter();
        const size = viewSize(map, this.rotation);
        const done: { [key: string]: boolean } = {};
        const tiles: Array<[number, number]> = [];
        for (const ship of ships) {
            const centre = spriteCentre(ship);
            const point = this.mapPointToViewPoint(centre.x, centre.y, map);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const vx = Math.floor(point.x) + dx;
                    const vy = Math.floor(point.y) + dy;
                    const key = vx + "," + vy;
                    if (vx >= 0 && vy >= 0 && vx < size.width && vy < size.height && !done[key]) {
                        done[key] = true;
                        tiles.push([vx, vy]);
                    }
                }
            }
        }
        // von hinten nach vorn
        tiles.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
        for (const [vx, vy] of tiles) {
            const request = this.paintRequestFor(vx, vy, map);
            if (!request.bridgeHeights) {
                continue;
            }
            const top = projectToScreen(vx, vy, 0, view);
            const px = Math.round(top.x * this.pixelRatio) / this.pixelRatio;
            const py = Math.round(top.y * this.pixelRatio) / this.pixelRatio;
            painter.drawTile(ctx, px, py, { ...request, deckOnly: true });
        }
    }

    private drawSprites(ctx: CanvasRenderingContext2D, sprites: SpriteLike[], map: MapLike, view: ViewParams): void {
        for (const sprite of sprites) {
            const centre = spriteCentre(sprite);
            const point = this.mapPointToViewPoint(centre.x, centre.y, map);
            const ground = projectToScreen(point.x, point.y, 0, view);
            drawSprite(ctx, sprite, ground.x, ground.y, this.tileWidth, this.rotation);
        }
    }

    /*
     * Dorfplaner: Wasser auf einer Kachel. Rohranschlüsse werden wie Straßen in Kartenrichtungen bestimmt und dann
     * in die Ansicht gedreht. Ein Rohr verbindet sich mit Rohren, Gebäuden, Pumpen und Türmen nebenan.
     */
    private waterLookFor(x: number, y: number, building: ReturnType<typeof buildingPartOf>): WaterLook | null {
        const water = this.water;
        if (water === null) {
            return null;
        }
        if (this.underground) {
            let pipes = -1;
            if (water.hasPipe(x, y)) {
                pipes = 0;
                if (water.kindAt(x, y - 1) !== 0) { pipes |= NORTH; }
                if (water.kindAt(x + 1, y) !== 0) { pipes |= EAST; }
                if (water.kindAt(x, y + 1) !== 0) { pipes |= SOUTH; }
                if (water.kindAt(x - 1, y) !== 0) { pipes |= WEST; }
                pipes = rotateMask(pipes, this.rotation);
            }
            return { flowing: water.isFlowing(x, y), kind: water.kindAt(x, y), noWater: false, pipes,
                     supplied: water.isWatered(x, y), underground: true };
        }
        // Tropfen nur an der Mitte von Wohn-, Gewerbe- und Industriezonen
        const zoneCentre = building !== null && building.size === 3 && building.dx === 1 && building.dy === 1 &&
            (building.zone === "residential" || building.zone === "commercial" || building.zone === "industrial");
        if (!zoneCentre || water.isWatered(x, y) || !blinkOn(Date.now())) {
            return null;
        }
        return { flowing: false, kind: 2, noWater: true, pipes: -1, supplied: false, underground: false };
    }

    /*
     * Dorfplaner: ansteigende Brücke. Wir zählen, wie viele Brückenkacheln vor und hinter dieser liegen (in
     * Kartenrichtung), und bestimmen daraus die Höhe der Fahrbahn an beiden Kanten: vom Ufer aus über
     * BRIDGE_RAMP Kacheln ansteigend bis BRIDGE_HEIGHT, dann flach, am anderen Ende wieder abfallend.
     * Die Höhen werden zum Schluss in Ansichtsrichtungen gedreht.
     */
    private bridgeHeightsFor(x: number, y: number, mapRoads: number, map: MapLike) {
        const vertical = (mapRoads & (NORTH | SOUTH)) !== 0;
        const dx = vertical ? 0 : 1;
        const dy = vertical ? 1 : 0;
        const isBridge = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height &&
            describeTile(map.getTileValue(tx, ty)).bridge;
        let before = 0;
        while (isBridge(x - dx * (before + 1), y - dy * (before + 1))) { before++; }
        let after = 0;
        while (isBridge(x + dx * (after + 1), y + dy * (after + 1))) { after++; }
        const length = before + after + 1;
        const height = (k: number) => BRIDGE_HEIGHT * Math.min(1, k / BRIDGE_RAMP, (length - k) / BRIDGE_RAMP);
        const start = Math.round(height(before) * 100) / 100;      // Kante zur kleineren Koordinate
        const end = Math.round(height(before + 1) * 100) / 100;    // Kante zur größeren Koordinate
        // Kartenkanten: Norden/Westen = start, Süden/Osten = end; dann in die Ansicht drehen
        const byMapDirection: { [d: number]: number } = vertical ? { [NORTH]: start, [SOUTH]: end }
                                                                 : { [WEST]: start, [EAST]: end };
        const result = { east: 0, north: 0, south: 0, west: 0 };
        for (const d of [NORTH, EAST, SOUTH, WEST]) {
            if (byMapDirection[d] === undefined) {
                continue;
            }
            const viewDirection = rotateMask(d, this.rotation);
            if (viewDirection === NORTH) { result.north = byMapDirection[d]; }
            if (viewDirection === EAST) { result.east = byMapDirection[d]; }
            if (viewDirection === SOUTH) { result.south = byMapDirection[d]; }
            if (viewDirection === WEST) { result.west = byMapDirection[d]; }
        }
        return result;
    }

    /** Feste „Zufallszahl“ 0–3 je Kartenkachel, damit Wiesen und Wasser lebendiger aussehen – auch nach Drehen. */
    private variantFor(x: number, y: number): number {
        return ((x * 73856093) ^ (y * 19349663)) & 3;
    }

    /** Feste „Zufallszahl“ 0–15 je Zone (aus der Ecke der Zone): Bautyp und Farben der ganzen Zone. */
    private zoneVariantFor(x: number, y: number): number {
        return (((x * 2654435761) ^ (y * 40503)) >>> 7) & 15;
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
