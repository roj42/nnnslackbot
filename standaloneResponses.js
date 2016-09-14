//Standalone Responses for lessdremoth that don't require more than shared functions
//Author: Roger Lampe roger.lampe@gmail.com
var helps = {};
var sf = require('./sharedFunctions.js');
var debug = false;
module.exports = function() {
	var sass = sf.loadStaticDataFromFile('sass.json');
	var lastSass = [];

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

			controller.hears(['^little', 'yellow', 'two of these', 'nuprin', 'headache'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				bot.reply(message, "Nuprin: Little, Yellow, Different");
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

			controller.hears([' arah ','^arah','arah$','^arah$'], 'direct_message,ambient', function(bot, message) {
				//\b does not work, hence the above crap
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
			controller.hears(['pick me up', 'riker', 'pick up', 'suave', 'sexy'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var replyker = sf.randomOneOf(rikerText);
				while (lastRiker.indexOf(replyker) > -1) {
					if (debug) bot.botkit.log('dropping recent riker: ' + replyker);
					replyker = sf.randomOneOf(rikerText);
				}
				lastRiker.push(replyker);
				if (lastRiker.length > 3) lastRiker.shift();
				var reply = {
					"username": "Command her, Riker",
					icon_url: sf.randomOneOf(rikerPics),
					text: replyker
				};
				bot.reply(message, reply);
			});

			//unicorn
			var unicornText = sf.loadStaticDataFromFile('unicorn.json');
			var unicornPics = sf.loadStaticDataFromFile('unicornPics.json')
			var lastunicorn = [];
			controller.hears(['bitch', 'unicorn', 'so mean', 'awesome', 'great', 'so good'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				var replycorn = sf.randomOneOf(unicornText);
				while (lastunicorn.indexOf(replycorn) > -1) {
					if (debug) bot.botkit.log('dropping recent unicorn: ' + replycorn);
					replycorn = sf.randomOneOf(unicornText);
				}
				lastunicorn.push(replycorn);
				if (lastunicorn.length > 3) lastunicorn.shift();
				var reply = {
					"username": "Backhand the Unicorn",
					icon_url: sf.randomOneOf(unicornPics),
					text: replycorn
				};
				bot.reply(message, reply);
			});

			//SASS
			controller.hears(['^sass'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				ret.sass(bot, message);
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
			unicornText = sf.loadStaticDataFromFile('unicorn.json')
		},
		sass: function(bot, message) {

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
		}
	};
	return ret;
}();