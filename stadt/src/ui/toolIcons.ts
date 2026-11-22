/* Dorfplaner – Werkzeugleiste mit Symbolen.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Selbst gezeichnete Symbole (SVG, 24 × 24) für die Werkzeugknöpfe. Gezeichnet wird mit „currentColor“, also in der
 * Schriftfarbe des Knopfs – damit passen sie zu den farbigen Knöpfen aus style.css.
 *
 * decorateToolButtons() ersetzt beim Start den Text der Knöpfe durch das Symbol. Der Text (z. B. „Wohnen 100 $“)
 * bleibt als Hinweis beim Darüberfahren (title) und für Bildschirmleser (aria-label) erhalten.
 */

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

export const TOOL_ICONS: { [tool: string]: string } = {
    airport: `<path ${F} d="M21 15.5v-2l-8-4.5V4a1.5 1.5 0 0 0-3 0v5L2 13.5v2l8-2.5v4.5l-2.5 2V21l4-1.2 4 1.2v-1.5l-2.5-2V13z"/>`,
    bulldozer: `<path ${S} d="M3 15h11v-4H9l-2-3H4v7"/><path ${S} d="M14 12h3l3 4v2"/><rect ${S} x="3" y="16" width="11" height="4" rx="2"/>` +
               `<path ${S} d="M20 18h2"/>`,
    coal: `<path ${S} d="M3 21V12l5 3V12l5 3V8h3v13z"/><path ${S} d="M16 8V4h3v17"/><path ${S} d="M17 3c1-1 3-1 4 0"/>`,
    commercial: `<rect ${S} x="4" y="3" width="16" height="18"/><path ${S} d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>` +
                `<path ${S} d="M10 21v-3h4v3"/>`,
    fire: `<path ${S} d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-8z"/>`,
    industrial: `<path ${S} d="M3 21V11l5 3v-3l5 3v-3l5 3V5h3v16z"/><path ${S} d="M7 18h2M12 18h2"/>`,
    nuclear: `<path ${S} d="M5 21c1.5-4 1.5-8 0-12h6c-1.5 4-1.5 8 0 12z"/><path ${S} d="M13 21c1.5-4 1.5-8 0-12h6c-1.5 4-1.5 8 0 12z"/>` +
             `<path ${S} d="M7 6c0-2 2-2 2-4M15 6c0-2 2-2 2-4"/>`,
    park: `<circle ${S} cx="12" cy="9" r="6"/><path ${S} d="M12 15v6M9 21h6"/>`,
    pipe: `<path ${S} d="M2 9h8a3 3 0 0 1 3 3v9"/><path ${S} d="M2 14h5a1 1 0 0 1 1 1v6"/>` +
          `<path ${F} d="M18 3s-3 3.5-3 5.5a3 3 0 0 0 6 0C21 6.5 18 3 18 3z"/>`,
    police: `<path ${S} d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path ${S} d="M12 8l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>`,
    port: `<circle ${S} cx="12" cy="5" r="2"/><path ${S} d="M12 7v14M8 11h8M5 14c0 4 3 7 7 7s7-3 7-7"/>`,
    pump: `<rect ${S} x="3" y="9" width="10" height="12"/><path ${S} d="M3 9l5-4 5 4"/><path ${S} d="M13 15h5v6"/>` +
          `<path ${F} d="M18 2s-2.5 3-2.5 4.5a2.5 2.5 0 0 0 5 0C20.5 5 18 2 18 2z"/>`,
    query: `<circle ${S} cx="10" cy="10" r="6"/><path ${S} d="M14.5 14.5L21 21"/><path ${S} d="M8.5 8.5a1.6 1.6 0 1 1 2 1.6V11"/>` +
           `<circle ${F} cx="10.5" cy="13" r="0.9"/>`,
    rail: `<path ${S} d="M8 2l-3 20M16 2l3 20"/><path ${S} d="M6 6h12M5.5 11h13M4.8 16h14.4M4.2 21h15.6"/>`,
    residential: `<path ${S} d="M3 11l9-7 9 7"/><path ${S} d="M5 9.5V21h14V9.5"/><path ${S} d="M10 21v-6h4v6"/>`,
    road: `<path ${S} d="M7 2L3 22M17 2l4 20"/><path ${S} d="M12 3v3M12 10v3M12 17v3"/>`,
    stadium: `<ellipse ${S} cx="12" cy="12" rx="10" ry="7"/><ellipse ${S} cx="12" cy="12" rx="5" ry="3"/>`,
    waterTower: `<path ${S} d="M5 5h14v6H5z"/><path ${S} d="M7 11l-2 10M17 11l2 10M9 11l-1 10M15 11l1 10M6 16h12"/>` +
                `<path ${S} d="M5 5c2-2 12-2 14 0"/>`,
    wire: `<path ${S} d="M12 2L8 22M12 2l4 20M6 7h12M5 12h14M9 17h6"/><path ${F} d="M20 2l-2 4h2l-2 4"/>`,
};

/** Text der Knöpfe durch Symbole ersetzen; der bisherige Text wird Hinweis und Beschriftung für Bildschirmleser. */
export function decorateToolButtons(root: ParentNode): void {
    const buttons = root.querySelectorAll<HTMLButtonElement>(".toolButton");
    for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i];
        const tool = button.getAttribute("data-tool") || "";
        const icon = TOOL_ICONS[tool];
        if (!icon || button.querySelector("svg")) {
            continue;
        }
        const label = (button.textContent || "").trim();
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("data-label", label);
        button.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">${icon}</svg>`;
    }
}
