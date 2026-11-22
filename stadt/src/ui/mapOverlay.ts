/* Dorfplaner – Übersichtskarte mit Einblendungen.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Reine Rechenfunktionen für die Übersichtskarte: welche Einblendungen es gibt, Grundfarben je Kachelart und
 * Farbskalen. Ohne DOM, deshalb mit Unit-Tests prüfbar (test/ui/mapOverlay.ts). Gezeichnet wird in mapWindow.ts.
 */

import { TileLook } from "../iso/tileKinds";

export type Overlay = "zones" | "power" | "water" | "pollution" | "crime" | "landValue" | "traffic" | "population" |
                      "fire" | "police";

export interface OverlayInfo {
    readonly id: Overlay;
    readonly label: string;
    /** Erklärung der Farben unter der Karte */
    readonly legend: string;
}

export const OVERLAYS: OverlayInfo[] = [
    { id: "zones", label: "Gebiete", legend: "grün Wohnen · blau Gewerbe · gelb Industrie · grau Straßen" },
    { id: "power", label: "Strom", legend: "grün mit Strom · rot ohne Strom · gelb Leitungen" },
    { id: "water", label: "Wasser", legend: "blau versorgt · rot ohne Wasser · hellblau Rohre" },
    { id: "pollution", label: "Verschmutzung", legend: "gelb wenig · rot stark verschmutzt" },
    { id: "crime", label: "Kriminalität", legend: "gelb wenig · rot hohe Kriminalität" },
    { id: "landValue", label: "Bodenwert", legend: "blass niedrig · dunkelgrün hoch" },
    { id: "traffic", label: "Verkehr", legend: "gelb wenig · rot Stau" },
    { id: "population", label: "Bevölkerung", legend: "hell wenig · lila dicht besiedelt" },
    { id: "fire", label: "Feuerwehr", legend: "rot getönt: gut geschützt" },
    { id: "police", label: "Polizei", legend: "blau getönt: gut geschützt" },
];

/** Grundfarbe einer Kachel für die Übersichtskarte (Gebiete deutlich, alles andere ruhig) */
export function baseColour(look: TileLook): string {
    if (look.ground === "water" && look.roads === 0 && look.rails === 0) {
        return "#3f7fc4";
    }
    if (look.roads !== 0) {
        return "#5a5d62";
    }
    if (look.rails !== 0) {
        return "#7a5a45";
    }
    switch (look.cover) {
        case "trees": return "#4f8f3f";
        case "denseTrees": return "#3c7a32";
        case "rubble": case "radioactive": return "#8a7a6a";
        case "fire": return "#e8572b";
        case "flood": return "#5f97cf";
        case "zone":
            switch (look.zone) {
                case "residential": return "#5fcf4f";
                case "commercial": return "#4f7fe0";
                case "industrial": return "#e6c43c";
                case "park": return "#6fb85a";
                case "pump": case "waterTower": return "#9fd0ff";
                default: return "#b0a8c8";   // öffentliche Gebäude, Kraftwerke, Hafen, Flughafen
            }
    }
    if (look.wires !== 0) {
        return "#a59f6a";
    }
    return "#9bbf72";   // freies Land
}

/** Farbe abgeschwächt (für Einblendungen über der Grundkarte) */
export function dim(colour: string, amount = 0.55): string {
    const n = parseInt(colour.slice(1), 16);
    const mix = (c: number) => Math.round(c + (200 - c) * amount);
    return "rgb(" + mix((n >> 16) & 255) + ", " + mix((n >> 8) & 255) + ", " + mix(n & 255) + ")";
}

function clamp01(t: number): number {
    return Math.max(0, Math.min(1, t));
}

/** Wärmeskala 0 … 1: durchsichtig → gelb → rot; null bei (fast) 0 */
export function heatColour(t: number): string | null {
    t = clamp01(t);
    if (t < 0.06) {
        return null;
    }
    const green = Math.round(220 * (1 - t));
    return "rgba(235, " + green + ", 40, " + (0.35 + 0.55 * t).toFixed(2) + ")";
}

/** Grünskala für Bodenwert 0 … 1 */
export function valueColour(t: number): string {
    t = clamp01(t);
    return "rgba(20, " + Math.round(110 + 80 * t) + ", 50, " + (0.1 + 0.75 * t).toFixed(2) + ")";
}

/** Abdeckung durch Feuerwehr bzw. Polizei 0 … 1 */
export function coverageColour(t: number, police: boolean): string | null {
    t = clamp01(t);
    if (t < 0.05) {
        return null;
    }
    return (police ? "rgba(40, 90, 220, " : "rgba(220, 50, 40, ") + (0.2 + 0.6 * t).toFixed(2) + ")";
}

/*
 * Werte der Simulation auf 0 … 1 bringen. Bereiche aus micropolisJS: Verschmutzung und Bevölkerungsdichte bis etwa
 * 255, Kriminalität und Bodenwert bis 250, Verkehr bis 240, Abdeckung der Wachen bis etwa 1000.
 */
export function normalise(overlay: Overlay, value: number): number {
    switch (overlay) {
        case "pollution": return clamp01(value / 200);
        case "crime": return clamp01(value / 200);
        case "landValue": return clamp01(value / 250);
        case "traffic": return clamp01(value / 200);
        case "population": return clamp01(value / 200);
        case "fire": case "police": return clamp01(value / 600);
        default: return 0;
    }
}

/** Kachel unter einem Punkt der Kartenzeichnung (scale Pixel je Kachel) */
export function mapPointToTile(px: number, py: number, scale: number, width: number,
                               height: number): { x: number, y: number } | null {
    const x = Math.floor(px / scale);
    const y = Math.floor(py / scale);
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}
