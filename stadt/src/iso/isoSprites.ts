/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Bewegte Objekte („Sprites“) in der isometrischen Ansicht: Zug, Hubschrauber, Flugzeug, Schiff, Monster,
 * Tornado, Explosion. Wo sie sind und wohin sie fahren, rechnet weiterhin die Simulation (spriteManager.js);
 * hier werden sie nur gezeichnet – mit eigenen, einfachen Formen statt der Draufsicht-Bilder.
 *
 * Die Sprites liegen in einer eigenen Schicht ÜBER allen Kacheln. Ein Zug kann deshalb nicht hinter einem
 * Hochhaus verschwinden; für Flugzeuge und Hubschrauber ist das ohnehin richtig (docs/PLAN.md, 3.6).
 */

// Sprite-Arten aus spriteConstants.ts
const TRAIN = 1;
const HELICOPTER = 2;
const AIRPLANE = 3;
const SHIP = 4;
const MONSTER = 5;
const TORNADO = 6;
const EXPLOSION = 7;

/*
 * Fahrtrichtung aus der Bildnummer (frame), wie sie die Simulation speichert:
 *  - Zug (trainSprite.js): 1 = Nord-Süd, 2 = Ost-West, 3 = Diagonale NW–SO, 4 = Diagonale NO–SW, 5 = unter Wasser
 *  - Flugzeug/Hubschrauber (airplaneSprite.js): 1–8 = N, NO, O, SO, S, SW, W, NW; 9–11 = Start nach Osten
 * Angaben in Kartenrichtungen (x nach rechts, y nach unten).
 */
const TRAIN_AXIS: Array<[number, number]> = [[0, 1], [0, 1], [1, 0], [1, 1], [1, -1], [0, 0]];
const FLIGHT_HEADING: Array<[number, number]> = [[0, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
                                                  [-1, -1], [1, 0], [1, 0], [1, 0]];

/** Richtung von Karten- in Ansichtskoordinaten drehen (wie projection.mapToView, nur ohne Verschiebung). */
function rotateDirection(dx: number, dy: number, rotation: number): [number, number] {
    switch (rotation) {
        case 1: return [-dy, dx];
        case 2: return [-dx, -dy];
        case 3: return [dy, -dx];
        default: return [dx, dy];
    }
}

/*
 * Kontext so umstellen, dass man in Ansichts-Kachelkoordinaten (u, v) zeichnen kann, flach auf dem Boden
 * bzw. in der Höhe lift. Danach ist (0, 0) der Punkt (x, y − lift), eine Einheit eine Kachel.
 */
function enterGroundPlane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lift: number): void {
    ctx.save();
    ctx.translate(x, y - lift);
    ctx.transform(w / 2, w / 4, -w / 2, w / 4, 0, 0);
}

/** Was wir von einem Sprite der Simulation brauchen (baseSprite.js). */
export interface SpriteLike {
    readonly type: number;
    readonly frame: number;
    /** Dorfplaner: Flughöhe 0 … 1 (Flugzeug beim Start und Anflug, Hubschrauber beim Landen) */
    readonly altitude?: number;
    /** Dorfplaner: Position vor dem letzten Schritt, Zeitpunkt und Dauer – für weiches Überblenden */
    readonly shownFromX?: number;
    readonly shownFromY?: number;
    readonly movedAt?: number;
    readonly moveInterval?: number;
    readonly x: number;
    readonly y: number;
    readonly xOffset: number;
    readonly yOffset: number;
    readonly width: number;
}

/** Mittelpunkt eines Sprites in Kartenkoordinaten (Kacheln). Sprites rechnen in Pixeln der Draufsicht (16 je Kachel). */
export function spriteCentre(sprite: SpriteLike, now = 0): { x: number, y: number } {
    const shown = interpolatedPosition(sprite, now);
    return {
        x: (shown.x + sprite.xOffset + sprite.width / 2) / 16,
        y: (shown.y + sprite.yOffset + sprite.width / 2) / 16,
    };
}

/*
 * Dorfplaner: Die Simulation bewegt Fahrzeuge in Schritten (Flugzeug 8 Pixel alle 180 ms). Für die Anzeige
 * blenden wir zwischen alter und neuer Position über, damit die Bewegung weich wirkt. Große Sprünge
 * (z. B. neues Fahrzeug) werden nicht überblendet. now = 0 heißt: keine Überblendung.
 */
export function interpolatedPosition(sprite: SpriteLike, now: number): { x: number, y: number } {
    if (now === 0 || sprite.shownFromX === undefined || sprite.shownFromY === undefined ||
        sprite.movedAt === undefined || !sprite.moveInterval) {
        return { x: sprite.x, y: sprite.y };
    }
    const dx = sprite.x - sprite.shownFromX;
    const dy = sprite.y - sprite.shownFromY;
    if (Math.abs(dx) > 32 || Math.abs(dy) > 32) {
        return { x: sprite.x, y: sprite.y };
    }
    const t = Math.max(0, Math.min(1, (now - sprite.movedAt) / sprite.moveInterval));
    return { x: sprite.shownFromX + dx * t, y: sprite.shownFromY + dy * t };
}

/** Wie hoch über dem Boden fliegt ein Sprite? (in Rautenbreiten) */
export function flightHeight(type: number): number {
    switch (type) {
        case AIRPLANE: return 0.9;
        case HELICOPTER: return 0.6;
        default: return 0;
    }
}

function fillPolygon(ctx: CanvasRenderingContext2D, points: Array<{ x: number, y: number }>, colour: string): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string): void {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
}

/** Flugzeug flach in der Flughöhe, Nase in Flugrichtung (Winkel in Ansichts-Kachelkoordinaten). */
function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lift: number, angle: number): void {
    enterGroundPlane(ctx, x, y, w, lift);
    ctx.rotate(angle);
    // Rumpf, Tragflächen, Leitwerk – Länge etwa 1,2 Kacheln
    fillPolygon(ctx, [{ x: 0.62, y: 0 }, { x: 0.5, y: -0.07 }, { x: -0.55, y: -0.07 }, { x: -0.62, y: 0 },
                      { x: -0.55, y: 0.07 }, { x: 0.5, y: 0.07 }], "#f7f7f7");
    fillPolygon(ctx, [{ x: 0.15, y: -0.06 }, { x: -0.12, y: -0.6 }, { x: -0.25, y: -0.6 }, { x: -0.08, y: -0.06 },
                      { x: -0.08, y: 0.06 }, { x: -0.25, y: 0.6 }, { x: -0.12, y: 0.6 }, { x: 0.15, y: 0.06 }], "#dcdcdc");
    fillPolygon(ctx, [{ x: -0.45, y: -0.05 }, { x: -0.58, y: -0.25 }, { x: -0.64, y: -0.25 }, { x: -0.58, y: 0 },
                      { x: -0.64, y: 0.25 }, { x: -0.58, y: 0.25 }, { x: -0.45, y: 0.05 }], "#2c7fb8");
    fillPolygon(ctx, [{ x: 0.5, y: -0.05 }, { x: 0.6, y: 0 }, { x: 0.5, y: 0.05 }], "#2c7fb8");
    ctx.restore();
}

/** Hubschrauber in Flugrichtung: Rumpf mit Kanzel vorn, Heckausleger hinten, darüber der Rotor. */
function drawHelicopter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lift: number,
                        angle: number): void {
    enterGroundPlane(ctx, x, y, w, lift);
    ctx.rotate(angle);
    fillPolygon(ctx, [{ x: -0.08, y: -0.02 }, { x: -0.42, y: -0.015 }, { x: -0.42, y: 0.015 }, { x: -0.08, y: 0.02 }],
                "#c98a2b");                                                                   // Heckausleger
    fillPolygon(ctx, [{ x: -0.4, y: 0 }, { x: -0.46, y: -0.08 }, { x: -0.44, y: 0.08 }], "#c98a2b");   // Leitwerk
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.16, 0.09, 0, 0, Math.PI * 2);                                         // Rumpf
    ctx.fillStyle = "#e1a33b";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.09, 0, 0.07, 0.06, 0, 0, Math.PI * 2);                                      // Kanzel
    ctx.fillStyle = "#9fc6e8";
    ctx.fill();
    ctx.restore();

    // Rotor etwas höher, dreht sich gleichmäßig
    enterGroundPlane(ctx, x, y, w, lift + w * 0.06);
    ctx.rotate((Date.now() / 70) % (Math.PI * 2));
    ctx.strokeStyle = "rgba(40, 40, 40, 0.85)";
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(-0.32, 0);
    ctx.lineTo(0.32, 0);
    ctx.moveTo(0, -0.32);
    ctx.lineTo(0, 0.32);
    ctx.stroke();
    ctx.restore();
}

/*
 * Schiff in Fahrtrichtung: Rumpf mit spitzem Bug, Deck, Container in Reihen, hinten die Brücke mit Schornstein.
 * Die Höhen entstehen durch flache Ebenen übereinander (je etwas nach oben versetzt).
 */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, angle: number): void {
    const layer = (lift: number, draw: () => void) => {
        enterGroundPlane(ctx, x, y, w, lift);
        ctx.rotate(angle);
        draw();
        ctx.restore();
    };
    const hull = [{ x: 0.55, y: 0 }, { x: 0.38, y: -0.14 }, { x: -0.45, y: -0.14 }, { x: -0.5, y: -0.1 },
                  { x: -0.5, y: 0.1 }, { x: -0.45, y: 0.14 }, { x: 0.38, y: 0.14 }];
    // Bugwelle und Kielwasser
    layer(0, () => {
        fillPolygon(ctx, [{ x: 0.6, y: 0 }, { x: 0.3, y: -0.22 }, { x: -0.8, y: -0.2 }, { x: -0.8, y: 0.2 },
                          { x: 0.3, y: 0.22 }], "rgba(255, 255, 255, 0.22)");
    });
    // Rumpf in mehreren Ebenen, damit er Höhe bekommt (unten dunkel, oben rot abgesetzt)
    for (let i = 0; i <= 3; i++) {
        layer(w * 0.012 * i, () => fillPolygon(ctx, hull, i < 3 ? "#26303a" : "#a8322c"));
    }
    layer(w * 0.05, () => {
        fillPolygon(ctx, hull.map((p) => ({ x: p.x * 0.94, y: p.y * 0.85 })), "#7d8a94");    // Deck
    });
    // Container in zwei Lagen
    const colours = ["#c0392b", "#2c7fb8", "#e1a33b", "#27ae60", "#8e44ad", "#d35400"];
    let k = 0;
    for (let row = 0; row < 4; row++) {
        for (const side of [-0.06, 0.06]) {
            const cx = 0.25 - row * 0.14;
            const colour = colours[k++ % colours.length];
            for (let level = 0; level < 2; level++) {
                layer(w * (0.06 + level * 0.03), () => {
                    fillPolygon(ctx, [{ x: cx - 0.06, y: side - 0.05 }, { x: cx + 0.06, y: side - 0.05 },
                                      { x: cx + 0.06, y: side + 0.05 }, { x: cx - 0.06, y: side + 0.05 }],
                                level === 0 ? "rgba(0, 0, 0, 0.35)" : colour);
                });
            }
        }
    }
    // Brücke hinten und Schornstein
    for (let i = 0; i < 4; i++) {
        layer(w * (0.06 + i * 0.025), () => {
            fillPolygon(ctx, [{ x: -0.42, y: -0.1 }, { x: -0.3, y: -0.1 }, { x: -0.3, y: 0.1 }, { x: -0.42, y: 0.1 }],
                        i === 3 ? "#f4f4f4" : "#d9dde0");
        });
    }
    layer(w * 0.15, () => {
        fillPolygon(ctx, [{ x: -0.4, y: -0.03 }, { x: -0.35, y: -0.03 }, { x: -0.35, y: 0.03 }, { x: -0.4, y: 0.03 }],
                    "#c0392b");
    });
}

/** Zug in Richtung der Schiene: zwei Wagen hintereinander, flach gezeichnet mit Dach und Seitenwand. */
function drawOrientedTrain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, du: number, dv: number): void {
    const length = Math.sqrt(du * du + dv * dv) || 1;
    const ax = du / length;
    const ay = dv / length;
    const height = w * 0.11;
    for (const offset of [-0.22, 0.22]) {
        // Wagenkasten: Boden-Rechteck entlang der Achse, Dach um height nach oben versetzt
        const cu = ax * offset;
        const cv = ay * offset;
        const corners = [[0.2, 0.09], [0.2, -0.09], [-0.2, -0.09], [-0.2, 0.09]].map(([a, b]) => ({
            u: cu + ax * a - ay * b,
            v: cv + ay * a + ax * b,
        }));
        const toScreen = (u: number, v: number, z: number) => ({ x: x + (u - v) * w / 2, y: y + (u + v) * w / 4 - z });
        const bottom = corners.map((c) => toScreen(c.u, c.v, 0));
        const top = corners.map((c) => toScreen(c.u, c.v, height));
        // Seitenwände: die beiden, die nach vorn (zum Betrachter) zeigen
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            const facesViewer = (bottom[i].y + bottom[j].y) / 2 >= (bottom[0].y + bottom[2].y) / 2;
            if (facesViewer) {
                fillPolygon(ctx, [bottom[i], bottom[j], top[j], top[i]], i % 2 === 0 ? "#7a2723" : "#a5352f");
            }
        }
        fillPolygon(ctx, top, "#5c5c5c");
    }
}

/**
 * Zeichnet ein Sprite. (x, y) ist der Punkt auf dem Boden unter dem Sprite (Bildschirmpixel),
 * w die Rautenbreite der Zoomstufe.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: SpriteLike, x: number, y: number, w: number,
                           rotation = 0): void {
    const lift = flightHeight(sprite.type) * w * (sprite.altitude === undefined ? 1 : Math.max(0.05, sprite.altitude));
    if (lift > 0) {
        // Schatten auf dem Boden, damit man sieht, wo das Fluggerät gerade ist
        ellipse(ctx, x, y, w * 0.18, w * 0.07, "rgba(0, 0, 0, 0.25)");
    }

    switch (sprite.type) {
        case TRAIN: {
            if (sprite.frame === 5) {
                break;   // unter Wasser (Tunnel): nicht sichtbar
            }
            const axis = TRAIN_AXIS[sprite.frame] || [1, 0];
            const [du, dv] = rotateDirection(axis[0], axis[1], rotation);
            drawOrientedTrain(ctx, x, y, w, du, dv);
            break;
        }

        case SHIP: {
            const heading = FLIGHT_HEADING[sprite.frame] || [1, 0];
            const [du, dv] = rotateDirection(heading[0], heading[1], rotation);
            drawShip(ctx, x, y, w, Math.atan2(dv, du));
            break;
        }

        case AIRPLANE: {
            const heading = FLIGHT_HEADING[sprite.frame] || [1, 0];
            const [du, dv] = rotateDirection(heading[0], heading[1], rotation);
            drawPlane(ctx, x, y, w, lift, Math.atan2(dv, du));
            break;
        }

        case HELICOPTER: {
            // Der Hubschrauber zeigt in Flugrichtung (Bildnummer wie beim Flugzeug: 1–8 = N … NW)
            const heading = FLIGHT_HEADING[sprite.frame] || [1, 0];
            const [du, dv] = rotateDirection(heading[0], heading[1], rotation);
            drawHelicopter(ctx, x, y, w, lift, Math.atan2(dv, du));
            break;
        }

        case MONSTER: {
            // Ein freundlich-gruseliger grüner Klops – eigene Figur, keine Vorlage
            const bob = (sprite.frame % 2) * w * 0.03;
            ellipse(ctx, x, y, w * 0.28, w * 0.12, "rgba(0, 0, 0, 0.25)");
            ellipse(ctx, x, y - w * 0.35 - bob, w * 0.26, w * 0.36, "#3f9b48");
            ellipse(ctx, x, y - w * 0.3 - bob, w * 0.16, w * 0.2, "#7cc26f");
            ellipse(ctx, x - w * 0.08, y - w * 0.55 - bob, w * 0.05, w * 0.05, "#ffffff");
            ellipse(ctx, x + w * 0.08, y - w * 0.55 - bob, w * 0.05, w * 0.05, "#ffffff");
            ellipse(ctx, x - w * 0.08, y - w * 0.55 - bob, w * 0.02, w * 0.025, "#222");
            ellipse(ctx, x + w * 0.08, y - w * 0.55 - bob, w * 0.02, w * 0.025, "#222");
            break;
        }

        case TORNADO: {
            // Trichter aus übereinanderliegenden Ellipsen, die nach oben breiter werden und sich drehen
            for (let i = 0; i < 7; i++) {
                const sway = Math.sin((sprite.frame + i) * 0.9) * w * 0.04;
                ellipse(ctx, x + sway, y - i * w * 0.1, w * (0.05 + i * 0.035), w * (0.02 + i * 0.012),
                        "rgba(110, 110, 110, " + (0.75 - i * 0.07) + ")");
            }
            break;
        }

        case EXPLOSION: {
            const size = (1 + (sprite.frame % 6)) * w * 0.06;
            ellipse(ctx, x, y - size * 0.6, size * 1.4, size, "rgba(240, 138, 36, 0.8)");
            ellipse(ctx, x, y - size * 0.6, size * 0.8, size * 0.6, "rgba(255, 210, 63, 0.9)");
            break;
        }
    }
}
