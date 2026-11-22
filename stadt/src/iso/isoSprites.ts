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
    readonly x: number;
    readonly y: number;
    readonly xOffset: number;
    readonly yOffset: number;
    readonly width: number;
}

/** Mittelpunkt eines Sprites in Kartenkoordinaten (Kacheln). Sprites rechnen in Pixeln der Draufsicht (16 je Kachel). */
export function spriteCentre(sprite: SpriteLike): { x: number, y: number } {
    return {
        x: (sprite.x + sprite.xOffset + sprite.width / 2) / 16,
        y: (sprite.y + sprite.yOffset + sprite.width / 2) / 16,
    };
}

/** Wie hoch über dem Boden fliegt ein Sprite? (in Rautenbreiten) */
export function flightHeight(type: number): number {
    switch (type) {
        case AIRPLANE: return 0.9;
        case HELICOPTER: return 0.6;
        default: return 0;
    }
}

/*
 * Ein Punkt neben (x, y) auf dem Bildschirm: du Kacheln in Ansichtsrichtung +vx, dv in Richtung +vy,
 * z Pixel nach oben. Damit lassen sich kleine schräge Quader zeichnen.
 */
function offset(x: number, y: number, tileWidth: number, du: number, dv: number, z: number) {
    return { x: x + (du - dv) * tileWidth / 2, y: y + (du + dv) * tileWidth / 4 - z };
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

/** Quader um den Punkt (x, y), halbe Kantenlängen a (Richtung vx) und b (Richtung vy), Höhe h, ab Höhe z0. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, a: number, b: number, z0: number,
             h: number, colour: string, roof: string): void {
    const p = (du: number, dv: number, z: number) => offset(x, y, w, du, dv, z);
    // rechte Wand: Farbe, darüber Schatten; linke Wand: Farbe, darüber leichter Schatten; dann das Dach
    fillPolygon(ctx, [p(a, -b, z0), p(a, b, z0), p(a, b, z0 + h), p(a, -b, z0 + h)], colour);
    fillPolygon(ctx, [p(a, -b, z0), p(a, b, z0), p(a, b, z0 + h), p(a, -b, z0 + h)], "rgba(0, 0, 0, 0.35)");
    fillPolygon(ctx, [p(-a, b, z0), p(a, b, z0), p(a, b, z0 + h), p(-a, b, z0 + h)], colour);
    fillPolygon(ctx, [p(-a, b, z0), p(a, b, z0), p(a, b, z0 + h), p(-a, b, z0 + h)], "rgba(0, 0, 0, 0.15)");
    fillPolygon(ctx, [p(-a, -b, z0 + h), p(a, -b, z0 + h), p(a, b, z0 + h), p(-a, b, z0 + h)], roof);
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
    const lift = flightHeight(sprite.type) * w;
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

        case SHIP:
            box(ctx, x, y, w, 0.42, 0.18, 0, w * 0.06, "#3c4650", "#59636d");
            box(ctx, x, y, w, 0.12, 0.1, w * 0.06, w * 0.1, "#f2f2f2", "#d0d0d0");
            break;

        case AIRPLANE: {
            const heading = FLIGHT_HEADING[sprite.frame] || [1, 0];
            const [du, dv] = rotateDirection(heading[0], heading[1], rotation);
            drawPlane(ctx, x, y, w, lift, Math.atan2(dv, du));
            break;
        }

        case HELICOPTER: {
            const c = { x, y: y - lift };
            ellipse(ctx, c.x, c.y, w * 0.13, w * 0.09, "#e1a33b");
            fillPolygon(ctx, [{ x: c.x + w * 0.1, y: c.y - w * 0.02 }, { x: c.x + w * 0.3, y: c.y - w * 0.04 },
                              { x: c.x + w * 0.1, y: c.y + w * 0.03 }], "#c98a2b");   // Heckausleger
            ellipse(ctx, c.x - w * 0.05, c.y - w * 0.01, w * 0.05, w * 0.04, "#9fc6e8");
            // Rotor dreht sich mit dem Animationsbild
            const angle = (Date.now() / 60) % (Math.PI * 2);   // Rotor dreht sich gleichmäßig
            ctx.strokeStyle = "#333";
            ctx.lineWidth = Math.max(1, w / 48);
            ctx.beginPath();
            ctx.moveTo(c.x - Math.cos(angle) * w * 0.28, c.y - w * 0.1 - Math.sin(angle) * w * 0.07);
            ctx.lineTo(c.x + Math.cos(angle) * w * 0.28, c.y - w * 0.1 + Math.sin(angle) * w * 0.07);
            ctx.stroke();
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
