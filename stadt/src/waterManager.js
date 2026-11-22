/* Dorfplaner – Wasserversorgung.
 *
 * Copyright (C) 2026 Dorfplaner contributors.
 * Part of Dorfplaner, a modified version of micropolisJS (https://github.com/graememcc/micropolisJS).
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details.
 */

/*
 * Verwaltet das Wassernetz – nach dem Vorbild von powerManager.js:
 *
 *  - pipeMap: wo Rohre liegen (eigene Ebene unter der Erde, unabhängig von der Kachel darüber)
 *  - waterGridMap: Ergebnis der letzten Netzberechnung, je Kachel
 *        Bit 1 (SUPPLIED) = Gebäudekachel hat Wasser
 *        Bit 2 (FLOWING)  = Kachel liegt in einem Netz, in dem Wasser fließt (für blaue Rohre)
 *    Eine eigene Karte ist nötig, weil alle sechs Kachel-Flags schon belegt sind.
 *  - Füllstände der Wassertürme (nach Kachelnummer)
 *
 * Die eigentlichen Regeln (Pumpenleistung, Bilanz, Netzsuche) stehen in water/waterRules.ts.
 */

import { BlockMap } from './blockMap.ts';
import { EventEmitter } from './eventEmitter.js';
import { NOT_ENOUGH_WATER } from './messages.ts';
import { PUMP, WATER_TOWER, RESBASE, RIVER, LASTRIVEDGE } from './tileValues.ts';
import { balanceNetwork, CONSUMER, decodePipes, encodePipes, findNetworks, GRACE_PERIOD, NOTHING, PIPE,
         pumpCapacity, SOURCE } from './water/waterRules.ts';

var SUPPLIED = 1;
var FLOWING = 2;


var WaterManager = EventEmitter(function(map) {
  this._map = map;
  this.pipeMap = new BlockMap(map.width, map.height, 1);
  this.waterGridMap = new BlockMap(map.width, map.height, 1);
  this._towerLevels = {};
  // Ab diesem Spielzeitpunkt schrumpfen Zonen ohne Wasser (neues Spiel: nach einem Jahr)
  this.graceUntil = GRACE_PERIOD;
  this.pumpCount = 0;
  this.towerCount = 0;
  this.storedWater = 0;
  // zählt jede Änderung mit, damit die 3D-Ansicht weiß, wann sie neu zeichnen muss
  this.revision = 0;
});


WaterManager.prototype.hasPipe = function(x, y) {
  return this._map.testBounds(x, y) && this.pipeMap.worldGet(x, y) > 0;
};


WaterManager.prototype.setPipe = function(x, y, present) {
  if (this._map.testBounds(x, y)) {
    this.pipeMap.worldSet(x, y, present ? 1 : 0);
    this.revision++;
  }
};


/** Hat diese Gebäudekachel (z. B. die Mitte einer Zone) Wasser? */
WaterManager.prototype.isWatered = function(x, y) {
  return this._map.testBounds(x, y) && (this.waterGridMap.worldGet(x, y) & SUPPLIED) !== 0;
};


/** Fließt an dieser Stelle Wasser (für die Darstellung blauer Rohre)? */
WaterManager.prototype.isFlowing = function(x, y) {
  return this._map.testBounds(x, y) && (this.waterGridMap.worldGet(x, y) & FLOWING) !== 0;
};


WaterManager.prototype.isWaterTile = function(x, y) {
  if (!this._map.testBounds(x, y))
    return false;
  var value = this._map.getTileValue(x, y);
  return value >= RIVER && value <= LASTRIVEDGE;
};


// Was zählt diese Kachel im Wassernetz? (Konstanten aus waterRules.ts)
WaterManager.prototype.kindAt = function(x, y) {
  if (!this._map.testBounds(x, y))
    return NOTHING;

  var tile = this._map.getTile(x, y);
  var value = tile.getValue();

  if (value === PUMP || value === WATER_TOWER)
    return SOURCE;

  // Gebäude leiten Wasser zu ihren Nachbarn weiter und verbrauchen es (Straßen und Stromleitungen nicht)
  if (value >= RESBASE && tile.isConductive())
    return CONSUMER;

  return this.pipeMap.worldGet(x, y) > 0 ? PIPE : NOTHING;
};


WaterManager.prototype._nextToWater = function(x, y) {
  return this.isWaterTile(x - 1, y) || this.isWaterTile(x + 1, y) ||
         this.isWaterTile(x, y - 1) || this.isWaterTile(x, y + 1);
};


// Nur die Anzeige auffrischen (z. B. direkt nach dem Verlegen eines Rohrs): Türme füllen sich dabei nicht,
// und es gibt keine Meldung. Die richtige Berechnung macht die Simulation regelmäßig mit doWaterScan().
WaterManager.prototype.refresh = function() {
  this.doWaterScan(true);
};


// Das ganze Netz neu berechnen (in der Simulation direkt nach der Strom-Berechnung)
WaterManager.prototype.doWaterScan = function(previewOnly) {
  var map = this._map;
  var width = map.width;
  var self = this;

  this.waterGridMap.clear();
  var networks = findNetworks(width, map.height, function(x, y) { return self.kindAt(x, y); });

  var shortage = false;
  var pumps = 0;
  var towers = 0;
  var stored = 0;
  var newLevels = {};

  networks.forEach(function(network) {
    var supply = 0;
    var towerKeys = [];
    var levels = [];

    network.sources.forEach(function(index) {
      var x = index % width;
      var y = Math.floor(index / width);
      var tile = map.getTile(x, y);
      if (tile.getValue() === PUMP) {
        pumps++;
        supply += pumpCapacity(tile.isPowered(), self._nextToWater(x, y));
      } else {
        towers++;
        towerKeys.push(index);
        levels.push(self._towerLevels[index] || 0);
      }
    });

    var balance = balanceNetwork(supply, levels, network.consumers.length);
    if (balance.shortage)
      shortage = true;

    towerKeys.forEach(function(key, i) {
      newLevels[key] = balance.towerLevels[i];
      stored += balance.towerLevels[i];
    });

    // Wasser fließt, wenn Pumpen liefern oder Türme etwas abgeben konnten
    var flowing = supply > 0 || balance.supplied > 0;
    if (flowing) {
      network.tiles.forEach(function(index) {
        self.waterGridMap.worldSet(index % width, Math.floor(index / width), FLOWING);
      });
    }

    // Die ersten „supplied“ Verbraucher (in der Reihenfolge, in der das Wasser sie erreicht) bekommen Wasser
    for (var i = 0; i < balance.supplied; i++) {
      var index = network.consumers[i];
      self.waterGridMap.worldSet(index % width, Math.floor(index / width), SUPPLIED | FLOWING);
    }
  });

  this.revision++;
  if (previewOnly)
    return;

  this._towerLevels = newLevels;
  this.pumpCount = pumps;
  this.towerCount = towers;
  this.storedWater = stored;

  if (shortage)
    this._emitEvent(NOT_ENOUGH_WATER);
};


WaterManager.prototype.save = function(saveData) {
  var pipes = [];
  for (var y = 0; y < this._map.height; y++)
    for (var x = 0; x < this._map.width; x++)
      pipes.push(this.pipeMap.worldGet(x, y));

  saveData.pipes = encodePipes(pipes);
  saveData.waterTowers = Object.keys(this._towerLevels).map(function(key) {
    return [Number(key), this._towerLevels[key]];
  }, this);
  saveData.waterGraceUntil = this.graceUntil;
};


WaterManager.prototype.load = function(saveData) {
  var width = this._map.width;
  var pipes = decodePipes(saveData.pipes, width * this._map.height);
  for (var i = 0; i < pipes.length; i++)
    this.pipeMap.worldSet(i % width, Math.floor(i / width), pipes[i]);

  this._towerLevels = {};
  (saveData.waterTowers || []).forEach(function(entry) {
    this._towerLevels[entry[0]] = entry[1];
  }, this);

  this.graceUntil = typeof saveData.waterGraceUntil === 'number' ? saveData.waterGraceUntil
                                                                 : (saveData._cityTime || 0) + GRACE_PERIOD;

  // Anzeige sofort richtig, auch wenn das Spiel pausiert geladen wird (die Karte ist zu diesem Zeitpunkt geladen)
  this.refresh();
};


export { WaterManager };
