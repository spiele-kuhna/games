/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

// Dorfplaner: mehrere Spielstände statt eines einzigen. Die reinen Rechenfunktionen (Verzeichnis, Prüfen beim
// Import, Dateiname) liegen in saveSlots.ts und haben Unit-Tests; hier passiert nur das Lesen und Schreiben im Browser.
//
// Spielstände liegen im localStorage dieses Browsers. Zum Mitnehmen in einen anderen Browser oder auf einen anderen
// Rechner gibt es den Export als Datei (.json) und den Import aus einer solchen Datei.

import { MiscUtils } from './miscUtils.js';
import { INDEX_KEY, SLOT_PREFIX, entryFor, exportFileName, makeSaveId, parseIndex, removeEntry, unwrapImport,
         upsertEntry, wrapForExport } from './saveSlots.ts';

// Schlüssel des einzigen Spielstands im Original micropolisJS. Er wird beim ersten Aufruf einmalig als
// Spielstand übernommen und bleibt selbst unverändert liegen.
var LEGACY_KEY = 'micropolisJSGame';
var LEGACY_DONE_KEY = 'dorfplaner.altesSpielUebernommen';


var readIndex = function() {
  return parseIndex(window.localStorage.getItem(INDEX_KEY));
};


var writeIndex = function(index) {
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
};


// Einmalig: altes Einzel-Spiel ins Verzeichnis übernehmen
var adoptLegacySave = function() {
  var storage = window.localStorage;
  if (storage.getItem(LEGACY_DONE_KEY) !== null)
    return;

  var old = storage.getItem(LEGACY_KEY);
  if (old !== null) {
    try {
      var data = JSON.parse(old);
      storage.setItem(SLOT_PREFIX + 'alt', old);
      writeIndex(upsertEntry(readIndex(), entryFor('alt', data, Date.now())));
    } catch (e) {
      // kaputter alter Spielstand: einfach nicht übernehmen
    }
  }
  storage.setItem(LEGACY_DONE_KEY, '1');
};


// Liste aller Spielstände, neueste zuerst
var listSaves = function() {
  if (!this.canStore)
    return [];
  adoptLegacySave();
  return readIndex();
};


var hasSaves = function() {
  return this.listSaves().length > 0;
};


// Einen Spielstand laden; null, wenn es ihn nicht (mehr) gibt
var getSave = function(id) {
  var text = window.localStorage.getItem(SLOT_PREFIX + id);
  if (text === null)
    return null;

  var savedGame = JSON.parse(text);
  if (savedGame.version !== this.CURRENT_VERSION)
    this.transitionOldSave(savedGame);

  // Flag as a saved game for Game/Simulation etc...
  savedGame.isSavedGame = true;
  // Dorfplaner: unter welcher Kennung weiter gespeichert wird
  savedGame.saveId = id;
  return savedGame;
};


// Speichern. Ohne id entsteht ein neuer Spielstand. Rückgabe: die Kennung.
// Wirft einen Fehler, wenn der Browser-Speicher voll ist – der Aufrufer zeigt dann eine Meldung.
var saveGame = function(gameData, id) {
  id = id || makeSaveId(Date.now(), Math.random());
  gameData.version = this.CURRENT_VERSION;

  window.localStorage.setItem(SLOT_PREFIX + id, JSON.stringify(gameData));
  writeIndex(upsertEntry(readIndex(), entryFor(id, gameData, Date.now())));
  return id;
};


var deleteSave = function(id) {
  window.localStorage.removeItem(SLOT_PREFIX + id);
  writeIndex(removeEntry(readIndex(), id));
};


// Spielstand als Datei herunterladen (bleibt auf dem eigenen Rechner, nichts wird ins Internet geschickt)
var downloadSave = function(id) {
  var text = window.localStorage.getItem(SLOT_PREFIX + id);
  if (text === null)
    return;

  var game = JSON.parse(text);
  var now = new Date();
  var blob = new Blob([wrapForExport(game, now)], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(game.name, now);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};


// Spielstand aus dem Inhalt einer Datei übernehmen. Rückgabe: {ok: true, id} oder {ok: false, error}
var importSave = function(text) {
  var result = unwrapImport(text);
  if (!result.ok)
    return result;

  var game = result.game;
  if (game.version !== this.CURRENT_VERSION)
    this.transitionOldSave(game);

  try {
    return {ok: true, id: this.saveGame(game)};
  } catch (e) {
    return {ok: false, error: 'Der Speicher dieses Browsers ist voll. Bitte alte Spielstände löschen.'};
  }
};


var transitionOldSave = function(savedGame) {
  switch (savedGame.version) {
    case 1:
      savedGame.everClicked = false;

      /* falls through */
    case 2:
      savedGame.pollutionMaxX = Math.floor(savedGame.width / 2);
      savedGame.pollutionMaxY = Math.floor(savedGame.height / 2);
      savedGame.cityCentreX = Math.floor(savedGame.width / 2);
      savedGame.cityCentreY = Math.floor(savedGame.height / 2);

      /* falls through */
    case 3:
      // Dorfplaner: Version 4 bringt die Wasserversorgung. Alte Städte haben noch keine Rohre und bekommen ein
      // Spieljahr Schonfrist, bevor Zonen ohne Wasser schrumpfen.
      savedGame.pipes = '';
      savedGame.waterTowers = [];
      savedGame.waterGraceUntil = (savedGame._cityTime || 0) + 48;

      break;

    default:
      throw new Error('Unknown save version!');
  }
};


var Storage = {
  listSaves: listSaves,
  hasSaves: hasSaves,
  getSave: getSave,
  saveGame: saveGame,
  deleteSave: deleteSave,
  downloadSave: downloadSave,
  importSave: importSave,
  transitionOldSave: transitionOldSave
};


var storageAvailable = (function() {
  try {
    return window.localStorage !== undefined && window.localStorage !== null;
  } catch (e) {
    return false;   // z. B. wenn der Browser Website-Daten blockiert
  }
})();

Object.defineProperty(Storage, 'CURRENT_VERSION', MiscUtils.makeConstantDescriptor(4));
Object.defineProperty(Storage, 'canStore', MiscUtils.makeConstantDescriptor(storageAvailable));


export { Storage };
