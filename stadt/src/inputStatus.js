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

import { EventEmitter } from './eventEmitter.js';
import { GameCanvas } from './gameCanvas.js';
import { GameTools } from './gameTools.js';
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { PointerInput } from './ui/pointerInput.ts';

var InputStatus = EventEmitter(function(map, tileWidth) {
  this.gameTools = new GameTools(map);

  this.gameTools.addEventListener(Messages.QUERY_WINDOW_NEEDED, MiscUtils.reflectEvent.bind(this, Messages.QUERY_WINDOW_NEEDED));

  this.canvasID = MiscUtils.normaliseDOMid(canvasID);

  this._tileWidth = tileWidth;

  // Keyboard Movement
  this.up = false;
  this.down = false;
  this.left = false;
  this.right = false;
  this.escape = false;

  // Mouse movement
  this.mouseX = -1;
  this.mouseY = -1;

  // Tool buttons
  this.toolName = null;
  this.currentTool = null;
  this.toolWidth = 0;
  this.toolColour = '';

  // Add the listeners
  $(document).keydown(keyDownHandler.bind(this));
  $(document).keyup(keyUpHandler.bind(this));

  // Dorfplaner: Maus, Stift und Finger auf der Karte verarbeitet PointerInput (ui/pointerInput.ts).
  // Es wird in setView() angelegt, weil es die Ansicht (Draufsicht oder 3D) zum Umrechnen braucht.
  this._view = null;
  this._pointerInput = null;

  $('.toolButton').click(toolButtonHandler.bind(this));
  $('#budgetRequest').click(budgetHandler.bind(this));
  $('#evalRequest').click(evalHandler.bind(this));
  $('#disasterRequest').click(disasterHandler.bind(this));
  $('#pauseRequest').click(this.speedChangeHandler.bind(this));
  $('#screenshotRequest').click(screenshotHandler.bind(this));
  $('#settingsRequest').click(settingsHandler.bind(this));
  $('#saveRequest').click(saveHandler.bind(this));
  $('#debugRequest').click(debugHandler.bind(this));
});


var canvasID = '#' + GameCanvas.DEFAULT_ID;
var toolOutputID = '#toolOutput';


var keyDownHandler = function(e) {
  var handled = false;

  switch (e.keyCode) {
    case 38:
    case 87:
      this.up = true;
      handled = true;
      break;

    case 40:
    case 83:
      this.down = true;
      handled = true;
      break;

    case 39:
    case 68:
      this.right = true;
      handled = true;
      break;

    case 37:
    case 65:
      this.left = true;
      handled = true;
      break;

    case 27:
      this.escape = true;
      handled = true;
  }

  if (handled)
    e.preventDefault();
};


var keyUpHandler = function(e) {
  switch (e.keyCode) {
    case 38:
    case 87:
      this.up = false;
      break;

    case 40:
    case 83:
      this.down = false;
      break;

    case 39:
    case 68:
      this.right = false;
      break;

    case 37:
    case 65:
      this.left = false;
      break;

    case 27:
      this.escape = false;
  }
};


var toolButtonHandler = function(e) {
  // Remove highlight from last tool button
  $('.selected').each(function() {
    $(this).removeClass('selected');
    $(this).addClass('unselected');
  });

  // Add highlight
  $(e.target).removeClass('unselected');
  $(e.target).addClass('selected');

  this.toolName = $(e.target).attr('data-tool');
  this.toolWidth = $(e.target).attr('data-size');
  this.currentTool = this.gameTools[this.toolName];
  this.toolColour = $(e.target).attr('data-colour');
  $(toolOutputID).html('Werkzeuge');

  if (this.toolName !== 'query') {
    $(this.canvasID).removeClass('helpPointer');
    $(this.canvasID).addClass('pointer');
  } else {
    $(this.canvasID).removeClass('pointer');
    $(this.canvasID).addClass('helpPointer');
  }

  e.preventDefault();
};


/*
 * Dorfplaner: Verbindet die Eingabe auf der Karte mit der Ansicht (ViewSwitcher aus iso/viewSwitcher.js).
 * PointerInput entscheidet, ob gebaut, verschoben, gezoomt oder abgefragt wird; hier wird es ausgeführt.
 */
InputStatus.prototype.setView = function(view) {
  this._view = view;
  var self = this;
  var canvas = document.querySelector(this.canvasID);

  this._pointerInput = new PointerInput(canvas, {
    hasTool: function() {
      return self.currentTool !== null;
    },
    toolIsDraggable: function() {
      return self.currentTool !== null && self.currentTool.isDraggable;
    },
    hover: function(x, y) {
      self.mouseX = x === null ? -1 : x;
      self.mouseY = y === null ? -1 : y;
    },
    useToolAt: function(x, y) {
      self.mouseX = x;
      self.mouseY = y;
      self._emitEvent(Messages.TOOL_CLICKED, {x: x, y: y});
    },
    tileKeyAt: function(x, y) {
      var tile = self._view.canvasCoordinateToTileCoordinate(x, y);
      return tile === null ? null : tile.x + ',' + tile.y;
    },
    queryAt: function(x, y) {
      // Langes Drücken: kurz das Abfrage-Werkzeug benutzen, danach wieder das gewählte Werkzeug
      var tool = self.currentTool;
      self.currentTool = self.gameTools.query;
      self._emitEvent(Messages.TOOL_CLICKED, {x: x, y: y});
      self.currentTool = tool;
    },
    panBy: function(dx, dy) {
      self._view.scrollBy(dx, dy);
    },
    zoomAt: function(step, x, y) {
      self._view.zoomAt(step, x, y);
    }
  });
};


InputStatus.prototype.speedChangeHandler = function(e) {
  var requestedSpeed = $('#pauseRequest').text();
  var newRequest = requestedSpeed === 'Pause' ? 'Weiter' : 'Pause';
  $('#pauseRequest').text(newRequest);
  this._emitEvent(Messages.SPEED_CHANGE, requestedSpeed);
};


InputStatus.prototype.clearTool = function() {
  if (this.toolName === 'query') {
    $(this.canvasID).removeClass('helpPointer');
    $(this.canvasID).addClass('pointer');
  }

  this.currentTool = null;
  this.toolWidth = 0;
  this.toolColour = '';
  $('.selected').removeClass('selected');
};


var makeHandler = function(message) {
  var m = Messages[message];

  return function(e) {
    this._emitEvent(m);
  };
};


var budgetHandler = makeHandler('BUDGET_REQUESTED');
var debugHandler = makeHandler('DEBUG_WINDOW_REQUESTED');
var disasterHandler = makeHandler('DISASTER_REQUESTED');
var evalHandler = makeHandler('EVAL_REQUESTED');
var screenshotHandler = makeHandler('SCREENSHOT_WINDOW_REQUESTED');
var settingsHandler = makeHandler('SETTINGS_WINDOW_REQUESTED');
var saveHandler = makeHandler('SAVE_REQUESTED');


export { InputStatus };
