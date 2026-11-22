/* Dorfplaner – Wasserversorgung.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Kleine Zeichenhilfen, die Draufsicht und 3D-Ansicht gemeinsam nutzen: Wassertropfen und Rohrfarben.
 */

/** Rohrfarbe: blau, wenn Wasser fließt, sonst grau (wie im Vorbild) */
export function pipeColour(flowing: boolean): string {
    return flowing ? "#3fa0ff" : "#8f9499";
}

/** Abdunklung der Karte in der Untergrundansicht */
export const UNDERGROUND_SHADE = "rgba(18, 24, 34, 0.62)";

/** Blinken: an oder aus (zweimal pro Sekunde wechselnd) */
export function blinkOn(now: number): boolean {
    return Math.floor(now / 500) % 2 === 0;
}

/** Blauer Wassertropfen (Spitze oben) mit Mittelpunkt (cx, cy) und Höhe size */
export function drawWaterDrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const r = size * 0.32;
    const top = cy - size / 2;
    const centre = cy + size / 2 - r;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + r * 0.4, top + size * 0.25, cx + r, centre - r * 0.4, cx + r, centre);
    ctx.arc(cx, centre, r, 0, Math.PI);
    ctx.bezierCurveTo(cx - r, centre - r * 0.4, cx - r * 0.4, top + size * 0.25, cx, top);
    ctx.closePath();
    ctx.fillStyle = "#2f8cff";
    ctx.strokeStyle = "#0b3d7a";
    ctx.lineWidth = Math.max(1, size / 14);
    ctx.fill();
    ctx.stroke();
    // Glanzpunkt
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, centre - r * 0.2, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
}

/** Ist dieser Kachelwert die Mitte einer Wohn-, Gewerbe- oder Industriezone? (Werte aus tileValues.ts) */
export function isWaterZoneCentre(value: number, isZone: boolean): boolean {
    // RESBASE 240 … HOSPITALBASE−1 404, COMBASE 423 … PORTBASE−1 692 (Gewerbe und Industrie)
    return isZone && ((value >= 240 && value <= 404) || (value >= 423 && value <= 692));
}
