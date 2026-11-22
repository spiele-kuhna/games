/* Dorfplaner – isometrische Ansicht.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * ViewSwitcher schaltet zwischen Draufsicht (GameCanvas) und Isometrie (IsoCanvas) um.
 *
 * Für den Rest des Spiels sieht er aus wie ein GameCanvas: Game, Meldungen und Werkzeuge rufen dieselben
 * Methoden auf wie vorher und landen automatisch bei der gerade aktiven Ansicht. Die Simulation bekommt vom
 * Umschalten nichts mit.
 *
 * Beide Ansichten zeichnen auf DASSELBE <canvas>-Element. So funktionieren die Maus-Handler in
 * inputStatus.js, die an dieses Element gebunden sind, in beiden Ansichten.
 */

var STORAGE_KEY = 'dorfplanerView';

function ViewSwitcher(topCanvas, isoCanvas) {
  this._top = topCanvas;
  this._iso = isoCanvas;
  this._active = topCanvas;
  this.mode = ViewSwitcher.TOP;
}

ViewSwitcher.TOP = 'top';
ViewSwitcher.ISO = 'iso';


// Die zuletzt gewählte Ansicht merkt sich der Browser – nur als Komfort, Fehler werden ignoriert.
ViewSwitcher.loadPreference = function() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === ViewSwitcher.ISO ? ViewSwitcher.ISO : ViewSwitcher.TOP;
  } catch (e) {
    return ViewSwitcher.TOP;
  }
};


var savePreference = function(mode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {
    // z. B. privater Modus: dann merkt sich der Browser die Ansicht eben nicht
  }
};


ViewSwitcher.prototype.setMode = function(mode) {
  if (mode === this.mode)
    return;

  // Kachel in der Bildschirmmitte merken, damit man nach dem Umschalten an derselben Stelle ist
  var centre = this._active.canvasCoordinateToTileCoordinate(Math.floor(this._active.canvasWidth / 2),
                                                              Math.floor(this._active.canvasHeight / 2));

  if (mode === ViewSwitcher.ISO) {
    this._active = this._iso;
    this._iso.activate();
  } else {
    this._active = this._top;
    this._top.forceRepaint();
  }

  this.mode = mode;
  savePreference(mode);

  if (centre !== null)
    this._active.centreOn(centre.x, centre.y);
};


ViewSwitcher.prototype.toggle = function() {
  this.setMode(this.mode === ViewSwitcher.ISO ? ViewSwitcher.TOP : ViewSwitcher.ISO);
};


ViewSwitcher.prototype.isIsometric = function() {
  return this.mode === ViewSwitcher.ISO;
};


// Die isometrische Ansicht direkt ansprechen (Zoom, Drehen) – nur sinnvoll, wenn sie aktiv ist.
ViewSwitcher.prototype.getIsoCanvas = function() {
  return this._iso;
};


// Alle Methoden von GameCanvas an die aktive Ansicht weiterreichen
['paint', 'moveNorth', 'moveEast', 'moveSouth', 'moveWest', 'centreOn', 'getTileOrigin', 'getMaxTile',
 'canvasCoordinateToTileOffset', 'canvasCoordinateToTileCoordinate', 'canvasCoordinateToPosition',
 'positionToCanvasCoordinate', 'tileToCanvasCoordinate', 'screenshotMap', 'screenshotVisible',
 'shoogle'].forEach(function(name) {
  ViewSwitcher.prototype[name] = function() {
    return this._active[name].apply(this._active, arguments);
  };
});


/*
 * Karte um (dx, dy) Pixel verschieben (Ziehen mit Maus oder Finger). Die 3D-Ansicht kann das pixelgenau;
 * die Draufsicht rückt nur in ganzen Kacheln (16 Pixel) – deshalb sammeln wir dort die Pixel, bis eine
 * Kachel voll ist.
 */
ViewSwitcher.prototype.scrollBy = function(dx, dy) {
  if (this._active === this._iso) {
    this._iso.scrollBy(dx, dy);
    return;
  }

  this._restX = (this._restX || 0) + dx;
  this._restY = (this._restY || 0) + dy;
  var tile = this._top.tileSize();
  while (this._restX >= tile) { this._top.moveWest(); this._restX -= tile; }
  while (this._restX <= -tile) { this._top.moveEast(); this._restX += tile; }
  while (this._restY >= tile) { this._top.moveNorth(); this._restY -= tile; }
  while (this._restY <= -tile) { this._top.moveSouth(); this._restY += tile; }
};


// Zoomen in beiden Ansichten (Draufsicht in den Stufen 1×, 2×, 3×)
ViewSwitcher.prototype.zoomAt = function(step, x, y) {
  this._active.zoomAt(step, x, y);
};


// Winterkacheln betreffen nur die Draufsicht
ViewSwitcher.prototype.changeTileSet = function(tileSet) {
  this._top.changeTileSet(tileSet);
};


ViewSwitcher.prototype.disallowOffMap = function() {
  this._top.disallowOffMap();
};


Object.defineProperties(ViewSwitcher.prototype, {
  canvasWidth: { get: function() { return this._active.canvasWidth; } },
  canvasHeight: { get: function() { return this._active.canvasHeight; } },
  ready: { get: function() { return this._top.ready && this._iso.ready; } },
  // Der AnimationManager gehört zur Draufsicht; das Monster-Fenster benutzt ihn mit.
  animationManager: { get: function() { return this._top.animationManager; } }
});


export { ViewSwitcher };
