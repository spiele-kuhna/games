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

import { BaseSprite } from './baseSprite.js';
import { PLANE_CRASHED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { Random } from './random.ts';
import { SPRITE_AIRPLANE, SPRITE_HELICOPTER } from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';

function AirplaneSprite(map, spriteManager, x, y) {
  this.init(SPRITE_AIRPLANE, map, spriteManager, x, y);
  this.width = 48;
  this.height = 48;
  this.xOffset = -24;
  this.yOffset = -24;
  if (x > SpriteUtils.worldToPix(map.width - 20)) {
    this.destX = this.x - 200;
    this.frame = 7;
  } else {
    this.destX = this.x + 200;
    this.frame = 11;
  }
  this.destY = this.y;

  // Dorfplaner: Rundflug über zwei bis drei Ziele, danach zurück zum Startpunkt (Flughafen) und landen
  this.origX = this.x;
  this.origY = this.y;
  this.legs = 2 + Random.getRandom(1);
  this.landing = false;
  // Flughöhe 0 … 1 für die Darstellung (Start: steigt, Anflug: sinkt)
  this.altitude = 0;
}

// Pause am Boden nach einer Landung (in Bewegungsschritten des SpriteManagers, etwa 16 je Sekunde)
var PLANE_REST = 250;


BaseSprite(AirplaneSprite);


var xDelta = [0, 0, 6, 8, 6, 0, -6, -8, -6, 8, 8, 8];
var yDelta = [0, -8, -6, 0, 6, 8,  6, 0, -6, 0, 0, 0];

AirplaneSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
  var frame = this.frame;

  if ((spriteCycle % 5) === 0) {
    // Frames > 8 mean the plane is taking off
    if (frame > 8) {
      frame--;
      if (frame < 9) {
        // Planes always take off to the east
        frame = 3;
      }
      this.frame = frame;
    } else {
      var d = SpriteUtils.getDir(this.x, this.y, this.destX, this.destY);
      frame = SpriteUtils.turnTo(frame, d);
      this.frame = frame;
    }
  }

  var absDist = SpriteUtils.absoluteDistance(this.x, this.y, this.destX, this.destY);
  if (absDist < 50 && !this.landing) {
    if (this.legs > 0) {
      // We're pretty close to the destination
      this.legs--;
      this.destX = Random.getRandom(SpriteUtils.worldToPix(this.map.width)) + 8;
      this.destY = Random.getRandom(SpriteUtils.worldToPix(this.map.height)) + 8;
    } else {
      // Dorfplaner: Rundflug zu Ende – zurück zum Flughafen
      this.landing = true;
      this.destX = this.origX;
      this.destY = this.origY;
    }
  }

  // Dorfplaner: Flughöhe für die Darstellung; im Anflug sinken und am Flughafen aufsetzen
  if (this.landing) {
    var home = SpriteUtils.absoluteDistance(this.x, this.y, this.origX, this.origY);
    this.altitude = Math.min(1, home / 160);
    if (home < 48) {
      this.frame = 0;
      this.spriteManager.planeRestUntil = this.spriteManager.spriteCycle + PLANE_REST;
      return;
    }
  } else {
    this.altitude = frame > 8 ? (12 - frame) / 4 : 1;
  }

  if (disasterManager.enableDisasters) {
    var explode = false;

    var spriteList = this.spriteManager.getSpriteList();
    for (var i = 0; i < spriteList.length; i++) {
      var s = spriteList[i];

      if (s.frame === 0 || s === this)
        continue;

      if ((s.type === SPRITE_HELICOPTER ||
           s.type === SPRITE_AIRPLANE) &&
            SpriteUtils.checkSpriteCollision(this, s)) {
        s.explodeSprite();
        explode = true;
      }
    }

    if (explode)
      this.explodeSprite();
  }

  this.x += xDelta[frame];
  this.y += yDelta[frame];

  if (this.spriteNotInBounds())
    this.frame = 0;
};


AirplaneSprite.prototype.explodeSprite = function() {
  this.frame = 0;
  this.spriteManager.makeExplosionAt(this.x, this.y);
  this._emitEvent(PLANE_CRASHED, {showable: true, x: this.worldX, y: this.worldY});
};


// Metadata for image loading
Object.defineProperties(AirplaneSprite,
  {ID: MiscUtils.makeConstantDescriptor(3),
   width: MiscUtils.makeConstantDescriptor(48),
   frames: MiscUtils.makeConstantDescriptor(11)});


export { AirplaneSprite };
