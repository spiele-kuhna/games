/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Reine Rechenfunktionen für die isometrische Ansicht – ohne Canvas, ohne DOM.
 * Deshalb lassen sie sich vollständig mit Unit-Tests prüfen (test/iso/projection.ts).
 *
 * Drei Koordinatensysteme (siehe docs/PLAN.md, Abschnitt 3.1):
 *
 *   Karte      (x, y)    wie in GameMap: x nach rechts, y nach unten, (0, 0) oben links
 *   Ansicht    (vx, vy)  die Karte nach Drehung um rotation · 90°
 *   Bildschirm (sx, sy)  Pixel im Canvas
 *
 * Eine Kachel wird als Raute gezeichnet, doppelt so breit wie hoch. Der Punkt, den projectToScreen()
 * liefert, ist die OBERE SPITZE der Raute. Die Mitte der Raute liegt halbe Rautenhöhe darunter.
 *
 *            (sx, sy)  ← obere Spitze
 *              /\
 *             /  \
 *     links  <    >  rechts      Breite tileWidth, Höhe tileWidth / 2
 *             \  /
 *              \/
 */

/** Drehung der Ansicht in 90°-Schritten im Uhrzeigersinn: 0, 1, 2 oder 3. */
export type Rotation = 0 | 1 | 2 | 3;

/** Breite und Höhe einer Karte (oder der gedrehten Ansicht) in Kacheln. */
export interface GridSize {
    readonly width: number;
    readonly height: number;
}

/** Ein Punkt; je nach Zusammenhang in Kacheln oder in Pixeln. */
export interface Point {
    readonly x: number;
    readonly y: number;
}

/** Alles, was man zum Umrechnen Ansicht ↔ Bildschirm wissen muss. */
export interface ViewParams {
    /** Breite einer Raute in Pixeln (Zoom): z. B. 32, 64 oder 128. */
    readonly tileWidth: number;
    /** Pixel, um die eine Höhenstufe die Kachel nach oben verschiebt. */
    readonly heightStep: number;
    /** Bildschirmposition der oberen Spitze von Ansichtskachel (0, 0). Ändert sich beim Verschieben der Karte. */
    readonly originX: number;
    readonly originY: number;
}

/** Rechteck in Ansichtskoordinaten, Grenzen jeweils einschließlich. */
export interface ViewRect {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

/** Höhe einer Raute: immer halb so groß wie ihre Breite (Verhältnis 2:1). */
export function tileHeightFor(tileWidth: number): number {
    return tileWidth / 2;
}

/** Größe der Ansicht: Bei 90° und 270° tauschen Breite und Höhe. */
export function viewSize(map: GridSize, rotation: Rotation): GridSize {
    if (rotation % 2 === 0) {
        return { width: map.width, height: map.height };
    }
    return { width: map.height, height: map.width };
}

/*
 * Karte → Ansicht. Bei jeder Drehung um 90° wandert die Ecke, die oben in der Ansicht liegt, weiter.
 *
 * Für das Höhenraster an den Kachelecken (ab Arbeitspaket 8) dieselbe Funktion mit der Eckenzahl
 * aufrufen: { width: map.width + 1, height: map.height + 1 }.
 */
export function mapToView(x: number, y: number, map: GridSize, rotation: Rotation): Point {
    switch (rotation) {
        case 0:
            return { x, y };
        case 1:
            return { x: map.height - 1 - y, y: x };
        case 2:
            return { x: map.width - 1 - x, y: map.height - 1 - y };
        case 3:
            return { x: y, y: map.width - 1 - x };
        default:
            throw new Error(`Unexpected rotation ${rotation}`);
    }
}

/** Ansicht → Karte: die Umkehrung von mapToView(). */
export function viewToMap(vx: number, vy: number, map: GridSize, rotation: Rotation): Point {
    switch (rotation) {
        case 0:
            return { x: vx, y: vy };
        case 1:
            return { x: vy, y: map.height - 1 - vx };
        case 2:
            return { x: map.width - 1 - vx, y: map.height - 1 - vy };
        case 3:
            return { x: map.width - 1 - vy, y: vx };
        default:
            throw new Error(`Unexpected rotation ${rotation}`);
    }
}

/*
 * Ansicht → Bildschirm: obere Spitze der Raute von Kachel (vx, vy) auf Höhe height.
 *
 *   Ein Schritt in vx-Richtung geht halbe Rautenbreite nach rechts und halbe Rautenhöhe nach unten,
 *   ein Schritt in vy-Richtung halbe Rautenbreite nach links und halbe Rautenhöhe nach unten.
 *   Jede Höhenstufe hebt die Kachel um heightStep Pixel an.
 *
 * vx und vy dürfen Nachkommastellen haben (z. B. für Fahrzeuge zwischen zwei Kacheln).
 */
export function projectToScreen(vx: number, vy: number, height: number, view: ViewParams): Point {
    const halfWidth = view.tileWidth / 2;
    const halfHeight = tileHeightFor(view.tileWidth) / 2;
    return {
        x: (vx - vy) * halfWidth + view.originX,
        y: (vx + vy) * halfHeight - height * view.heightStep + view.originY,
    };
}

/*
 * Bildschirm → Ansicht mit Nachkommastellen, unter der Annahme, dass der Punkt auf Höhe height liegt.
 * Umkehrung von projectToScreen(): aus den zwei Gleichungen
 *   a = vx − vy   und   b = vx + vy
 * folgt  vx = (a + b) / 2  und  vy = (b − a) / 2.
 */
export function screenToViewFraction(sx: number, sy: number, height: number, view: ViewParams): Point {
    const a = (sx - view.originX) / (view.tileWidth / 2);
    const b = (sy - view.originY + height * view.heightStep) / (tileHeightFor(view.tileWidth) / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Bildschirm → Ansichtskachel (ganze Zahlen) unter der Annahme einer Höhe. Für ebenes Gelände reicht height = 0. */
export function screenToView(sx: number, sy: number, height: number, view: ViewParams): Point {
    const exact = screenToViewFraction(sx, sy, height, view);
    return { x: Math.floor(exact.x), y: Math.floor(exact.y) };
}

/*
 * Picking mit Höhen: Welche Kacheln kommen für einen Klick in Frage?
 *
 * Wir rechnen den Klick für jede mögliche Höhe von maxHeight bis 0 um. Je höher die angenommene Höhe,
 * desto weiter VORN liegt die gefundene Kachel. Die Liste ist also von vorn nach hinten sortiert.
 * Der Aufrufer prüft die Kandidaten der Reihe nach gegen die echte Geländeform; der erste Treffer
 * gewinnt, weil er alles dahinter verdeckt.
 *
 * Kandidaten außerhalb der Ansicht werden weggelassen. Eine Kachel wird oft bei mehreren
 * aufeinanderfolgenden Höhen getroffen (eine Höhenstufe ist kleiner als eine Raute); sie steht trotzdem nur
 * einmal in der Liste. Weil vx und vy beim Absenken der Höhe nie wieder wachsen, kann eine Kachel nicht
 * später noch einmal auftauchen – es reicht, mit dem Vorgänger zu vergleichen.
 *
 * Die Liste enthält bewusst keine Höhe: Ob der Klick eine Kachel wirklich trifft, entscheidet erst ihre
 * echte Geländeform.
 */
export function pickCandidates(sx: number, sy: number, maxHeight: number, view: ViewParams,
                               size: GridSize): Point[] {
    const result: Point[] = [];
    let lastX = NaN;
    let lastY = NaN;

    for (let height = maxHeight; height >= 0; height--) {
        const tile = screenToView(sx, sy, height, view);
        const isRepeat = tile.x === lastX && tile.y === lastY;
        const isInside = tile.x >= 0 && tile.y >= 0 && tile.x < size.width && tile.y < size.height;

        if (!isRepeat && isInside) {
            result.push(tile);
        }
        lastX = tile.x;
        lastY = tile.y;
    }
    return result;
}

/*
 * Welche Ansichtskacheln müssen für einen Bildschirm der Größe screenWidth × screenHeight gezeichnet werden?
 *
 * Wir rechnen die vier Bildschirmecken in Ansichtskoordinaten um – einmal auf Höhe 0 und einmal auf der
 * größten Höhe – und nehmen das umschließende Rechteck. extraPixelsAbove berücksichtigt, was über eine
 * Kachel hinausragt (hohe Gebäude): Solche Kacheln liegen unterhalb des Bildschirms, ihr Dach ist aber
 * sichtbar. Das Ergebnis wird auf die Ansicht begrenzt; null heißt „nichts sichtbar“.
 */
export function visibleViewRect(screenWidth: number, screenHeight: number, maxHeight: number,
                                extraPixelsAbove: number, view: ViewParams, size: GridSize): ViewRect | null {
    const corners: Point[] = [
        { x: 0, y: 0 },
        { x: screenWidth, y: 0 },
        { x: 0, y: screenHeight + extraPixelsAbove },
        { x: screenWidth, y: screenHeight + extraPixelsAbove },
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const corner of corners) {
        for (const height of [0, maxHeight]) {
            const tile = screenToViewFraction(corner.x, corner.y, height, view);
            minX = Math.min(minX, tile.x);
            maxX = Math.max(maxX, tile.x);
            minY = Math.min(minY, tile.y);
            maxY = Math.max(maxY, tile.y);
        }
    }

    // Eine Kachel mehr an jedem Rand, damit angeschnittene Rauten nicht fehlen.
    const rect = {
        maxX: Math.min(size.width - 1, Math.floor(maxX) + 1),
        maxY: Math.min(size.height - 1, Math.floor(maxY) + 1),
        minX: Math.max(0, Math.floor(minX) - 1),
        minY: Math.max(0, Math.floor(minY) - 1),
    };

    if (rect.minX > rect.maxX || rect.minY > rect.maxY) {
        return null;
    }
    return rect;
}

/*
 * Painter's Algorithm: alle Kacheln eines Rechtecks von hinten nach vorn besuchen.
 *
 * „Hinten“ heißt kleine Summe vx + vy (oben im Bild), „vorn“ große Summe (unten im Bild).
 * Wir gehen Diagonale für Diagonale; innerhalb einer Diagonale überdecken sich Kacheln nicht,
 * die Reihenfolge dort ist egal. Wer zuletzt gemalt wird, liegt sichtbar vorn.
 */
export function forEachTileBackToFront(rect: ViewRect, visit: (vx: number, vy: number) => void): void {
    const firstDiagonal = rect.minX + rect.minY;
    const lastDiagonal = rect.maxX + rect.maxY;

    for (let diagonal = firstDiagonal; diagonal <= lastDiagonal; diagonal++) {
        // Auf der Diagonale gilt vy = diagonal − vx; nur die vx, deren vy im Rechteck liegt.
        const fromX = Math.max(rect.minX, diagonal - rect.maxY);
        const toX = Math.min(rect.maxX, diagonal - rect.minY);

        for (let vx = fromX; vx <= toX; vx++) {
            visit(vx, diagonal - vx);
        }
    }
}
