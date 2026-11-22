/* Dorfplaner – Unit-Tests für die isometrischen Rechenfunktionen (src/iso/projection.ts).
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

import {
    forEachTileBackToFront, GridSize, mapToView, pickCandidates, projectToScreen, Rotation, screenToView,
    screenToViewFraction, tileHeightFor, viewSize, ViewParams, visibleViewRect, viewToMap,
} from "../../src/iso/projection";

const MAP: GridSize = { width: 120, height: 100 };
const ROTATIONS: Rotation[] = [0, 1, 2, 3];
const VIEW: ViewParams = { heightStep: 8, originX: 500, originY: 300, tileWidth: 64 };

// Kleiner, vorhersagbarer Zufallsgenerator, damit die Tests immer gleich ablaufen.
function makeRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

// Ein zufälliger Punkt im Inneren der Raute, deren obere Spitze bei (top.x, top.y) liegt.
function randomPointInDiamond(top: { x: number, y: number }, tileWidth: number, random: () => number) {
    const halfWidth = tileWidth / 2;
    const halfHeight = tileHeightFor(tileWidth) / 2;
    for (;;) {
        const u = (random() * 2 - 1) * halfWidth;
        const v = (random() * 2 - 1) * halfHeight;
        // Raute: |u| / halbe Breite + |v| / halbe Höhe < 1 (mit etwas Abstand zum Rand)
        if (Math.abs(u) / halfWidth + Math.abs(v) / halfHeight < 0.98) {
            return { x: top.x + u, y: top.y + halfHeight + v };
        }
    }
}

describe("isometric projection", () => {

    describe("tile height", () => {
        it("should be half the tile width", () => {
            expect(tileHeightFor(64)).toBe(32);
            expect(tileHeightFor(32)).toBe(16);
        });
    });

    describe("view size", () => {
        it("should keep width and height for 0° and 180°", () => {
            expect(viewSize(MAP, 0)).toEqual({ width: 120, height: 100 });
            expect(viewSize(MAP, 2)).toEqual({ width: 120, height: 100 });
        });

        it("should swap width and height for 90° and 270°", () => {
            expect(viewSize(MAP, 1)).toEqual({ width: 100, height: 120 });
            expect(viewSize(MAP, 3)).toEqual({ width: 100, height: 120 });
        });
    });

    describe("rotation", () => {
        it("should not change coordinates without rotation", () => {
            expect(mapToView(7, 3, MAP, 0)).toEqual({ x: 7, y: 3 });
        });

        it("should move the map corners to the expected view corners", () => {
            // Ecke oben links der Karte (0, 0) nach jeder Drehung
            expect(mapToView(0, 0, MAP, 1)).toEqual({ x: 99, y: 0 });
            expect(mapToView(0, 0, MAP, 2)).toEqual({ x: 119, y: 99 });
            expect(mapToView(0, 0, MAP, 3)).toEqual({ x: 0, y: 119 });
        });

        it("should map every tile into the view and back again for every rotation", () => {
            for (const rotation of ROTATIONS) {
                const size = viewSize(MAP, rotation);
                for (let x = 0; x < MAP.width; x++) {
                    for (let y = 0; y < MAP.height; y++) {
                        const view = mapToView(x, y, MAP, rotation);
                        expect(view.x >= 0 && view.x < size.width && view.y >= 0 && view.y < size.height).toBe(true);
                        expect(viewToMap(view.x, view.y, MAP, rotation)).toEqual({ x, y });
                    }
                }
            }
        });

        it("should map different tiles to different view positions", () => {
            for (const rotation of ROTATIONS) {
                const seen: { [key: string]: boolean } = {};
                for (let x = 0; x < MAP.width; x++) {
                    for (let y = 0; y < MAP.height; y++) {
                        const view = mapToView(x, y, MAP, rotation);
                        const key = view.x + "," + view.y;
                        expect(seen[key]).toBeUndefined();
                        seen[key] = true;
                    }
                }
            }
        });

        it("should reject an invalid rotation", () => {
            expect(() => mapToView(0, 0, MAP, 4 as Rotation)).toThrow();
            expect(() => viewToMap(0, 0, MAP, 4 as Rotation)).toThrow();
        });
    });

    describe("projection to the screen", () => {
        it("should put tile (0, 0) at the origin", () => {
            expect(projectToScreen(0, 0, 0, VIEW)).toEqual({ x: 500, y: 300 });
        });

        it("should step half a tile right and down for +1 in vx", () => {
            expect(projectToScreen(1, 0, 0, VIEW)).toEqual({ x: 532, y: 316 });
        });

        it("should step half a tile left and down for +1 in vy", () => {
            expect(projectToScreen(0, 1, 0, VIEW)).toEqual({ x: 468, y: 316 });
        });

        it("should lift the tile by one height step per level", () => {
            expect(projectToScreen(0, 0, 3, VIEW)).toEqual({ x: 500, y: 276 });
        });
    });

    describe("screen to view", () => {
        it("should invert the projection exactly at the top corner", () => {
            const top = projectToScreen(17, 42, 5, VIEW);
            const back = screenToViewFraction(top.x, top.y, 5, VIEW);
            expect(back.x).toBeCloseTo(17);
            expect(back.y).toBeCloseTo(42);
        });

        it("should find the tile for the centre of every diamond, flat and raised", () => {
            for (const height of [0, 7, 15]) {
                for (let vx = 0; vx < MAP.width; vx += 7) {
                    for (let vy = 0; vy < MAP.height; vy += 5) {
                        const top = projectToScreen(vx, vy, height, VIEW);
                        const centreY = top.y + tileHeightFor(VIEW.tileWidth) / 2;
                        expect(screenToView(top.x, centreY, height, VIEW)).toEqual({ x: vx, y: vy });
                    }
                }
            }
        });

        it("should find the tile for random points inside the diamond at all zoom levels", () => {
            const random = makeRandom(1);
            for (const tileWidth of [32, 64, 128]) {
                const view: ViewParams = { heightStep: tileWidth / 8, originX: 500, originY: 300, tileWidth };
                for (let i = 0; i < 3000; i++) {
                    const vx = Math.floor(random() * MAP.width);
                    const vy = Math.floor(random() * MAP.height);
                    const height = Math.floor(random() * 16);
                    const point = randomPointInDiamond(projectToScreen(vx, vy, height, view), tileWidth, random);
                    expect(screenToView(point.x, point.y, height, view)).toEqual({ x: vx, y: vy });
                }
            }
        });
    });

    describe("pick candidates", () => {
        it("should list candidates from front to back", () => {
            const random = makeRandom(2);
            for (let i = 0; i < 500; i++) {
                const candidates = pickCandidates(random() * 4000 - 2000, random() * 4000, 15, VIEW,
                                                  viewSize(MAP, 0));
                for (let j = 1; j < candidates.length; j++) {
                    const front = candidates[j - 1].x + candidates[j - 1].y;
                    const back = candidates[j].x + candidates[j].y;
                    expect(front).toBeGreaterThanOrEqual(back);
                }
            }
        });

        it("should contain the raised tile that was drawn under the point", () => {
            const top = projectToScreen(30, 40, 6, VIEW);
            const point = { x: top.x, y: top.y + tileHeightFor(VIEW.tileWidth) / 2 };
            const candidates = pickCandidates(point.x, point.y, 15, VIEW, viewSize(MAP, 0));
            expect(candidates).toContainEqual({ x: 30, y: 40 });
        });

        it("should end with the flat tile under the point", () => {
            const top = projectToScreen(30, 40, 0, VIEW);
            const candidates = pickCandidates(top.x, top.y + 16, 15, VIEW, viewSize(MAP, 0));
            expect(candidates[candidates.length - 1]).toEqual({ x: 30, y: 40 });
        });

        it("should leave out tiles outside the map and duplicates", () => {
            const candidates = pickCandidates(-100000, -100000, 15, VIEW, viewSize(MAP, 0));
            expect(candidates).toEqual([]);

            const top = projectToScreen(5, 5, 0, VIEW);
            const list = pickCandidates(top.x, top.y + 16, 15, VIEW, viewSize(MAP, 0));
            const seen: { [key: string]: boolean } = {};
            for (const c of list) {
                const key = c.x + "," + c.y;
                expect(seen[key]).toBeUndefined();
                seen[key] = true;
            }
        });
    });

    describe("visible area", () => {
        // Prüfung „mit roher Gewalt“: Jede Kachel, deren Raute (auf irgendeiner Höhe bis maxHeight) den
        // Bildschirm berührt, muss im berechneten Rechteck liegen.
        function diamondTouchesScreen(vx: number, vy: number, view: ViewParams, height: number,
                                      screenWidth: number, screenHeight: number): boolean {
            const top = projectToScreen(vx, vy, height, view);
            const left = top.x - view.tileWidth / 2;
            const right = top.x + view.tileWidth / 2;
            const bottom = top.y + tileHeightFor(view.tileWidth);
            return right > 0 && left < screenWidth && bottom > 0 && top.y < screenHeight;
        }

        it("should include every tile whose diamond touches the screen", () => {
            const size = viewSize(MAP, 0);
            for (const origin of [{ x: 500, y: 300 }, { x: -1500, y: -900 }, { x: 3000, y: -200 }]) {
                const view: ViewParams = { heightStep: 8, originX: origin.x, originY: origin.y, tileWidth: 64 };
                const rect = visibleViewRect(1024, 768, 15, 0, view, size);
                for (let vx = 0; vx < size.width; vx++) {
                    for (let vy = 0; vy < size.height; vy++) {
                        for (const height of [0, 15]) {
                            if (diamondTouchesScreen(vx, vy, view, height, 1024, 768)) {
                                expect(rect).not.toBeNull();
                                const inside = rect !== null && vx >= rect.minX && vx <= rect.maxX &&
                                               vy >= rect.minY && vy <= rect.maxY;
                                expect(inside).toBe(true);
                            }
                        }
                    }
                }
            }
        });

        it("should stay within the map", () => {
            const rect = visibleViewRect(1024, 768, 15, 200, VIEW, viewSize(MAP, 0));
            expect(rect).not.toBeNull();
            if (rect !== null) {
                expect(rect.minX).toBeGreaterThanOrEqual(0);
                expect(rect.minY).toBeGreaterThanOrEqual(0);
                expect(rect.maxX).toBeLessThanOrEqual(119);
                expect(rect.maxY).toBeLessThanOrEqual(99);
            }
        });

        it("should return null when the map is completely off screen", () => {
            const farAway: ViewParams = { heightStep: 8, originX: -100000, originY: -100000, tileWidth: 64 };
            expect(visibleViewRect(1024, 768, 15, 0, farAway, viewSize(MAP, 0))).toBeNull();
        });
    });

    describe("back to front order", () => {
        it("should visit every tile of the rectangle exactly once", () => {
            const rect = { maxX: 9, maxY: 6, minX: 3, minY: 2 };
            const visited: { [key: string]: number } = {};
            forEachTileBackToFront(rect, (vx, vy) => {
                const key = vx + "," + vy;
                visited[key] = (visited[key] || 0) + 1;
            });
            for (let vx = 3; vx <= 9; vx++) {
                for (let vy = 2; vy <= 6; vy++) {
                    expect(visited[vx + "," + vy]).toBe(1);
                }
            }
            expect(Object.keys(visited).length).toBe(7 * 5);
        });

        it("should never go back to a tile further back", () => {
            let lastDepth = -Infinity;
            forEachTileBackToFront({ maxX: 20, maxY: 15, minX: 0, minY: 0 }, (vx, vy) => {
                expect(vx + vy).toBeGreaterThanOrEqual(lastDepth);
                lastDepth = vx + vy;
            });
        });
    });
});
