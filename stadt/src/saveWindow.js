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

import $ from "jquery";

import { SAVE_WINDOW_CLOSED } from './messages.ts';
import { ModalWindow } from './modalWindow.js';
import { Storage } from './storage.js';

var SaveWindow = ModalWindow(function() {
  $(saveFormID).on('submit', submit.bind(this));

  // Dorfplaner: Spielstand als Datei herunterladen bzw. zusätzlich als Kopie speichern
  var self = this;
  $('#saveDownload').on('click', function() {
    if (self._saveId)
      Storage.downloadSave(self._saveId);
  });
  $('#saveCopy').on('click', function() {
    if (self._saveCopy && self._saveCopy())
      $('#saveMessage').text('Kopie gespeichert. Ab jetzt wird in die Kopie gespeichert.');
    else
      $('#saveMessage').text('Speichern fehlgeschlagen: Der Speicher dieses Browsers ist voll.');
    $('#saveCopy').prop('disabled', true);
  });
});


var saveFormID = '#saveForm';
var saveOKID = '#saveOK';


var submit = function(e) {
  e.preventDefault();
  this.close();
};


SaveWindow.prototype.close = function() {
  this._toggleDisplay();
  this._emitEvent(SAVE_WINDOW_CLOSED);
};


// ok: hat das Speichern geklappt? name: Name der Stadt, saveId: Kennung des Spielstands,
// saveCopy: Funktion, die das Spiel als neuen Spielstand speichert (liefert true/false)
SaveWindow.prototype.open = function(ok, name, saveId, saveCopy) {
  this._saveId = saveId;
  this._saveCopy = saveCopy;

  if (ok)
    $('#saveMessage').text('Spiel „' + name + '“ gespeichert.');
  else
    $('#saveMessage').text('Speichern fehlgeschlagen: Der Speicher dieses Browsers ist voll. ' +
                           'Bitte alte Spielstände löschen (Startbildschirm → Spiel laden).');
  $('#saveDownload').prop('disabled', !ok || !saveId);
  $('#saveCopy').prop('disabled', !ok);

  this._toggleDisplay();
  $(saveOKID).focus();
};


export { SaveWindow };
