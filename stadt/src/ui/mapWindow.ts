/* Dorfplaner – Übersichtskarte mit Einblendungen.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Kartenfenster: die ganze Stadt klein (2 Pixel je Kachel), dazu umschaltbare Einblendungen wie Strom, Wasser,
 * Verschmutzung oder Kriminalität. Ein Klick in die Karte springt mit der Ansicht dorthin; das gerade sichtbare
 * Gebiet ist eingerahmt.
 *
 * Die Karte liest nur – sie verändert nichts an der Simulation.
 */

import { describeTile } from "../iso/tileKinds";
import { baseColour, coverageColour, dim, heatColour, mapPointToTile, normalise, Overlay, OVERLAYS,
         valueColour } from "./mapOverlay";

const SCALE = 2;
const REFRESH_MS = 1000;

interface TileLike { isPowered(): boolean; isConductive(): boolean; }
interface MapLike {
    readonly width: number;
    readonly height: number;
    getTileValue(x: number, y: number): number;
    getTile(x: number, y: number): TileLike;
}
interface BlockMapLike { worldGet(x: number, y: number): number; }
interface WaterLike {
    hasPipe(x: number, y: number): boolean;
    isWatered(x: number, y: number): boolean;
    kindAt(x: number, y: number): number;
}
/** Ansicht: Kachel unter einem Bildschirmpunkt, Größe und Springen */
interface ViewLike {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    canvasCoordinateToTileCoordinate(x: number, y: number): { x: number, y: number } | null;
    centreOn(x: number, y: number): void;
}

export interface MapSources {
    map: MapLike;
    blockMaps: { [name: string]: BlockMapLike };
    water: WaterLike;
    view: ViewLike;
}

const BLOCK_MAP: { [overlay: string]: string } = {
    crime: "crimeRateMap",
    fire: "fireStationEffectMap",
    landValue: "landValueMap",
    police: "policeStationEffectMap",
    pollution: "pollutionDensityMap",
    population: "populationDensityMap",
    traffic: "trafficDensityMap",
};

export class MapWindow {
    private overlay: Overlay = "zones";
    private timer: number | null = null;
    private readonly canvas: HTMLCanvasElement;
    private readonly legend: HTMLElement;

    constructor(private readonly panel: HTMLElement, private readonly sources: MapSources) {
        this.canvas = panel.querySelector("canvas") as HTMLCanvasElement;
        this.canvas.width = sources.map.width * SCALE;
        this.canvas.height = sources.map.height * SCALE;
        this.legend = panel.querySelector(".mapLegend") as HTMLElement;

        // Knöpfe für die Einblendungen
        const bar = panel.querySelector(".mapOverlays") as HTMLElement;
        for (const info of OVERLAYS) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = info.label;
            button.setAttribute("data-overlay", info.id);
            button.addEventListener("click", () => this.setOverlay(info.id));
            bar.appendChild(button);
        }

        this.canvas.addEventListener("click", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const py = (e.clientY - rect.top) * (this.canvas.height / rect.height);
            const tile = mapPointToTile(px, py, SCALE, sources.map.width, sources.map.height);
            if (tile !== null) {
                sources.view.centreOn(tile.x, tile.y);
                this.render();
            }
        });
        const close = panel.querySelector(".mapClose");
        if (close) {
            close.addEventListener("click", () => this.hide());
        }
        this.setOverlay("zones");
    }

    get isOpen(): boolean {
        return this.timer !== null;
    }

    toggle(): void {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    show(): void {
        this.panel.style.display = "block";
        this.render();
        if (this.timer === null) {
            this.timer = window.setInterval(() => this.render(), REFRESH_MS);
        }
    }

    hide(): void {
        this.panel.style.display = "none";
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }

    setOverlay(overlay: Overlay): void {
        this.overlay = overlay;
        const buttons = this.panel.querySelectorAll(".mapOverlays button");
        for (let i = 0; i < buttons.length; i++) {
            const active = buttons[i].getAttribute("data-overlay") === overlay;
            buttons[i].setAttribute("aria-pressed", active ? "true" : "false");
        }
        const info = OVERLAYS.filter((o) => o.id === overlay)[0];
        this.legend.textContent = info ? info.legend : "";
        this.render();
    }

    render(): void {
        const { map, blockMaps, water } = this.sources;
        const ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        const overlay = this.overlay;
        const blockMap = BLOCK_MAP[overlay] ? blockMaps[BLOCK_MAP[overlay]] : null;

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const look = describeTile(map.getTileValue(x, y));
                const base = baseColour(look);
                const isBuilding = look.cover === "zone";
                let colour = overlay === "zones" ? base : dim(base);
                let tint: string | null = null;

                switch (overlay) {
                    case "power":
                        if (isBuilding) {
                            colour = map.getTile(x, y).isPowered() ? "#3fbf4f" : "#d9443a";
                        } else if (look.wires !== 0) {
                            colour = "#e8c63a";
                        }
                        break;
                    case "water": {
                        const kind = water.kindAt(x, y);
                        if (kind === 3) {
                            colour = "#ffffff";
                        } else if (kind === 2) {
                            colour = water.isWatered(x, y) ? "#2f7fe0" : "#d9443a";
                        } else if (water.hasPipe(x, y)) {
                            colour = "#7fd0ff";
                        }
                        break;
                    }
                    case "landValue":
                        tint = blockMap ? valueColour(normalise(overlay, blockMap.worldGet(x, y))) : null;
                        break;
                    case "fire": case "police":
                        tint = blockMap ? coverageColour(normalise(overlay, blockMap.worldGet(x, y)), overlay === "police")
                                        : null;
                        break;
                    case "population":
                        if (blockMap) {
                            const t = normalise(overlay, blockMap.worldGet(x, y));
                            tint = t > 0.05 ? "rgba(140, 60, 200, " + (0.2 + 0.7 * t).toFixed(2) + ")" : null;
                        }
                        break;
                    case "zones":
                        break;
                    default:
                        tint = blockMap ? heatColour(normalise(overlay, blockMap.worldGet(x, y))) : null;
                }

                ctx.fillStyle = colour;
                ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
                if (tint !== null) {
                    ctx.fillStyle = tint;
                    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
                }
            }
        }
        this.drawViewFrame(ctx);
    }

    /** Das gerade sichtbare Gebiet als Rahmen (in der 3D-Ansicht eine Raute) */
    private drawViewFrame(ctx: CanvasRenderingContext2D): void {
        const view = this.sources.view;
        const w = view.canvasWidth;
        const h = view.canvasHeight;
        const corners = [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]
            .map(([x, y]) => view.canvasCoordinateToTileCoordinate(x, y));
        if (corners.some((c) => c === null)) {
            // Rand der Karte sichtbar: Rahmen um die Mitte als Orientierung
            const centre = view.canvasCoordinateToTileCoordinate(w / 2, h / 2);
            if (centre !== null) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.strokeRect(centre.x * SCALE - 6, centre.y * SCALE - 6, 12, 12);
            }
            return;
        }
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        corners.forEach((c, i) => {
            const px = (c as { x: number }).x * SCALE + SCALE / 2;
            const py = (c as { y: number }).y * SCALE + SCALE / 2;
            if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
        });
        ctx.closePath();
        ctx.stroke();
    }
}
