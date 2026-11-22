/* Dorfplaner – Wasserversorgung.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Spielregeln der Wasserversorgung als reine Rechenfunktionen – ohne Karte und ohne DOM, deshalb mit Unit-Tests
 * prüfbar (test/water/waterRules.ts). Die Anbindung an die Simulation steht in waterManager.js.
 *
 * Kurz:
 *  - Pumpen (brauchen Strom) liefern Wasser, direkt am Fluss oder See doppelt so viel.
 *  - Wassertürme speichern Überschuss und geben ihn bei Engpässen wieder ab.
 *  - Wasser fließt durch Rohre und durch Gebäude; jede Gebäudekachel verbraucht eine Einheit.
 *  - Zonen ohne Wasser wachsen nur bis zur mittleren Stufe; dichtere Zonen schrumpfen nach einer Schonfrist.
 */

/** Leistung einer Pumpe mit Strom (Kacheln, die sie versorgen kann) */
export const PUMP_CAPACITY = 150;
/** Leistung einer Pumpe, die direkt an Wasser grenzt */
export const PUMP_CAPACITY_AT_WATER = 300;
/** So viele Einheiten fasst ein Wasserturm */
export const TOWER_STORAGE = 600;
/** Schonfrist bis zum Rückbau: ein Spieljahr (die Simulation zählt 48 Schritte je Jahr) */
export const GRACE_PERIOD = 48;

/** Baukosten */
export const PIPE_COST = 5;
export const PIPE_COST_UNDER_WATER = 25;
export const PUMP_COST = 300;
export const TOWER_COST = 250;

export type ZoneKind = "residential" | "commercial" | "industrial";

/*
 * Höchster Bevölkerungswert einer Zone ohne Wasser – „mittlere Stufe“ = Stufe 1.
 * Bevölkerungswerte wie in getZonePopulation() von residential.js, commercial.js, industrial.js:
 *  - Wohnen: Einzelhäuser bis 8, danach Blöcke Stufe 0 … 3 mit 24, 32, 40, 48 → Grenze 32
 *  - Gewerbe: Stufe 0 … 4 mit 1 … 5 → Grenze 2
 *  - Industrie: Stufe 0 … 3 mit 1 … 4 → Grenze 2
 */
export const MAX_POPULATION_WITHOUT_WATER: { [kind in ZoneKind]: number } = {
    commercial: 2,
    industrial: 2,
    residential: 32,
};

/** Stufe eines Wohnblocks aus dem Bevölkerungswert (24 → 0 … 48 → 3); −1 = noch Einzelhäuser */
export function residentialLevel(population: number): number {
    return population >= 24 ? Math.floor((population - 24) / 8) : -1;
}

/*
 * Zielstufe beim Wachsen eines Wohnblocks. Das Original rechnet floor(Bevölkerung / 8) − 1 und springt dadurch
 * von Stufe 0 auf 2 bzw. von 1 auf 3 (Fehler im Original, hier nicht verändert). Ohne Wasser wird das Ziel auf
 * Stufe 1 begrenzt.
 */
export function residentialGrowthTarget(population: number, watered: boolean): number {
    const original = Math.floor(population / 8) - 1;
    return watered ? original : Math.min(original, 1);
}

/** Leistung einer Pumpe: ohne Strom nichts, am Wasser doppelt. */
export function pumpCapacity(powered: boolean, nextToWater: boolean): number {
    if (!powered) {
        return 0;
    }
    return nextToWater ? PUMP_CAPACITY_AT_WATER : PUMP_CAPACITY;
}

/** Darf die Zone noch eine Stufe wachsen? Mit Wasser immer, ohne Wasser nur bis zur Grenze. */
export function mayGrow(kind: ZoneKind, population: number, watered: boolean): boolean {
    return watered || population < MAX_POPULATION_WITHOUT_WATER[kind];
}

/** Soll die Zone (gelegentlich) eine Stufe zurückfallen? Nur ohne Wasser, über der Grenze und nach der Schonfrist. */
export function shouldShrink(kind: ZoneKind, population: number, watered: boolean, cityTime: number,
                             graceUntil: number): boolean {
    return !watered && population > MAX_POPULATION_WITHOUT_WATER[kind] && cityTime >= graceUntil;
}

export interface Balance {
    /** so viele Gebäudekacheln bekommen Wasser */
    supplied: number;
    /** neue Füllstände der Wassertürme */
    towerLevels: number[];
    /** true, wenn nicht alle versorgt werden konnten */
    shortage: boolean;
}

/**
 * Wasserbilanz eines zusammenhängenden Netzes:
 * Zuerst liefern die Pumpen. Reicht das nicht, geben die Türme ab (gleichmäßig). Bleibt bei den Pumpen etwas
 * übrig, füllen sich die Türme (gleichmäßig, jeder höchstens bis TOWER_STORAGE).
 */
export function balanceNetwork(pumpSupply: number, towerLevels: number[], demand: number): Balance {
    const fromPumps = Math.min(demand, pumpSupply);
    const missing = demand - fromPumps;
    const stored = towerLevels.reduce((sum, level) => sum + level, 0);
    const levels = towerLevels.slice();

    if (missing > 0) {
        const fromTowers = Math.min(missing, stored);
        // gleichmäßig abgeben: jeder Turm im Verhältnis zu seinem Füllstand
        let left = fromTowers;
        for (let i = 0; i < levels.length && stored > 0; i++) {
            const take = i === levels.length - 1 ? left : Math.min(left, Math.round(fromTowers * towerLevels[i] / stored));
            levels[i] -= Math.min(take, levels[i]);
            left -= Math.min(take, towerLevels[i]);
        }
        // Rundungsreste beim ersten Turm mit Inhalt abziehen
        for (let i = 0; i < levels.length && left > 0; i++) {
            const take = Math.min(left, levels[i]);
            levels[i] -= take;
            left -= take;
        }
        const supplied = fromPumps + fromTowers;
        return { shortage: supplied < demand, supplied, towerLevels: levels };
    }

    // Überschuss auffüllen: reihum, bis alles verteilt oder alle Türme voll sind
    let surplus = pumpSupply - fromPumps;
    while (surplus > 0) {
        const open = levels.map((_level, i) => i).filter((i) => levels[i] < TOWER_STORAGE);
        if (open.length === 0) {
            break;
        }
        const share = Math.max(1, Math.floor(surplus / open.length));
        for (const i of open) {
            const add = Math.min(share, TOWER_STORAGE - levels[i], surplus);
            levels[i] += add;
            surplus -= add;
            if (surplus <= 0) {
                break;
            }
        }
    }
    return { shortage: false, supplied: demand, towerLevels: levels };
}

/** Was auf einer Kachel für das Wassernetz zählt */
export const NOTHING = 0;
export const PIPE = 1;
export const CONSUMER = 2;   // Gebäudekachel: leitet weiter und verbraucht
export const SOURCE = 3;     // Pumpe oder Wasserturm

export interface WaterNetwork {
    /** Kachelnummern (y · Breite + x) der Pumpen und Türme */
    sources: number[];
    /** Kachelnummern der Verbraucher in der Reihenfolge, in der das Wasser sie erreicht */
    consumers: number[];
    /** alle Kacheln des Netzes (auch Rohre) */
    tiles: number[];
}

/**
 * Zusammenhängende Wassernetze suchen (Breitensuche, vier Richtungen). Ein Netz beginnt immer bei einer Pumpe oder
 * einem Turm; Kacheln, die von keiner Quelle aus erreichbar sind, gehören zu keinem Netz.
 */
export function findNetworks(width: number, height: number, kindAt: (x: number, y: number) => number): WaterNetwork[] {
    const kinds = new Array<number>(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            kinds[y * width + x] = kindAt(x, y);
        }
    }
    const visited = new Array<boolean>(width * height);
    const networks: WaterNetwork[] = [];

    for (let start = 0; start < kinds.length; start++) {
        if (kinds[start] !== SOURCE || visited[start]) {
            continue;
        }
        const network: WaterNetwork = { consumers: [], sources: [], tiles: [] };
        const queue = [start];
        visited[start] = true;
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            network.tiles.push(index);
            if (kinds[index] === SOURCE) {
                network.sources.push(index);
            } else if (kinds[index] === CONSUMER) {
                network.consumers.push(index);
            }
            const x = index % width;
            const y = Math.floor(index / width);
            const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1,
                                y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
            for (const next of neighbours) {
                if (next >= 0 && !visited[next] && kinds[next] !== NOTHING) {
                    visited[next] = true;
                    queue.push(next);
                }
            }
        }
        networks.push(network);
    }
    return networks;
}

/**
 * Rohrkarte fürs Speichern als kurzer Text: abwechselnd Längen von Abschnitten ohne und mit Rohr, beginnend mit
 * „ohne“, in Basis 36, durch Kommas getrennt. Beispiel: [0, 0, 1, 1, 1, 0] → "2,3,1".
 */
export function encodePipes(pipes: ArrayLike<number>): string {
    const runs: string[] = [];
    let current = 0;
    let length = 0;
    for (let i = 0; i < pipes.length; i++) {
        const value = pipes[i] ? 1 : 0;
        if (value === current) {
            length++;
        } else {
            runs.push(length.toString(36));
            current = value;
            length = 1;
        }
    }
    runs.push(length.toString(36));
    return runs.join(",");
}

/** Umkehrung von encodePipes. Kaputte oder zu kurze Texte ergeben eine Karte ohne (weitere) Rohre. */
export function decodePipes(text: string | undefined, size: number): number[] {
    const result = new Array<number>(size);
    for (let i = 0; i < size; i++) {
        result[i] = 0;
    }
    if (!text) {
        return result;
    }
    let position = 0;
    let value = 0;
    for (const part of text.split(",")) {
        const length = parseInt(part, 36);
        if (isNaN(length) || length < 0) {
            break;
        }
        for (let i = 0; i < length && position < size; i++) {
            result[position++] = value;
        }
        value = 1 - value;
    }
    return result;
}
