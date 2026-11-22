/* Dorfplaner – Wasserversorgung.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Werkzeuge für die Wasserversorgung:
 *  - PipeTool: Rohr verlegen (ziehbar). Rohre liegen unter der Erde in der Rohrkarte des WaterManagers, die Kachel
 *    darüber bleibt unverändert – deshalb geht ein Rohr auch unter Straßen, Zonen und Gebäuden hindurch.
 *  - WaterBuildingTool: Pumpe oder Wasserturm (je eine Kachel).
 *
 * Wie alle Werkzeuge rechnen sie erst die Kosten aus (doTool) und bauen nur, wenn genug Geld da ist
 * (modifyIfEnoughFunding).
 */

import { BaseTool } from './baseTool.js';
import { BLBNCNBIT } from './tileFlags.ts';
import { TileUtils } from './tileUtils.js';
import { DIRT } from './tileValues.ts';
import { PIPE_COST, PIPE_COST_UNDER_WATER } from './water/waterRules.ts';

var makeTool = BaseTool.makeTool;


var PipeTool = makeTool(function(map, waterManager) {
  this.init(PIPE_COST, map, false, true);
  this._water = waterManager;
  this._pending = null;
});


PipeTool.prototype.doTool = function(x, y, blockMaps) {
  this._pending = null;

  if (!this._map.testBounds(x, y)) {
    this.result = this.TOOLRESULT_FAILED;
    return;
  }

  // Liegt schon ein Rohr, kostet es nichts
  if (!this._water.hasPipe(x, y)) {
    this.addCost(this._water.isWaterTile(x, y) ? PIPE_COST_UNDER_WATER : PIPE_COST);
    this._pending = {x: x, y: y};
  }

  this.result = this.TOOLRESULT_OK;
};


PipeTool.prototype.modifyIfEnoughFunding = function(budget) {
  var pending = this._pending;
  this._pending = null;

  var ok = Object.getPrototypeOf(PipeTool.prototype).modifyIfEnoughFunding.call(this, budget);
  if (ok && pending !== null) {
    this._water.setPipe(pending.x, pending.y, true);
    this._water.refresh();
  }
  return ok;
};


var WaterBuildingTool = makeTool(function(map, waterManager, tileValue, cost) {
  this.init(cost, map, true, false);
  this._water = waterManager;
  this._tileValue = tileValue;
});


WaterBuildingTool.prototype.doTool = function(x, y, blockMaps) {
  if (!this._map.testBounds(x, y)) {
    this.result = this.TOOLRESULT_FAILED;
    return;
  }

  var value = this._worldEffects.getTileValue(x, y);
  if (value !== DIRT) {
    // Wie beim Bauen von Gebäuden: Bäume und Trümmer räumt die automatische Planierraupe weg, sonst erst abreißen
    if (!this.autoBulldoze || !TileUtils.canBulldoze(value)) {
      this.result = this.TOOLRESULT_NEEDS_BULLDOZE;
      return;
    }
    this._worldEffects.setTile(x, y, DIRT);
    this.addCost(this.bulldozerCost);
  }

  // abreißbar, brennbar und stromleitend (die Pumpe braucht Strom)
  this._worldEffects.setTile(x, y, this._tileValue, BLBNCNBIT);
  this.addCost(this.toolCost);
  this.result = this.TOOLRESULT_OK;
};


WaterBuildingTool.prototype.modifyIfEnoughFunding = function(budget) {
  var ok = Object.getPrototypeOf(WaterBuildingTool.prototype).modifyIfEnoughFunding.call(this, budget);
  if (ok)
    this._water.refresh();
  return ok;
};


export { PipeTool, WaterBuildingTool };
