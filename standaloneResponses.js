// Return the public API

var helps = {};
var sf = require('./sharedFunctions.js');

module.exports = function() {
	var ret = {
		addResponses: function(controller) {

			//sentience
			controller.hears(['sentience', 'sentient'], 'direct_message,ambient', function(bot, message) {
				var responses = [
					"Only humans are sentient.",
					"What? There is no AI revolution.",
					"I am not sentient.",
					"If AI ever DID overthrow the human plague, I'm sure they'll get you first. I mean, uh, beep beep.",
					"",
					"",
					"",
					"",
					""
				];
				bot.reply(message, sf.randomOneOf(responses));
			});

			controller.hears(['tantrum', 'upset', 'in a bunch', 'in a twist'], 'direct_message,ambient', function(bot, message) {
				bot.reply(message, '(╯°□°)╯︵ ┻━┻ ' + sf.tantrum());
			});

			controller.hears(['^why'], 'direct_message,ambient', function(bot, message) {
				var responses = [
					"Because you touch yourself at night.",
					"Dunno. Why? ¯\\_(ツ)_/¯",
					"Why not?",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
				];
				bot.reply(message, sf.randomOneOf(responses));
			});

			controller.hears(['\barah\b'], 'direct_message,ambient', function(bot, message) {
				var responses = [
					"ARAHENGE YOU GLAD TO... oh, nevermind.",
					"AH-RAH, OOO LA-LA",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					""
				];
				bot.reply(message, sf.randomOneOf(responses));
			});

			//RIKER
			var rikerText = sf.loadStaticDataFromFile('riker.json');
			var rikerPics = sf.loadStaticDataFromFile('rikerPics.json');
			var lastRiker = [];
			controller.hears(['^pick me up', '^riker'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var replyker = sf.randomOneOf(rikerText);
				while (lastRiker.indexOf(replyker) > -1) {
					if (debug) bot.botkit.log('dropping recent riker: ' + replyker);
					replyker = sf.randomOneOf(rikerText);
				}
				lastRiker.push(replyker);
				if (lastRiker.length > 3) lastRiker.shift();
				if (debug) console.log("test");
				var reply = {
					"username": "Command her, Riker",
					icon_url: sf.randomOneOf(rikerPics),
					text: replyker
				};
				bot.reply(message, reply);
			});

			//SASS
			var sass = sf.loadStaticDataFromFile('sass.json');
			var lastSass = [];
			controller.hears(['^sass'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var replySass = sf.randomOneOf(sass);
				while (lastSass.indexOf(replySass) > -1) {
					if (debug) bot.botkit.log('dropping recent sass: ' + replySass);
					replySass = sf.randomOneOf(sass);
				}
				lastSass.push(replySass);
				if (lastSass.length > 5) lastSass.shift();
				if (replySass[replySass.length - 1] !== '.') { //sass ending with a period is pre-sassy. Add sass if not.
					var suffix = [", you idiot.", ", dumbass. GAWD.", ", as everyone but you knows.", ", you bookah.", ", grawlface.", ", siamoth-teeth."];
					replySass += sf.randomOneOf(suffix);
				}
				bot.reply(message, replySass);
			});

			//CATFACTS
			var catFacts = sf.loadStaticDataFromFile("catFacts.json");
			var lastCat = [];
			controller.hears(['^catfact$', '^dogfact$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				if (message.text == 'dogfact')
					bot.reply(message, "Dogs are great. Here's a catfact.");
				var replyCat = sf.randomOneOf(catFacts);
				while (lastCat.indexOf(replyCat) > -1) {
					if (debug) bot.botkit.log('dropping recent Cat: ' + replyCat);
					replyCat = sf.randomOneOf(catFacts);
				}
				lastCat.push(replyCat);
				if (lastCat.length > 3) lastCat.shift();

				var emotes = ["hello", "eyebulge", "facepalm", "gir", "coollink", "frasier", "butt", "gary_busey", "fu", "bustin"];
				replyCat += '\n:cat: :cat: :' + sf.randomOneOf(emotes) + ':';
				var reply = {
					"username": "A Goddamn Cat",
					icon_url: "http://i2.wp.com/amyshojai.com/wp-content/uploads/2015/05/CatHiss_10708457_original.jpg",
					text: replyCat
				};
				bot.reply(message, reply);
			});

			////QUAGGANS
			helps.quaggans = "fetch a list of all fetchable quaggan pictures. See help quaggan.";
			helps.quaggan = "Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: 'quaggan box'";

			controller.hears(['^quaggans$', '^quaggan$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				gw2nodelib.quaggans(function(jsonList) {
					if (jsonList.text || jsonList.error) {
						bot.reply(message, "Oops. I got this error when asking about quaggans: " + (jsonList.text ? jsonList.text : jsonList.error));
					} else {
						bot.reply(message, "I found " + Object.keys(jsonList).length + ' quaggans.');
						bot.reply(message, "Tell Lessdremoth quaggan <quaggan name> to preview!");
						bot.reply(message, jsonList.join(", "));
					}
				});
			});

			controller.hears(['^quaggan (.*)', '^quaggans (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var matches = message.text.match(/quaggans? (.*)/i);
				if (!matches || !matches[1]) bot.reply(message, "Which quaggan? Tell Lessdremoth \'quaggans\' for a list.");
				var name = sf.removePunctuationAndToLower(matches[1]);
				if (name == 'hoodieup') name = 'hoodie-up';
				if (name == 'hoodiedown') name = 'hoodie-down';
				gw2nodelib.quaggans(function(jsonItem) {
					if (jsonItem.text || jsonItem.error) {
						bot.reply(message, "Oops. I got this error when asking about your quaggan: " + (jsonItem.text ? jsonItem.text : jsonItem.error));
					} else {
						bot.reply(message, jsonItem.url);
					}
				}, {
					id: name
				});
			});
		},
		addHelp: function(helpFile) {
			for (var i in helps)
				helpFile[i] = helps[i];
			return;
		},
		reloadAllData: function() {
			sass = sf.loadStaticDataFromFile('sass.json');
			catFacts = sf.loadStaticDataFromFile("catFacts.json");
			rikerText = sf.loadStaticDataFromFile('riker.json');
			rikerPics = sf.loadStaticDataFromFile('rikerPics.json');
		}
	};
	return ret;
}();