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

import { Evaluation } from './evaluation.js';
import * as Messages from './messages.ts';
import { Simulation } from './simulation.js';

// TODO Some kind of rudimentary L20N based on navigator.language?

// Query tool strings
var densityStrings = ['Niedrig', 'Mittel', 'Hoch', 'Sehr hoch'];
var landValueStrings = ['Elendsviertel', 'Einfach', 'Mittel', 'Gehoben'];
var crimeStrings = ['Sicher', 'Gering', 'Mäßig', 'Gefährlich'];
var pollutionStrings = ['Keine', 'Mäßig', 'Stark', 'Sehr stark'];
var rateStrings = ['Schrumpfend', 'Stabil', 'Langsames Wachstum', 'Schnelles Wachstum'];
var zoneTypes = ['Freie Fläche', 'Wasser', 'Wald', 'Trümmer', 'Hochwasser', 'Radioaktiver Abfall',
                 'Feuer', 'Straße', 'Stromleitung', 'Schiene', 'Wohngebiet', 'Gewerbegebiet',
                 'Industriegebiet', 'Hafen', 'Flughafen', 'Kohlekraftwerk', 'Feuerwehr',
                 'Polizei', 'Stadion', 'Kernkraftwerk', 'Zugbrücke',
                 'Radarschirm', 'Brunnen', 'Industriegebiet', 'Heim 3 : Gast 1',
                 'Zugbrücke', 'Reaktorkern'];

// Evaluation window
var gameLevel = {};
gameLevel['' + Simulation.LEVEL_EASY] = 'Leicht';
gameLevel['' + Simulation.LEVEL_MED] = 'Mittel';
gameLevel['' + Simulation.LEVEL_HARD] = 'Schwer';

var cityClass = {};
cityClass[Evaluation.CC_VILLAGE] = 'DORF';
cityClass[Evaluation.CC_TOWN] = 'KLEINSTADT';
cityClass[Evaluation.CC_CITY] = 'STADT';
cityClass[Evaluation.CC_CAPITAL] = 'HAUPTSTADT';
cityClass[Evaluation.CC_METROPOLIS] = 'METROPOLE';
cityClass[Evaluation.CC_MEGALOPOLIS] = 'MEGALOPOLIS';

var problems = {};
problems[Evaluation.CRIME] = 'Kriminalität';
problems[Evaluation.POLLUTION] = 'Verschmutzung';
problems[Evaluation.HOUSING] = 'Wohnungsnot';
problems[Evaluation.TAXES] = 'Steuern';
problems[Evaluation.TRAFFIC] = 'Verkehr';
problems[Evaluation.UNEMPLOYMENT] = 'Arbeitslosigkeit';
problems[Evaluation.FIRE] = 'Brände';

// months
var months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
              'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Tool strings
var toolMessages = {
  noMoney: 'Dafür reicht das Geld nicht',
  needsDoze: 'Erst die Fläche freiräumen (Abriss)'
};

// Message strings
var neutralMessages = {};
neutralMessages[Messages.FIRE_STATION_NEEDS_FUNDING] = true;
neutralMessages[Messages.NEED_AIRPORT] = true;
neutralMessages[Messages.NEED_FIRE_STATION] = true;
neutralMessages[Messages.NEED_ELECTRICITY] = true;
neutralMessages[Messages.NEED_MORE_INDUSTRIAL] = true;
neutralMessages[Messages.NEED_MORE_COMMERCIAL] = true;
neutralMessages[Messages.NEED_MORE_RESIDENTIAL] = true;
neutralMessages[Messages.NEED_MORE_RAILS] = true;
neutralMessages[Messages.NEED_MORE_ROADS] = true;
neutralMessages[Messages.NEED_POLICE_STATION] = true;
neutralMessages[Messages.NEED_SEAPORT] = true;
neutralMessages[Messages.NEED_STADIUM] = true;
neutralMessages[Messages.ROAD_NEEDS_FUNDING] = true;
neutralMessages[Messages.POLICE_NEEDS_FUNDING] = true;
neutralMessages[Messages.WELCOME] = true;

var badMessages = {};
badMessages[Messages.BLACKOUTS_REPORTED] = true;
badMessages[Messages.EARTHQUAKE] = true;
badMessages[Messages.EXPLOSION_REPORTED] = true;
badMessages[Messages.FLOODING_REPORTED] = true;
badMessages[Messages.FIRE_REPORTED] = true;
badMessages[Messages.HEAVY_TRAFFIC] = true;
badMessages[Messages.HELICOPTER_CRASHED] = true;
badMessages[Messages.HIGH_CRIME] = true;
badMessages[Messages.HIGH_POLLUTION] = true;
badMessages[Messages.MONSTER_SIGHTED] = true;
badMessages[Messages.NO_MONEY] = true;
badMessages[Messages.NOT_ENOUGH_POWER] = true;
badMessages[Messages.NUCLEAR_MELTDOWN] = true;
badMessages[Messages.PLANE_CRASHED] = true;
badMessages[Messages.SHIP_CRASHED] = true;
badMessages[Messages.TAX_TOO_HIGH] = true;
badMessages[Messages.TORNADO_SIGHTED] = true;
badMessages[Messages.TRAFFIC_JAMS] = true;
badMessages[Messages.TRAIN_CRASHED] = true;

var goodMessages = {};
goodMessages[Messages.REACHED_CAPITAL] = true;
goodMessages[Messages.REACHED_CITY] = true;
goodMessages[Messages.REACHED_MEGALOPOLIS] = true;
goodMessages[Messages.REACHED_METROPOLIS] = true;
goodMessages[Messages.REACHED_TOWN] = true;

var messageText = {};
messageText[Messages.FIRE_STATION_NEEDS_FUNDING] = 'Die Feuerwehr braucht mehr Geld';
messageText[Messages.NEED_AIRPORT] = 'Das Gewerbe braucht einen Flughafen';
messageText[Messages.NEED_FIRE_STATION] = 'Die Bürger fordern eine Feuerwehr';
messageText[Messages.NEED_ELECTRICITY] = 'Baue ein Kraftwerk';
messageText[Messages.NEED_MORE_INDUSTRIAL] = 'Mehr Industriegebiete nötig';
messageText[Messages.NEED_MORE_COMMERCIAL] = 'Mehr Gewerbegebiete nötig';
messageText[Messages.NEED_MORE_RESIDENTIAL] = 'Mehr Wohngebiete nötig';
messageText[Messages.NEED_MORE_RAILS] = 'Das Schienennetz reicht nicht aus';
messageText[Messages.NEED_MORE_ROADS] = 'Mehr Straßen nötig';
messageText[Messages.NEED_POLICE_STATION] = 'Die Bürger fordern eine Polizeiwache';
messageText[Messages.NEED_SEAPORT] = 'Die Industrie braucht einen Hafen';
messageText[Messages.NEED_STADIUM] = 'Die Bewohner wünschen sich ein Stadion';
messageText[Messages.ROAD_NEEDS_FUNDING] = 'Straßen verfallen, weil Geld fehlt';
messageText[Messages.POLICE_NEEDS_FUNDING] = 'Die Polizei braucht mehr Geld';
messageText[Messages.WELCOME] = 'Willkommen bei Dorfplaner';
messageText[Messages.BLACKOUTS_REPORTED] = 'Stromausfälle – baue ein weiteres Kraftwerk';
messageText[Messages.EARTHQUAKE] = 'Schweres Erdbeben!';
messageText[Messages.EXPLOSION_REPORTED] = 'Explosion gemeldet';
messageText[Messages.FLOODING_REPORTED] = 'Hochwasser gemeldet!';
messageText[Messages.FIRE_REPORTED] = 'Feuer gemeldet';
messageText[Messages.HEAVY_TRAFFIC] = 'Viel Verkehr gemeldet';
messageText[Messages.HELICOPTER_CRASHED] = 'Ein Hubschrauber ist abgestürzt';
messageText[Messages.HIGH_CRIME] = 'Sehr hohe Kriminalität';
messageText[Messages.HIGH_POLLUTION] = 'Sehr hohe Verschmutzung';
messageText[Messages.MONSTER_SIGHTED] = 'Ein Monster wurde gesichtet!';
messageText[Messages.NO_MONEY] = 'DEINE STADT IST PLEITE';
messageText[Messages.NOT_ENOUGH_POWER] = 'Stromausfälle: Die Kraftwerke reichen nicht aus';
messageText[Messages.NUCLEAR_MELTDOWN] = 'Kernschmelze im Kraftwerk!';
messageText[Messages.PLANE_CRASHED] = 'Ein Flugzeug ist abgestürzt';
messageText[Messages.SHIP_CRASHED] = 'Schiffsunglück gemeldet';
messageText[Messages.TAX_TOO_HIGH] = 'Die Bürger sind verärgert: Die Steuern sind zu hoch';
messageText[Messages.TORNADO_SIGHTED] = 'Tornado gemeldet!';
messageText[Messages.TRAFFIC_JAMS] = 'Häufige Staus gemeldet';
messageText[Messages.TRAIN_CRASHED] = 'Ein Zug ist verunglückt';
messageText[Messages.REACHED_CAPITAL] = 'Die Stadt hat 50.000 Einwohner';
messageText[Messages.REACHED_CITY] = 'Die Stadt hat 10.000 Einwohner';
messageText[Messages.REACHED_MEGALOPOLIS] = 'Die Stadt hat 500.000 Einwohner';
messageText[Messages.REACHED_METROPOLIS] = 'Die Stadt hat 100.000 Einwohner';
messageText[Messages.REACHED_TOWN] = 'Die Stadt hat 2.000 Einwohner';

var Text = {
  badMessages: badMessages,
  cityClass: cityClass,
  crimeStrings: crimeStrings,
  densityStrings: densityStrings,
  gameLevel: gameLevel,
  goodMessages: goodMessages,
  landValueStrings: landValueStrings,
  messageText: messageText,
  months: months,
  neutralMessages: neutralMessages,
  problems: problems,
  pollutionStrings: pollutionStrings,
  rateStrings: rateStrings,
  toolMessages: toolMessages,
  zoneTypes: zoneTypes
};

export { Text };
