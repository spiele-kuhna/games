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

import { Config } from './config.js';
import { Game } from './game.js';
import { MapGenerator } from './mapGenerator.js';
import { Simulation } from './simulation.js';
import { SplashCanvas } from './splashCanvas.js';
import { Storage } from './storage.js';
import { Text } from './text.js';
import { gameDate } from './saveSlots.ts';

/*
 *
 * The SplashScreen is the first screen the player will see on launch. It is responsible for map generation,
 * placing UI on screen to allow the player to select a map or load a game, and finally launching the game.
 * This should not be called until the tiles and sprites have been loaded.
 *
 */

var onresize = null;


// If the window is initially too small, try and relaunch if it gets bigger
var makeResizeListener = function(tileSet, spriteSheet) {
  return function(tileSet, spriteSheet, e) {
    $(window).off('resize');
    var s = new SplashScreen(tileSet, spriteSheet);
  }.bind(null, tileSet, spriteSheet);
};


function SplashScreen(tileSet, snowTileSet, spriteSheet) {
  // We don't launch the game if the screen is too small, however, we should retain the right to do so
  // should the situation change...
  if ($('#tooSmall').is(':visible')) {
    onresize = makeResizeListener(tileSet, spriteSheet);
    $(window).on('resize', onresize);
    return;
  }

  this.tileSet = tileSet;
  this.snowTileSet = snowTileSet;
  this.spriteSheet = spriteSheet;
  this.map = MapGenerator();

  // Set up listeners on buttons. When play is clicked, we will move on to get the player's desired
  // difficulty level and city name before launching the game properly
  $('#splashGenerate').click(regenerateMap.bind(this));
  $('#splashPlay').click(acquireNameAndDifficulty.bind(this));
  $('#splashLoad').click(handleLoad.bind(this));

  // Conditionally enable load/save buttons
  // Dorfplaner: „Spiel laden“ ist immer möglich, wenn der Browser speichern darf – auch ohne Spielstand,
  // denn im Lade-Dialog kann man einen Spielstand aus einer Datei übernehmen.
  $('#saveRequest').prop('disabled', !Storage.canStore);
  $('#splashLoad').prop('disabled', !Storage.canStore);
  if (!Storage.canStore)
    $('#splashLoad').attr('title', 'Dieser Browser erlaubt der Seite nicht, Daten zu speichern.');

  // Paint the minimap
  this.splashCanvas = new SplashCanvas('splashContainer', tileSet);
  this.splashCanvas.paint(this.map);

  // Let's get some bits on screen!
  $('.awaitGeneration').toggle();
  $('#splashPlay').focus();
}


// Generate a new map at the user's request, and paint it
var regenerateMap = function(e) {
  e.preventDefault();

  this.map = MapGenerator();
  this.splashCanvas.paint(this.map);
};


// Dorfplaner: „Spiel laden“ öffnet eine Liste aller Spielstände (statt sofort den einzigen zu laden)
var handleLoad = function(e) {
  e.preventDefault();

  $('#splash').hide();
  $('#loadPanel').show();
  $('#loadError').text('');
  renderLoadList.call(this);

  $('#loadBack').off('click').on('click', function() {
    $('#loadPanel').hide();
    $('#splash').show();
  });

  // „Aus Datei laden“: unsichtbares Dateifeld öffnen; die Datei wird nur im Browser gelesen, nicht hochgeladen
  $('#loadImport').off('click').on('click', function() {
    $('#loadFile').val('').trigger('click');
  });
  $('#loadFile').off('change').on('change', importFromFile.bind(this));
};


var importFromFile = function(e) {
  var file = e.target.files && e.target.files[0];
  if (!file)
    return;

  var self = this;
  var reader = new FileReader();
  reader.onload = function() {
    var result = Storage.importSave(String(reader.result));
    $('#loadError').text(result.ok ? '' : result.error);
    renderLoadList.call(self);
  };
  reader.onerror = function() {
    $('#loadError').text('Die Datei konnte nicht gelesen werden.');
  };
  reader.readAsText(file);
};


// Eine Zeile je Spielstand: Name, Spieldatum, Einwohner, gespeichert am – und die Knöpfe dazu
var renderLoadList = function() {
  var self = this;
  var saves = Storage.listSaves();
  var list = $('#loadList').empty();
  $('#loadEmpty').toggle(saves.length === 0);

  saves.forEach(function(entry) {
    var date = gameDate(entry.cityTime);
    var savedAt = new Date(entry.savedAt);
    var meta = Text.months[date.month] + ' ' + date.year + ' · ' + entry.population.toLocaleString('de-DE') +
               ' Einwohner · gespeichert am ' + savedAt.toLocaleDateString('de-DE') + ' um ' +
               savedAt.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}) + ' Uhr';

    // Namen nur als Text einsetzen (nie als HTML), denn sie können aus einer fremden Datei stammen
    var info = $('<div class="saveInfo"></div>')
      .append($('<div class="saveName"></div>').text(entry.name))
      .append($('<div class="saveMeta"></div>').text(meta));

    var load = $('<button>Laden</button>').on('click', function() { launchSaved.call(self, entry.id); });
    var file = $('<button title="Als Datei auf diesem Rechner speichern">Datei</button>')
      .on('click', function() { Storage.downloadSave(entry.id); });
    var remove = $('<button>Löschen</button>').on('click', function() {
      if (window.confirm('Spielstand „' + entry.name + '“ wirklich löschen? Das lässt sich nicht rückgängig machen.')) {
        Storage.deleteSave(entry.id);
        renderLoadList.call(self);
      }
    });

    list.append($('<li></li>').append(info, load, file, remove));
  });
};


// Spielstand laden und das Spiel starten. We won't return from here
var launchSaved = function(id) {
  var savedGame;
  try {
    savedGame = Storage.getSave(id);
  } catch (err) {
    savedGame = null;
  }

  if (savedGame === null) {
    $('#loadError').text('Dieser Spielstand ist beschädigt oder nicht mehr vorhanden.');
    renderLoadList.call(this);
    return;
  }

  // Remove installed event listeners
  $('#splashLoad').off('click');
  $('#splashGenerate').off('click');
  $('#splashPlay').off('click');
  $('#loadBack, #loadImport').off('click');
  $('#loadFile').off('change');

  // Hide the load panel
  $('#loadPanel').hide();

  // Launch
  var g = new Game(savedGame, this.tileSet, this.snowTileSet, this.spriteSheet, Simulation.LEVEL_EASY);
};


// After a map has been selected, call this function to display a form asking the user for
// a city name and difficulty level.
var acquireNameAndDifficulty = function(e) {
  e.preventDefault();

  // Remove the initial event listeners
  $('#splashLoad').off('click');
  $('#splashGenerate').off('click');
  $('#splashPlay').off('click');

  // Get rid of the initial splash screen
  $('#splash').toggle();

  // As a convenience, the city name is not mandatory in debug mode
  if (Config.debug)
    $('#nameForm').removeAttr('required');

  // When the form is submitted, we'll be ready to launch the game
  $('#playForm').submit(play.bind(this));

  // Display the name and difficulty form
  $('#start').toggle();
  $('#nameForm').focus();
};


// This function should be called after the name/difficulty form has been submitted. The game will now be launched
// with the map selected earlier.
var play = function(e) {
  e.preventDefault();

  // As usual, uninstall event listeners, and hide the UI
  $('#playForm').off('submit');
  $('#start').toggle();

  // What values did the player specify?
  var difficulty = $('.difficulty:checked').val() - 0;
  var name = $('#nameForm').val();

  // Launch a new game
  var g = new Game(this.map, this.tileSet, this.snowTileSet, this.spriteSheet, difficulty, name);
};


export { SplashScreen };
