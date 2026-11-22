/* Dorfplaner – Bedienung mit Maus und Finger.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * PointerInput übersetzt Maus-, Stift- und Fingereingaben auf der Karte in Spielaktionen.
 *
 * Es benutzt „Pointer Events“ (pointerdown, pointermove, pointerup): EIN Ereignistyp für Maus, Stift und Finger,
 * in Safari seit iOS 13 vorhanden. So braucht es keinen getrennten Code für Touch.
 *
 * Was passiert wann (docs/PLAN.md, 3.8):
 *
 *   Maus links        mit Werkzeug: klicken baut; Straße/Schiene/Leitung ziehen baut entlang
 *                     ohne Werkzeug: Karte verschieben
 *   Maus rechts/Mitte Karte verschieben
 *   Mausrad           zoomen (nur 3D-Ansicht)
 *   ein Finger        antippen baut (Vorschau beim Aufsetzen, gebaut beim Loslassen);
 *                     ziehen baut bei Straße/Schiene/Leitung, sonst wird die Karte verschoben;
 *                     lange drücken fragt die Stelle ab
 *   zwei Finger       verschieben und zoomen
 *
 * Die eigentliche Arbeit (bauen, verschieben, zoomen) erledigen die Rückruf-Funktionen (Callbacks),
 * die InputStatus übergibt. PointerInput entscheidet nur, WAS gemeint ist.
 */

import { distance, isTap, LONG_PRESS_MS, pinchZoomStep } from "./gestures";

export interface PointerCallbacks {
    /** Ist gerade ein Werkzeug gewählt? */
    hasTool(): boolean;
    /** Baut das gewählte Werkzeug beim Ziehen fortlaufend (Straße, Schiene, Leitung)? */
    toolIsDraggable(): boolean;
    /** Position für die Bau-Vorschau (CSS-Pixel im Canvas) oder null, wenn keine Vorschau. */
    hover(x: number | null, y: number | null): void;
    /** Werkzeug an dieser Stelle anwenden. */
    useToolAt(x: number, y: number): void;
    /** Kennung der Kachel unter dem Punkt (zum Erkennen eines Kachelwechsels beim Ziehen) oder null. */
    tileKeyAt(x: number, y: number): string | null;
    /** Stelle abfragen (langes Drücken). */
    queryAt(x: number, y: number): void;
    /** Karte um (dx, dy) Pixel verschieben – sie folgt dem Finger bzw. der Maus. */
    panBy(dx: number, dy: number): void;
    /** Zoomstufe ändern (+1 näher, −1 weiter weg) um den Punkt (x, y). */
    zoomAt(step: number, x: number, y: number): void;
    /** Rechtsklick ohne Ziehen: gewähltes Werkzeug ablegen. */
    dropTool(): void;
}

/** Was die aktuelle Berührung bzw. der Mausklick bedeutet. */
type Mode =
    "idle" |
    "pendingTap" |     // Finger oder Maus unten, noch keine Bewegung: wird Antippen, Ziehen oder langes Drücken
    "click" |          // Maus mit Werkzeug, das nicht gezogen wird: baut beim Loslassen
    "build" |          // Bauen beim Ziehen (Straße, Schiene, Leitung)
    "pan" |            // Karte verschieben
    "rightClick" |     // rechte Maustaste unten: Klick legt das Werkzeug ab, Ziehen verschiebt
    "pinch" |          // zwei Finger
    "finished";        // Geste ist erledigt (z. B. nach langem Drücken), bis alle Finger weg sind

interface Pointer {
    x: number;
    y: number;
    startX: number;
    startY: number;
    type: string;
}

export class PointerInput {

    private pointers: { [id: number]: Pointer } = {};
    private mode: Mode = "idle";
    private lastTile: string | null = null;
    private longPressTimer: number | null = null;
    private pinchDistance = 0;
    private pinchX = 0;
    private pinchY = 0;

    constructor(private readonly element: HTMLElement, private readonly callbacks: PointerCallbacks) {
        // Safari soll auf dem Canvas weder scrollen noch selbst zoomen – das übernimmt das Spiel.
        element.style.touchAction = "none";
        element.addEventListener("pointerdown", (e) => this.onDown(e));
        element.addEventListener("pointermove", (e) => this.onMove(e));
        element.addEventListener("pointerup", (e) => this.onUp(e, true));
        element.addEventListener("pointercancel", (e) => this.onUp(e, false));
        element.addEventListener("pointerleave", (e) => this.onLeave(e));
        element.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        element.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    // ---- Ereignisse -----------------------------------------------------------------------------------------

    private onDown(e: PointerEvent): void {
        e.preventDefault();
        const p = this.position(e);
        this.pointers[e.pointerId] = { startX: p.x, startY: p.y, type: e.pointerType, x: p.x, y: p.y };
        try {
            this.element.setPointerCapture(e.pointerId);   // Bewegungen auch außerhalb des Canvas weiter erhalten
        } catch (ignored) {
            // ältere Browser: dann eben ohne
        }

        const count = this.pointerCount();
        if (count === 2 && e.pointerType === "touch") {
            this.startPinch();
            return;
        }
        if (count > 1) {
            return;
        }

        // Rechte Maustaste: Klick legt das Werkzeug ab, Ziehen verschiebt. Mittlere Taste: verschieben.
        if (e.pointerType === "mouse" && e.button === 2) {
            this.mode = "rightClick";
            return;
        }
        if (e.pointerType === "mouse" && e.button !== 0) {
            this.mode = "pan";
            return;
        }
        // Mit gedrückter Umschalt-, Strg-, Alt- oder Befehlstaste wird nicht gebaut (wie im Original)
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
            this.mode = "pan";
            return;
        }

        this.callbacks.hover(p.x, p.y);

        if (!this.callbacks.hasTool()) {
            this.mode = "pendingTap";          // ohne Werkzeug: Ziehen verschiebt die Karte
            return;
        }

        if (e.pointerType === "touch") {
            // Erst abwarten: Wird es Antippen, Ziehen, langes Drücken oder kommt ein zweiter Finger?
            this.mode = "pendingTap";
            this.startLongPress(p.x, p.y);
            return;
        }

        // Maus oder Stift
        if (this.callbacks.toolIsDraggable()) {
            this.startBuilding(p.x, p.y);
        } else {
            this.mode = "click";
        }
    }

    private onMove(e: PointerEvent): void {
        const p = this.position(e);
        const pointer = this.pointers[e.pointerId];

        if (!pointer) {
            // Maus schwebt ohne gedrückte Taste: nur die Vorschau mitführen
            if (e.pointerType !== "touch") {
                this.callbacks.hover(p.x, p.y);
            }
            return;
        }

        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        pointer.x = p.x;
        pointer.y = p.y;

        switch (this.mode) {
            case "pinch":
                this.updatePinch();
                return;

            case "pan":
                this.callbacks.panBy(dx, dy);
                return;

            case "rightClick":
                if (!isTap(pointer.startX, pointer.startY, p.x, p.y)) {
                    this.mode = "pan";
                    this.callbacks.panBy(p.x - pointer.startX, p.y - pointer.startY);
                }
                return;

            case "pendingTap":
                if (isTap(pointer.startX, pointer.startY, p.x, p.y)) {
                    this.callbacks.hover(p.x, p.y);
                    return;
                }
                this.cancelLongPress();
                if (this.callbacks.hasTool() && this.callbacks.toolIsDraggable()) {
                    // Finger zieht mit Straße/Schiene/Leitung: ab dem Startpunkt bauen
                    this.startBuilding(pointer.startX, pointer.startY);
                    this.continueBuilding(p.x, p.y);
                } else {
                    // sonst verschiebt ein Finger die Karte – um die ganze Strecke seit dem Aufsetzen
                    this.mode = "pan";
                    this.callbacks.hover(null, null);
                    this.callbacks.panBy(p.x - pointer.startX, p.y - pointer.startY);
                }
                return;

            case "build":
                this.continueBuilding(p.x, p.y);
                return;

            case "click":
                this.callbacks.hover(p.x, p.y);
                return;
        }
    }

    private onUp(e: PointerEvent, completed: boolean): void {
        const pointer = this.pointers[e.pointerId];
        delete this.pointers[e.pointerId];
        this.cancelLongPress();
        if (!pointer) {
            return;
        }

        if (completed) {
            if (this.mode === "rightClick") {
                this.callbacks.dropTool();
                this.callbacks.hover(null, null);
            } else if (this.mode === "click") {
                this.callbacks.useToolAt(pointer.x, pointer.y);
            } else if (this.mode === "pendingTap" && this.callbacks.hasTool()) {
                // Antippen: dort bauen, wo der Finger aufgesetzt hat
                this.callbacks.useToolAt(pointer.startX, pointer.startY);
            }
        }

        if (e.pointerType === "touch") {
            this.callbacks.hover(null, null);   // nach dem Loslassen keine Vorschau mehr
        }

        if (this.pointerCount() === 0) {
            this.mode = "idle";
            this.lastTile = null;
        } else if (this.mode === "pinch") {
            this.mode = "finished";             // ein Finger bleibt liegen: nichts mehr tun, bis er weg ist
        }
    }

    private onLeave(e: PointerEvent): void {
        if (e.pointerType !== "touch" && !this.pointers[e.pointerId]) {
            this.callbacks.hover(null, null);
        }
    }

    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        const p = this.position(e);
        this.callbacks.zoomAt(e.deltaY < 0 ? 1 : -1, p.x, p.y);
    }

    // ---- Bauen beim Ziehen ----------------------------------------------------------------------------------

    private startBuilding(x: number, y: number): void {
        this.mode = "build";
        this.lastTile = this.callbacks.tileKeyAt(x, y);
        this.callbacks.hover(x, y);
        this.callbacks.useToolAt(x, y);
    }

    /** Beim Ziehen nur dann bauen, wenn der Zeiger auf eine neue Kachel kommt. */
    private continueBuilding(x: number, y: number): void {
        this.callbacks.hover(x, y);
        const tile = this.callbacks.tileKeyAt(x, y);
        if (tile !== null && tile !== this.lastTile) {
            this.lastTile = tile;
            this.callbacks.useToolAt(x, y);
        }
    }

    // ---- Langes Drücken -------------------------------------------------------------------------------------

    private startLongPress(x: number, y: number): void {
        this.cancelLongPress();
        this.longPressTimer = window.setTimeout(() => {
            this.longPressTimer = null;
            if (this.mode === "pendingTap") {
                this.mode = "finished";
                this.callbacks.hover(null, null);
                this.callbacks.queryAt(x, y);
            }
        }, LONG_PRESS_MS);
    }

    private cancelLongPress(): void {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    // ---- Zwei Finger ----------------------------------------------------------------------------------------

    private startPinch(): void {
        this.cancelLongPress();
        this.callbacks.hover(null, null);
        this.mode = "pinch";
        const [a, b] = this.twoPointers();
        this.pinchDistance = distance(a.x, a.y, b.x, b.y);
        this.pinchX = (a.x + b.x) / 2;
        this.pinchY = (a.y + b.y) / 2;
    }

    private updatePinch(): void {
        const pair = this.twoPointers();
        if (pair.length < 2) {
            return;
        }
        const [a, b] = pair;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // Die Mitte zwischen den Fingern verschiebt die Karte …
        this.callbacks.panBy(midX - this.pinchX, midY - this.pinchY);
        this.pinchX = midX;
        this.pinchY = midY;
        // … der Abstand der Finger zoomt in Stufen
        const now = distance(a.x, a.y, b.x, b.y);
        const step = pinchZoomStep(this.pinchDistance, now);
        if (step !== 0) {
            this.callbacks.zoomAt(step, midX, midY);
            this.pinchDistance = now;
        }
    }

    // ---- Hilfsfunktionen ------------------------------------------------------------------------------------

    private position(e: MouseEvent): { x: number, y: number } {
        const rect = this.element.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    private pointerCount(): number {
        return Object.keys(this.pointers).length;
    }

    private twoPointers(): Pointer[] {
        return Object.keys(this.pointers).slice(0, 2).map((id) => this.pointers[Number(id)]);
    }
}
