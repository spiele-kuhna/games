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

import { PUMP, TILE_COUNT, WATER_TOWER } from "./tileValues.ts";

// Tiles must be 16px square
var TILE_SIZE = 16;
var TILES_PER_ROW = Math.sqrt(TILE_COUNT);
var ACCEPTABLE_DIMENSION = TILES_PER_ROW * TILE_SIZE;


function TileSet(image, callback, errorCallback) {
  if (!(this instanceof TileSet))
    return new TileSet(image, callback, errorCallback);

  if (callback === undefined || errorCallback === undefined) {
    if (callback === undefined && errorCallback === undefined)
      throw new Error('Tileset constructor called with no callback or errorCallback');
    else
      throw new Error('Tileset constructor called with no ' + (callback === undefined ? 'callback' : 'errorCallback'));
  }

  this.isValid = false;

  if (!(image instanceof Image)) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  this._verifyImage(image, callback, errorCallback);
}


TileSet.prototype._verifyImage = function(image, callback, errorCallback) {
  var width = image.width;
  var height = image.height;

  // We expect tilesets to be square, and of the required width/height
  if (width !== height || width !== ACCEPTABLE_DIMENSION) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  var tileWidth = this.tileWidth = TILE_SIZE;

  // We paint the image onto a canvas so we can split it up
  var c = document.createElement('canvas');
  c.width = tileWidth;
  c.height = tileWidth;
  var cx = c.getContext('2d');

  // Count how many tiles we have created
  var tileCount = TILE_COUNT;
  var notifications = 0;
  var self = this;

  // Callback triggered by an image load. Checks to see if we are done creating images,
  // and if so notifies the caller.
  var imageLoad = function() {
    notifications++;

    if (notifications === tileCount) {
      self.isValid = true;
      // Spin the event loop
      window.setTimeout(callback, 0);
      return;
    }
  };

  // Break up the source image into tiles by painting each tile onto a canvas, computing the dataURI
  // of the canvas, and using that to create a new image, which we install on ourselves as a new property
  for (var i = 0; i < tileCount; i++) {
    cx.clearRect(0, 0, tileWidth, tileWidth);

    var sourceX = i % TILES_PER_ROW * tileWidth;
    var sourceY = Math.floor(i / TILES_PER_ROW) * tileWidth;
    cx.drawImage(image, sourceX, sourceY, tileWidth, tileWidth, 0, 0, tileWidth, tileWidth);

    // Dorfplaner: Pumpe und Wasserturm gibt es im Kachelbild nicht – sie werden hier selbst gezeichnet
    if (i === PUMP)
      drawPumpTile(cx);
    else if (i === WATER_TOWER)
      drawWaterTowerTile(cx);

    this[i] = new Image();
    this[i].onload = imageLoad;
    this[i].src = c.toDataURL();
  }
};


// ---- Dorfplaner: selbst gezeichnete Kacheln (16 × 16 Pixel, Licht von links oben) ----------------------------

// Pumpenhaus: blaugraues Häuschen auf Betonplatte, daneben ein blaues Rohr mit Schieber
var drawPumpTile = function(cx) {
  cx.clearRect(0, 0, 16, 16);
  cx.fillStyle = '#a7a297';          // Betonplatte
  cx.fillRect(0, 0, 16, 16);
  cx.fillStyle = '#8c877c';
  cx.fillRect(0, 15, 16, 1);
  cx.fillRect(15, 0, 1, 16);
  cx.fillStyle = '#4f6f8f';          // Wände
  cx.fillRect(2, 4, 9, 9);
  cx.fillStyle = '#6f93b7';          // Dach
  cx.fillRect(2, 3, 9, 3);
  cx.fillStyle = '#2b3f55';          // Tür
  cx.fillRect(5, 9, 3, 4);
  cx.fillStyle = '#bcd6ea';          // Fenster
  cx.fillRect(3, 7, 2, 1);
  cx.fillRect(8, 7, 2, 1);
  cx.fillStyle = '#2f8cff';          // Rohr
  cx.fillRect(11, 6, 5, 3);
  cx.fillRect(12, 2, 2, 12);
  cx.fillStyle = '#c0392b';          // Schieberad
  cx.fillRect(12, 4, 2, 1);
};


// Wasserturm: runder Behälter auf vier Stützen, auf Wiese
var drawWaterTowerTile = function(cx) {
  cx.clearRect(0, 0, 16, 16);
  cx.fillStyle = '#6fa557';          // Wiese
  cx.fillRect(0, 0, 16, 16);
  cx.fillStyle = 'rgba(0, 0, 0, 0.25)';   // Schatten
  cx.fillRect(6, 11, 9, 3);
  cx.fillStyle = '#6b6b68';          // Stützen
  cx.fillRect(4, 8, 1, 6);
  cx.fillRect(11, 8, 1, 6);
  cx.fillRect(7, 9, 1, 5);
  cx.fillRect(8, 9, 1, 5);
  cx.fillStyle = '#d7dde3';          // Behälter
  cx.fillRect(3, 2, 10, 7);
  cx.fillRect(4, 1, 8, 9);
  cx.fillStyle = '#9aa7b3';          // Schattenseite
  cx.fillRect(10, 2, 3, 7);
  cx.fillStyle = '#2f8cff';          // Band
  cx.fillRect(3, 5, 10, 2);
  cx.fillStyle = '#ffffff';
  cx.fillRect(5, 2, 2, 1);
};


export { TileSet };
