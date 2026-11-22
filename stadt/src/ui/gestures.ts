/* Dorfplaner – Bedienung mit Maus und Finger.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Reine Rechenfunktionen für Gesten – ohne DOM, deshalb mit Unit-Tests prüfbar (test/ui/gestures.ts).
 */

/** Ab so vielen Pixeln Bewegung ist ein Antippen kein Antippen mehr, sondern Ziehen. */
export const TAP_TOLERANCE = 8;

/** So lange (Millisekunden) muss ein Finger ruhig liegen, damit es als „langes Drücken“ zählt. */
export const LONG_PRESS_MS = 550;

/** Um diesen Faktor müssen zwei Finger auseinander (oder zusammen) gehen, damit eine Zoomstufe wechselt. */
export const PINCH_STEP = 1.35;

/** Ist die Bewegung von (x0, y0) nach (x1, y1) klein genug, um noch als Antippen bzw. Klick zu gelten? */
export function isTap(x0: number, y0: number, x1: number, y1: number, tolerance = TAP_TOLERANCE): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return dx * dx + dy * dy <= tolerance * tolerance;
}

/** Abstand zweier Punkte. */
export function distance(x0: number, y0: number, x1: number, y1: number): number {
    return Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
}

/**
 * Zwei Finger: Wie viele Zoomstufen ergeben sich aus dem Abstand am Anfang und jetzt?
 * +1 = eine Stufe näher heran, −1 = eine Stufe weiter weg, 0 = (noch) nichts.
 */
export function pinchZoomStep(startDistance: number, currentDistance: number, step = PINCH_STEP): number {
    if (startDistance <= 0) {
        return 0;
    }
    const ratio = currentDistance / startDistance;
    if (ratio >= step) {
        return 1;
    }
    if (ratio <= 1 / step) {
        return -1;
    }
    return 0;
}

/** Nächste Zoomstufe in der Liste (aufsteigend sortiert); bleibt am Anfang bzw. Ende stehen. */
export function nextZoomLevel(levels: number[], current: number, step: number): number {
    let index = levels.indexOf(current);
    if (index === -1) {
        // unbekannte Stufe: die nächstgelegene nehmen
        index = 0;
        for (let i = 1; i < levels.length; i++) {
            if (Math.abs(levels[i] - current) < Math.abs(levels[index] - current)) {
                index = i;
            }
        }
    }
    const next = Math.max(0, Math.min(levels.length - 1, index + step));
    return levels[next];
}

/*
 * Zoomen um einen festen Punkt (z. B. die Mausposition): Der Punkt unter dem Mauszeiger soll nach dem Zoomen
 * an derselben Stelle bleiben.
 *
 * Bildschirm = Ursprung + Kartenpunkt · Maßstab. Bleibt der Bildschirmpunkt A fest, während der Maßstab von
 * alt auf neu wechselt, gilt für den neuen Ursprung:  neu = A − (A − alt) · neu/alt.
 */
export function zoomOrigin(originX: number, originY: number, anchorX: number, anchorY: number,
                           oldScale: number, newScale: number): { x: number, y: number } {
    const factor = newScale / oldScale;
    return {
        x: anchorX - (anchorX - originX) * factor,
        y: anchorY - (anchorY - originY) * factor,
    };
}
