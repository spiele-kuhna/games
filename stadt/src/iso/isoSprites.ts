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

/**
 * Zeichnet ein Sprite. (x, y) ist der Punkt auf dem Boden unter dem Sprite (Bildschirmpixel),
 * w die Rautenbreite der Zoomstufe.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: SpriteLike, x: number, y: number, w: number): void {
    const lift = flightHeight(sprite.type) * w;
    if (lift > 0) {
        // Schatten auf dem Boden, damit man sieht, wo das Fluggerät gerade ist
        ellipse(ctx, x, y, w * 0.18, w * 0.07, "rgba(0, 0, 0, 0.25)");
    }

    switch (sprite.type) {
        case TRAIN:
            box(ctx, x, y, w, 0.32, 0.14, 0, w * 0.12, "#8e2f2a", "#5c5c5c");
            break;

        case SHIP:
            box(ctx, x, y, w, 0.42, 0.18, 0, w * 0.06, "#3c4650", "#59636d");
            box(ctx, x, y, w, 0.12, 0.1, w * 0.06, w * 0.1, "#f2f2f2", "#d0d0d0");
            break;

        case AIRPLANE: {
            const c = { x, y: y - lift };
            ellipse(ctx, c.x, c.y, w * 0.2, w * 0.05, "#f4f4f4");
            fillPolygon(ctx, [{ x: c.x - w * 0.04, y: c.y - w * 0.16 }, { x: c.x + w * 0.05, y: c.y },
                              { x: c.x - w * 0.04, y: c.y + w * 0.16 }], "#d8d8d8");
            ellipse(ctx, c.x + w * 0.16, c.y, w * 0.04, w * 0.03, "#2c7fb8");
            break;
        }

        case HELICOPTER: {
            const c = { x, y: y - lift };
            ellipse(ctx, c.x, c.y, w * 0.1, w * 0.07, "#e1a33b");
            ellipse(ctx, c.x - w * 0.03, c.y - w * 0.01, w * 0.04, w * 0.03, "#9fc6e8");
            // Rotor dreht sich mit dem Animationsbild
            const angle = sprite.frame * Math.PI / 4;
            ctx.strokeStyle = "#333";
            ctx.lineWidth = Math.max(1, w / 48);
            ctx.beginPath();
            ctx.moveTo(c.x - Math.cos(angle) * w * 0.18, c.y - w * 0.08 - Math.sin(angle) * w * 0.05);
            ctx.lineTo(c.x + Math.cos(angle) * w * 0.18, c.y - w * 0.08 + Math.sin(angle) * w * 0.05);
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
