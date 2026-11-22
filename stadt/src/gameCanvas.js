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

import { AnimationManager } from './animationManager.js';
import { GameMap } from './gameMap.js';
import { MiscUtils } from './miscUtils.js';
import { MouseBox } from './mouseBox.js';
import { Position } from './position.ts';
import { TileSet } from './tileSet.js';
import { TILE_INVALID } from "./tileValues.ts";
import { blinkOn, drawWaterDrop, isWaterZoneCentre, pipeColour, UNDERGROUND_SHADE } from './water/waterIcons.ts';

function GameCanvas(id, parentNode) {
  if (!(this instanceof GameCanvas))
    return new GameCanvas(id, parentNode, width, height);

  if (arguments.length < 1)
    throw new Error('Attempt to construct a GameCanvas with no parameters');

  // Argument shuffling
  if (parentNode === undefined) {
    // No ID supplied
    parentNode = id;
    id = GameCanvas.DEFAULT_ID;
  }

  if (typeof(parentNode) === 'string') {
    var orig = parentNode;
    parentNode = $(MiscUtils.normaliseDOMid(parentNode));
    parentNode = parentNode.length === 0 ? null : parentNode[0];
    if (parentNode === null)
      throw new Error('Node ' + orig + ' not found');
  }

  this._canvas = document.createElement('canvas');
  this._canvas.id = id;

  // The canvas is assumed to fill its container on-screen
  var rect = parentNode.getBoundingClientRect();
  this._canvas.width = rect.width;
  this._canvas.height = rect.height;
  this._canvas.style.margin = '0';
  this._canvas.style.padding = '0';

  this._pendingTileSet = null;

  // Remove any existing element with the same id
  var current = document.getElementById(id);
  if (current !== null) {
    if  (current.parentNode === parentNode)
      parentNode.replaceChild(this._canvas, current);
    else
      throw new Error('ID ' + id + ' already exists in document!');
  } else
    parentNode.appendChild(this._canvas);

  this.ready = false;
}


GameCanvas.prototype.init = function(map, tileSet, spriteSheet, animationManager) {
  animationManager = animationManager || new AnimationManager(map);

  if (arguments.length < 3)
    throw new Error('GameCanvas constructor called with too few arguments ' + [].toString.apply(arguments));

  if (!tileSet.isValid)
    throw new Error('TileSet not ready!');

  this._spriteSheet = spriteSheet;
  this._tileSet = tileSet;
  this._zoom = 1;
  var w = this.tileSize();
  this._map = map;
  this.animationManager = new AnimationManager(map);

  if (this._canvas.width < w || this._canvas.height < w)
    throw new Error('Canvas too small!');

  // Whether to allow off-map scrolling
  this._allowScrolling = true;

  // An array indexed by tile offset containing the tileValue last painted there
  this._lastPaintedTiles = null;
  this._currentPaintedTiles = []; // for future use

  // Last time we painted, the canvas was this many tiles wide and tall
  this._lastPaintedWidth = -1;
  this._lastPaintedHeight = -1;

  // Last time we painted, the canvas was this wide and tall in pixels (determines whether we
  // can safely call putImageData)
  this._lastCanvasWidth = -1;
  this._lastCanvasHeight = -1;

  // After painting tiles, we store the image data here before painting sprites and mousebox
  this._lastCanvasData = null;

  this._calculateDimensions();

  // Have the dimensions changed since the last paint?
  this._pendingDimensionChange = false;
  var onResize = function(e) {
    this._pendingDimensionChange = true;
  }.bind(this);

  // Recompute canvas dimensions on resize
  window.addEventListener('resize', onResize, false);

  // Order is important here. ready must be set before the call to centreOn below
  this.ready = true;
  this.centreOn(Math.floor(this._map.width / 2), Math.floor(this._map.height / 2));

  this.paint(null, null);
};


GameCanvas.prototype._calculateDimensions = function(force) {
  force = force || false;

  // The canvas is assumed to fill its container on-screen
  var canvasWidth = this.canvasWidth = this._canvas.parentNode.clientWidth;
  var canvasHeight = this.canvasHeight = this._canvas.parentNode.clientHeight;

  if (canvasHeight === this._lastCanvasHeight && canvasWidth === this._lastCanvasWidth && !force)
    return;

  this._canvas.width = canvasWidth;
  this._canvas.height = canvasHeight;

  var w = this.tileSize();

  // How many tiles fit?
  this._wholeTilesInViewX = Math.floor(canvasWidth / w);
  this._wholeTilesInViewY = Math.floor(canvasHeight / w);
  this._totalTilesInViewX = Math.ceil(canvasWidth / w);
  this._totalTilesInViewY = Math.ceil(canvasHeight / w);

  if (this._allowScrolling) {
    // The min/max properties denote how far we will let the canvas' origin move: the map
    // should be visible in at least half the canvas
    this.minX = 0 - Math.ceil(Math.floor(canvasWidth/w) / 2);
    this.maxX = (this._map.width - 1) - Math.ceil(Math.floor(canvasWidth/w) / 2);
    this.minY = 0 - Math.ceil(Math.floor(canvasHeight/w) / 2);
    this.maxY = (this._map.height - 1) - Math.ceil(Math.floor(canvasHeight/w) / 2);
    this._totalTilesInViewY = Math.ceil(canvasHeight / w);
  } else {
    this.minX = 0;
    this.minY = 0;
    this.maxX = this._map.width - this._totalTilesInViewX;
    this.maxY = this._map.height - this._totalTilesInViewY;
  }

  this._pendingDimensionChange = true;
};


// NOTE: Canvas must be visible when this is called
GameCanvas.prototype.disallowOffMap = function() {
  this._allowScrolling = false;
  this._lastPaintedTiles = null;
  this._calculateDimensions(true);
};


GameCanvas.prototype.moveNorth = function() {
  if (!this.ready)
    throw new Error('Not ready!');

  if (this._originY > this.minY)
    this._originY--;
};


GameCanvas.prototype.moveEast = function() {
  if (!this.ready)
    throw new Error('Not ready!');

  if (this._originX < this.maxX)
    this._originX++;
};


GameCanvas.prototype.moveSouth = function() {
  if (!this.ready)
    throw new Error('Not ready!');

  if (this._originY < this.maxY)
    this._originY++;
};


GameCanvas.prototype.moveWest = function() {
  if (!this.ready)
    throw new Error('Not ready!');

  if (this._originX > this.minX)
    this._originX--;
};


GameCanvas.prototype.moveTo = function(x, y) {
  if (arguments.length < 1)
    throw new Error('GameCanvas moveTo called with no arguments');

  if (!this.ready)
    throw new Error('Not ready!');

  if (x < this.minX || x > this.maxX ||
      y < this.minY || y > this.maxY)
    throw new Error('Coordinates out of bounds');

  this._originX = x;
  this._originY = y;
};


GameCanvas.prototype.centreOn = function(x, y) {
  if (arguments.length < 1)
    throw new Error('GameCanvas centreOn called with no arguments');

  if (!this.ready)
    throw new Error('Not ready!');

  if (y === undefined) {
    y = x.y;
    x = x.x;
  }

  // XXX Need to fix so that centres on best point if bounds fall outside
  // XXX min/max
  var originX = Math.floor(x) - Math.ceil(this._wholeTilesInViewX / 2);
  var originY = Math.floor(y) - Math.ceil(this._wholeTilesInViewY / 2);

  if (originX > this.maxX)
    originX = this.maxX;
  if (originX < this.minX)
    originX = this.minX;
  if (originY > this.maxY)
    originY = this.maxY;
  if (originY < this.minY)
    originY = this.minY;

  this._originX = originX;
  this._originY = originY;
};


GameCanvas.prototype.getTileOrigin = function() {
  var e = new Error('Not ready!');

  if (!this.ready)
    throw e;

  return {x: this._originX, y: this._originY};
};


GameCanvas.prototype.getMaxTile = function() {
  var e = new Error('Not ready!');

  if (!this.ready)
    throw e;

  return {x: this._originX + this._totalTilesInViewX - 1, y: this._originY + this._totalTilesInViewY - 1};
};


GameCanvas.prototype.canvasCoordinateToTileOffset = function(x, y) {
  if (arguments.length < 2)
    throw new Error('GameCanvas canvasCoordinateToTileOffset called with too few arguments ' + [].toString.apply(arguments));

  if (!this.ready)
    throw new Error('Not ready!');

  return {x: Math.floor(x / this.tileSize()),
          y: Math.floor(y / this.tileSize())};
};


GameCanvas.prototype.canvasCoordinateToTileCoordinate = function(x, y) {
  if (arguments.length < 2)
    throw new Error('GameCanvas canvasCoordinateToTileCoordinate called with too few arguments ' + [].toString.apply(arguments));

  if (!this.ready)
    throw new Error('Not ready!');

  if (x >= this.canvasWidth || y >= this.canvasHeight)
    return null;

  return {x: this._originX + Math.floor(x/this.tileSize()),
          y: this._originY + Math.floor(y/this.tileSize())};
};


GameCanvas.prototype.canvasCoordinateToPosition = function(x, y) {
  if (arguments.length < 2)
    throw new Error('GameCanvas canvasCoordinateToPosition called with too few arguments ' + [].toString.apply(arguments));

  if (!this.ready)
    throw new Error('Not ready!');

  if (x >= this.canvasWidth || y >= this.canvasHeight)
    return null;

  x = this._originX + Math.floor(x / this.tileSize());
  y = this._originY + Math.floor(y / this.tileSize());


  if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height)
    return null;

  return new Position(x, y);
};



GameCanvas.prototype.positionToCanvasCoordinate = function(p) {
  if (arguments.length < 1)
    throw new Error('GameCanvas positionToCanvasCoordinate called with too few arguments ' + [].toString.apply(arguments));

  return this.tileToCanvasCoordinate(p);
};



GameCanvas.prototype.tileToCanvasCoordinate = function(x, y) {
  if (arguments.length < 1)
    throw new Error('GameCanvas tileToCanvasCoordinate  called with too few arguments ' + [].toString.apply(arguments));

  if (!this.ready)
    throw new Error('Not ready!');

  if (y === undefined) {
    y = x.y;
    x = x.x;
  }

  if (x === undefined || y === undefined || x < this.minX || y < this.minY ||
      x > (this.maxX + this._totalTilesInViewX - 1) ||
      y > (this.maxY + this._totalTilesInViewY - 1))
    throw e;

  if (x < this._originX || x >= this._originX + this._totalTilesInViewX ||
      y < this._originY || y >= this._originY + this._totalTilesInViewY)
    return null;

  return {x: (x - this._originX) * this.tileSize(),
          y: (y - this._originY) * this.tileSize()};
};



GameCanvas.prototype.changeTileSet = function(tileSet) {
  if (!this.ready)
    throw new Error('Not ready!');

  if (!tileSet.isValid)
    throw new Error('new tileset not loaded');

  this._pendingTileSet = tileSet;
};



GameCanvas.prototype._screenshot = function(onlyVisible) {
  if (onlyVisible)
    return this._canvas.toDataURL();

  var tempCanvas = document.createElement('canvas');
  tempCanvas.width = this._map.width * BASE_TILE;
  tempCanvas.height = this._map.height * BASE_TILE;
  var ctx = tempCanvas.getContext('2d');

  for (var x = 0; x < this._map.width; x++) {
    for (var y = 0; y < this._map.height; y++) {
      this._paintOne(ctx, this._map.getTileValue(x, y), x, y, BASE_TILE);
    }
  }
  return tempCanvas.toDataURL();
};


GameCanvas.prototype.screenshotMap = function() {
  return this._screenshot(false);
};


GameCanvas.prototype.screenshotVisible = function() {
  return this._screenshot(true);
};


// Dorfplaner, 2026: Die isometrische Ansicht zeichnet auf dasselbe Canvas-Element (siehe iso/viewSwitcher.js).
// Beim Zurückschalten muss die Draufsicht deshalb Größe und Inhalt komplett neu aufbauen.
// Dorfplaner: Zoom in der Draufsicht. Nur ganze Vielfache von 16 Pixeln, damit die Pixelgrafik scharf bleibt.
var BASE_TILE = 16;
GameCanvas.ZOOM_LEVELS = [1, 2, 3];

GameCanvas.prototype.tileSize = function() {
  return BASE_TILE * (this._zoom || 1);
};


// Eine Zoomstufe näher (+1) oder weiter weg (−1); die Kachel unter (x, y) bleibt unter dem Mauszeiger.
GameCanvas.prototype.zoomAt = function(step, x, y) {
  var levels = GameCanvas.ZOOM_LEVELS;
  var index = levels.indexOf(this._zoom || 1);
  var next = levels[Math.max(0, Math.min(levels.length - 1, index + step))];
  if (next === this._zoom)
    return;

  var tile = this.canvasCoordinateToTileCoordinate(x, y);
  this._zoom = next;
  this._calculateDimensions(true);
  this._lastPaintedTiles = null;

  if (tile !== null) {
    var originX = tile.x - Math.floor(x / this.tileSize());
    var originY = tile.y - Math.floor(y / this.tileSize());
    this._originX = Math.max(this.minX, Math.min(this.maxX, originX));
    this._originY = Math.max(this.minY, Math.min(this.maxY, originY));
  }
};


GameCanvas.prototype.forceRepaint = function() {
  this._canvas.style.width = '';
  this._canvas.style.height = '';
  this._lastPaintedTiles = null;
  this._lastCanvasWidth = -1;
  this._lastCanvasHeight = -1;
  this._pendingDimensionChange = true;
};


GameCanvas.prototype.shoogle = function() {
  // TODO Earthquakes
};


GameCanvas.prototype._processSprites = function(ctx, spriteList) {
  var spriteDamage = [];
  var tileWidth = BASE_TILE;
  var zoom = this._zoom || 1;

  for (var i = 0, l = spriteList.length; i < l; i++) {
    var sprite = spriteList[i];
    try {
      ctx.drawImage(this._spriteSheet,
                    (sprite.frame - 1) * 48,
                    (sprite.type - 1) * 48,
                    sprite.width,
                    sprite.width,
                    (sprite.x + sprite.xOffset - this._originX * 16) * zoom,
                    (sprite.y + sprite.yOffset - this._originY * 16) * zoom,
                    sprite.width * zoom,
                    sprite.width * zoom);
    } catch (e) {
      throw new Error('Failed to draw sprite ' + sprite.type + ' frame ' + sprite.frame + ' at ' + sprite.x +  ', ' + sprite.y);
    }

    // sprite values are in pixels
    spriteDamage.push({x: Math.floor((sprite.x + sprite.xOffset - this._originX * 16) / tileWidth),
                       xBound: Math.ceil((sprite.x + sprite.xOffset + sprite.width - this._originX * 16) / tileWidth),
                       y: Math.floor((sprite.y + sprite.yOffset - this._originY * 16) / tileWidth),
                       yBound: Math.ceil((sprite.y + sprite.yOffset + sprite.height - this._originY * 16) / tileWidth)});
  }

  return spriteDamage;
};


// Draws a mouse outline around the selected tiles. The mouse object is assumed to contain x and y properties which
// express the coordinate of the top-left of the box in terms of the number of tiles from the top left. It should
// also contain a width and height that are again expressed in terms of the number of tiles. The colour property
// naturally defines the colour of the painted box.
GameCanvas.prototype._processMouse = (function() {
  var damage = {x: 0, xBound: 0, y: 0, yBound: 0};

  return function(mouse) {
    if (mouse.width === 0 || mouse.height === 0)
      return;

    // For outlines bigger than 2x2 (in either dimension) assume the mouse is offset by
    // one tile
    var mouseX = mouse.x;
    var mouseY = mouse.y;
    var mouseWidth = mouse.width;
    var mouseHeight = mouse.height;
    var options = {colour: mouse.colour, outline: true};

    if (mouseWidth > 2)
      mouseX -= 1;
    if (mouseHeight > 2)
      mouseY -= 1;

    var offMap = (this._originX + mouseX < 0 && this._originX + mouseX + mouseWidth <= 0) ||
                 (this._originY + mouseY < 0 && this._originY + mouseY + mouseHeight <= 0) ||
                 this._originX + mouseX >= this._map.width || this._originY + mouseY >= this._map.height;

    if (offMap) {
      damage.x = damage.xBound = mouseX;
      damage.y = damage.yBound = mouseY;
      return damage;
    }

    var pos = {x: mouseX * this.tileSize(), y: mouseY * this.tileSize()};
    var width = mouseWidth * this.tileSize();
    var height = mouseHeight * this.tileSize();
    MouseBox.draw(this._canvas, pos, width, height, options);

    // Return an object representing tiles that were damaged that will need redrawn
    // Note that we must take an extra tile either side to account for the outline
    damage.x = mouseX - 1;
    damage.xBound = mouseX + mouseWidth + 2;
    damage.y = mouseY - 1;
    damage.yBound = mouseY + mouseWidth + 2;
    return damage;
  };
})();


GameCanvas.prototype._paintVoid = function(ctx, x, y) {
  var w = this.tileSize();
  ctx.fillStyle = 'black';
  ctx.fillRect(x * w, y * w, w, w);
};


GameCanvas.prototype._paintOne = function(ctx, tileVal, x, y, size) {
  if (tileVal === TILE_INVALID) {
    this._paintVoid(ctx, x, y);
    return;
  }

  // Dorfplaner: Kachelgröße hängt vom Zoom ab (16, 32 oder 48 Pixel)
  size = size || this.tileSize();
  var src = this._tileSet[tileVal];
  try {
    ctx.drawImage(src, x * size, y * size, size, size);
  } catch (e) {
    var mapX = this._originX + x;
    var mapY = this._originY + y;
    throw new Error('Failed to draw tile ' + tileVal + ' at ' + x + ', ' + y + ' (map ' + mapX + ', ' + mapY + ' tile ' + (this._map.testBounds(mapX, mapY) ? this._map.getTileValue(mapX, mapY) : '?? (Out of bounds)') + ')');
  }
};


GameCanvas.prototype._paintTiles = function(ctx, paintData) {
  var x, y, row, index;
  var lastPaintedTiles = this._lastPaintedTiles;

  var width = this._totalTilesInViewX;
  var height = this._totalTilesInViewY;

  if (lastPaintedTiles !== null) {
    // We have painted the canvas before. There are 3 possibilities:
    //  - The canvas is exactly the same size as last time we painted
    //  - The canvas has grown
    //  - The canvas has shrunk
    //
    // In any case, we want to find the minimal area that was onscreen last paint
    // and this paint, and iterate over those tiles, repainting where necessary
    var xBound = Math.min(this._lastPaintedWidth, width);
    var yBound = Math.min(this._lastPaintedHeight, height);

    // Loop over the common area that we painted last time. Compare the current value against what was there last time
    for (y = 0; y < yBound; y++) {
      for (x = 0; x < xBound; x++) {
        index  = y * xBound + x;
        if (lastPaintedTiles[index] === paintData[index])
          continue;

        // Tile is different: repaint
        this._paintOne(ctx, paintData[index], x, y);
      }
    }

    // Do we have more tiles than before? Paint the extra width and/or the extra height
    if (width > this._lastPaintedWidth) {
      for (y = 0; y < height; y++) {
        for (x = this._lastPaintedWidth; x < width; x++) {
          index  = y * width + x;
          this._paintOne(ctx, paintData[index], x, y);
        }
      }
    }

    if (height > this._lastPaintedHeight) {
      for (y = this._lastPaintedHeight; y < height; y++) {
        for (x = 0; x < width; x++) {
          index  = y * width + x;
          this._paintOne(ctx, paintData[index], x, y);
        }
      }
    }
  } else {
    // Full paint
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        index = y * width + x;
        this._paintOne(ctx, paintData[index], x, y);
      }
    }
  }

  // Stash data
  this._lastPaintedWidth = width;
  this._lastPaintedHeight = height;

  // Rotate tile data
  var temp = this._lastPaintedTiles;
  this._lastPaintedTiles = paintData;
  this._currentPaintedTiles = temp;
};


GameCanvas.prototype.paint = function(mouse, sprites, isPaused) {
  var i, l, x, y, row, damaged, xBound, yBound, index;

  if (!this.ready)
    throw new Error('Not ready!');

  var ctx = this._canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;   // Dorfplaner: Pixelgrafik beim Zoomen scharf lassen
  var lastPaintedTiles = this._lastPaintedTiles;

  // Recompute our dimensions if there has been a resize since last paint
  if (this._pendingDimensionChange || this._pendingTileSet) {
    this._calculateDimensions();
    this._pendingDimensionChange = false;

    // Change tileSet if necessary
    if (this._pendingTileSet !== null)
      this._tileSet = this._pendingTileSet;

    // If the dimensions or tileset has changed, set each entry in lastPaintedTiles to a bogus value to force a
    // repaint. Note: we use -2 as our bogus value; -1 would paint the black void
    if (this._pendingTileSet || this.canvasWidth !== this._lastCanvasWidth || this.canvasHeight !== this._lastCanvasHeight) {
      ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

      for (y = 0, l = (lastPaintedTiles !== null ? lastPaintedTiles.length : 0); y < l; y++)
        lastPaintedTiles[y] = -2;
    }

    this._pendingTileSet = null;
  }

  var paintWidth = this._totalTilesInViewX;
  var paintHeight = this._totalTilesInViewY;

  // Dorfplaner: In der Untergrundansicht wird jedes Bild komplett neu gezeichnet, weil darüber die Abdunklung liegt
  if (this._underground && lastPaintedTiles !== null) {
    for (i = 0, l = lastPaintedTiles.length; i < l; i++)
      lastPaintedTiles[i] = -2;
  }

  // Fill an array with the values we need to paint
  var tileValues = this._map.getTileValuesForPainting(this._originX, this._originY, paintWidth, paintHeight, this._currentPaintedTiles);

  // Adjust for animations
  this.animationManager.getTiles(tileValues, this._originX, this._originY, paintWidth, paintHeight, isPaused);

  this._paintTiles(ctx, tileValues);
  // The _paintTiles call updates this._lastPaintedTiles. Update our cached copy
  lastPaintedTiles = this._lastPaintedTiles;

  // Dorfplaner: Rohre (Untergrund) und blinkende Wassertropfen
  if (this._water)
    this._paintWater(ctx, paintWidth, paintHeight, lastPaintedTiles);

  // Stash various values for next paint
  this._lastCanvasWidth = this.canvasWidth;
  this._lastCanvasHeight = this.canvasHeight;

  if (!mouse && !sprites) {
    return;
  }

  if (mouse) {
    damaged = this._processMouse(mouse);

    for (y = Math.max(0, damaged.y), yBound = Math.min(paintHeight, damaged.yBound); y < yBound; y++) {
      for (x = Math.max(0, damaged.x), xBound = Math.min(paintWidth, damaged.xBound); x < xBound; x++) {
        index = [y * paintWidth + x];
        // Note: we can't use TILE_INVALID (-1) as that in some sense is a valid tile for the void!
        lastPaintedTiles[index] = -2;
      }
    }
  }

  if (sprites) {
    damaged = this._processSprites(ctx, sprites);
    for (i = 0, l = damaged.length; i < l; i++) {
      var damagedArea = damaged[i];
      for (y = Math.max(0, damagedArea.y), yBound = Math.min(damagedArea.yBound, paintHeight); y < yBound; y++) {
        for (x = Math.max(0, damagedArea.x), xBound = Math.min(damagedArea.xBound, paintWidth); x < xBound; x++) {
          index = [y * paintWidth + x];
          this._lastPaintedTiles[index] = -2;
        }
      }
    }
  }
};


// ---- Dorfplaner: Wasserversorgung in der Draufsicht ----------------------------------------------------------

GameCanvas.prototype.setWaterSource = function(water) {
  this._water = water;
};


// Untergrundansicht: Karte abgedunkelt, darüber die Rohre (grau ohne, blau mit Wasser)
GameCanvas.prototype.setUnderground = function(underground) {
  this._underground = underground;
  // Nur beim nächsten Bild alles neu zeichnen. Nicht forceRepaint(): Das setzt die Größe des gemeinsamen
  // Canvas zurück und verschiebt sonst die 3D-Ansicht, wenn sie gerade aktiv ist (Fehler vom 22.11.2026).
  this._lastPaintedTiles = null;
};


GameCanvas.prototype._paintWater = function(ctx, paintWidth, paintHeight, lastPaintedTiles) {
  var water = this._water;
  var size = this.tileSize();
  var x, y, mapX, mapY, index;

  if (this._underground) {
    ctx.fillStyle = UNDERGROUND_SHADE;
    ctx.fillRect(0, 0, paintWidth * size, paintHeight * size);

    for (y = 0; y < paintHeight; y++) {
      for (x = 0; x < paintWidth; x++) {
        mapX = this._originX + x;
        mapY = this._originY + y;
        if (!this._map.testBounds(mapX, mapY))
          continue;

        var kind = water.kindAt(mapX, mapY);
        // versorgte Gebäude leicht blau einfärben
        if (kind === 2 && water.isWatered(mapX, mapY)) {
          ctx.fillStyle = 'rgba(80, 160, 255, 0.28)';
          ctx.fillRect(x * size, y * size, size, size);
        }

        var cx = (x + 0.5) * size;
        var cy = (y + 0.5) * size;
        if (water.hasPipe(mapX, mapY)) {
          ctx.strokeStyle = pipeColour(water.isFlowing(mapX, mapY));
          ctx.lineWidth = Math.max(2, size * 0.28);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + 0.01, cy);
          var steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          for (var s = 0; s < 4; s++) {
            if (water.kindAt(mapX + steps[s][0], mapY + steps[s][1]) !== 0) {
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + steps[s][0] * size / 2, cy + steps[s][1] * size / 2);
            }
          }
          ctx.stroke();
        }

        // Pumpen und Türme hervorheben
        if (kind === 3) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, size / 12);
          ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
        }
      }
    }
    return;
  }

  // Blinkender Tropfen an Wohn-, Gewerbe- und Industriezonen ohne Wasser
  var on = blinkOn(Date.now());
  for (y = 0; y < paintHeight; y++) {
    for (x = 0; x < paintWidth; x++) {
      mapX = this._originX + x;
      mapY = this._originY + y;
      if (!this._map.testBounds(mapX, mapY))
        continue;

      var tile = this._map.getTile(mapX, mapY);
      if (!isWaterZoneCentre(tile.getValue(), tile.isZone()) || water.isWatered(mapX, mapY))
        continue;

      if (on)
        drawWaterDrop(ctx, (x + 0.75) * size, (y + 0.45) * size, size * 0.75);

      // beim nächsten Bild neu zeichnen, damit der Tropfen blinkt
      index = y * paintWidth + x;
      lastPaintedTiles[index] = -2;
    }
  }
};


GameCanvas.DEFAULT_ID = 'MicropolisCanvas';


export { GameCanvas };
