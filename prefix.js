//Search for prefixes by name or by stat name
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');
var prefixData = sf.loadStaticDataFromFile('prefix.json');
var debug = false;

module.exports = function() {

	var ret = {

		addResponses: function(controller) {
			controller.hears(['^prefix (.*)', '^suffix (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var matches = message.text.match(/(prefix|suffix) (['\w]+)\s?(\d{1,2})?\s?(\w*)$/i);
				if (!matches) {
					bot.reply(message, 'No match. Ask me "help prefix" for formatting help.');
				} else {
					var name = (matches[2] ? matches[2].trim() : "");
					var level = matches[3] || null;
					var type = (matches[4] ? matches[4].trim() : "");
					name = sf.removePunctuationAndToLower(name);
					type = scrubType(sf.removePunctuationAndToLower(type));
					var prefixes = prefixSearch(name, type, level);
					if (!prefixes || (Object.keys(prefixes).length) < 1)
						bot.reply(message, 'No' + (level ? ' level ' + level : '') + ' match for \'' + name + '\' of type \'' + type + '\'. Misspell? Or maybe search all.');
					else {
						bot.reply(message, printPrefixes(prefixes));
					}
				}
			});
			controller.hears(['my love for you is like a truck', 'my love for you is like a rock', 'my love for you is ticking clock'], 'direct_message,ambient', function(bot, message) {
				var prefixes = prefixSearch('berserker');
				// if (prefixes)
				bot.reply(message, printPrefixes(prefixes));
			});
		},
		addHelp: function(helpFile) {
			helpFile.prefix = "Takes three arguments.\nOne: Returns a list of all item prefixes and their stats that contain that string.\nTwo (Optional):The character level at which the suffix is available. Note that level 60 prefixes start to show up on weapons (only) at level 52.\nThree (Optional): Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but 'a' will be all.\nExamples: 'prefix berzerker' 'prefix pow gem' 'prefix pow 22 asc'";
			helpFile.suffix = "Alias for prefix. " + JSON.stringify(helpFile.prefix);
		}
	};
	return ret;
}();

//Prefix data looks like
//name = {"type": "standard", "stats": ["Little", "Yellow", "Different"] }
//Stringify a list of prefix data with its associated 'stats' with newline
function printPrefixes(prefixes) {
	var outMessage = "";
	for (var key in prefixes) {
		outMessage += key + ": " + prefixes[key].stats.join(", ") + "\n";
	}
	return outMessage;
}

//Make sure the incoming string is 'standard', 'gem' 'all' or 'ascended'
function scrubType(type) {
	if (!type || type.length === 0) return 'standard';
	else if ('gem'.startsWith(type)) return 'gem';
	else if ('all'.startsWith(type)) return 'all';
	else if ('ascended'.startsWith(type)) return 'ascended';
	else return 'standard';
}

//Search the prfix data for searchTerm and type type
function prefixSearch(searchTerm, type, level) {
	var prefixList = {};
	type = scrubType(type);
	if (debug) sf.log("searching " + searchTerm + " of type " + type + " and level " + level);
	findPrefixesByStat(searchTerm, type, prefixList);
	filterPrefixesByLevel(prefixList, (level ? level : 80));
	findPrefixByName(searchTerm, type, prefixList);
	return prefixList;
}

//Search given prefix data for matching name
function findPrefixByName(name, type, prefixList) {
	for (var key in prefixData) {
		var compare = sf.removePunctuationAndToLower(key);
		if (prefixData.hasOwnProperty(key) && compare.indexOf(name) > -1 && (type == 'all' || prefixData[key].type == type)) {
			if (debug) sf.log("added key from name " + key);
			prefixList[key] = prefixData[key];
		}
	}
	if (debug) sf.log("Total after ByName search " + Object.keys(prefixList).length);
}

//Search given prefix data for matching stat
function findPrefixesByStat(stat, type, prefixList) {
	for (var key in prefixData) {
		if (prefixData.hasOwnProperty(key) && (type == 'all' || prefixData[key].type == type)) {
			for (var subKey in prefixData[key].stats) {
				var compare = sf.removePunctuationAndToLower(prefixData[key].stats[subKey]);
				if (debug) sf.log("subkey " + prefixData[key].stats[subKey]);
				if (compare.indexOf(stat) === 0) {
					if (debug) sf.log("added key from stat " + key);
					prefixList[key] = prefixData[key];
					break;
				}
			}
		}
	}
	if (debug) sf.log("Total after ByStat search " + Object.keys(prefixList).length);
}

function filterPrefixesByLevel(prefixList, level) {
	for (var i in prefixList) {
		if (level < prefixList[i].minlevel || level > prefixList[i].maxlevel)
			delete prefixList[i];
	}
}