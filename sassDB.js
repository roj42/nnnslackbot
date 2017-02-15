//Template for new modules
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');
var debug = false;
var userDB;
var team;
module.exports = function() {
	var ret = {

		addResponses: function(controller) {
			controller.hears(['^sass(.*)$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				loadDBIfNeeded(controller, message)
					.then(function() {
						if (debug) sf.log("total sass:" + JSON.stringify(userDB));
						//input scrub
						var matches = message.text.match(/sass (\w*) ?(.*)?/i);
						if (debug) sf.log("matches: " + JSON.stringify(matches));
						var command = matches ? sf.removePunctuationAndToLower(matches[1]) || '' : 'rand';
						var text = matches ? matches[2] || '' : null;
						var entry = '';
						var term = sf.removePunctuationAndToLower(command);
						if (userDB && userDB[term])
							entry = userDB[term];
						if (debug) sf.log("entry for matched[1]: " + entry);
						switch (command) {
							case 'rand':
								var arr = Object.keys(userDB).map(function(key) {
									return userDB[key];
								});
								if (arr.length > 0)
									bot.reply(message, sf.randomOneOf(arr));
								else
									bot.reply(message, "I have no sass to give.");
								break;
							case 'list':
								var text = [];
								for (var term in userDB) {
									text.push(term);
								}
								if (text.length !== 0)
									bot.reply(message, text.join("\n"));
								else
									bot.reply(message, "User sass is empty.");
								break;
							case 'all':
								var text = [];
								for (var term in userDB) {
									text.push(term + ": " + userDB[term]);
								}
								if (text.length !== 0)
									bot.reply(message, text.join("\n"));
								else
									bot.reply(message, "User sass is empty.");
								break;
							case 'add':
								sf.log("text:" + text.indexOf(' ') + "|term:" + term);
								var term = sf.removePunctuationAndToLower(text.slice(0, text.indexOf(' ')));
								if (!text || text.trim().length === 0 || !term || term.trim().length === 0 || text.indexOf(' ') < 0) {
									bot.reply(message, "Add what, exactly?");
								} else if (term.match(/^add|remove|list|all/i)) {
									bot.reply(message, "No sass terms in the sass!");
								} else {
									var def = text.slice(text.indexOf(' ') + 1);
									bot.reply(message, "I will forever remember that " + term + " means " + def);
									userDB[term] = def;
									controller.storage.teams.save({
										id: message.team,
										userDB: userDB
									});
								}
								break;
							case 'remove':
								if(!text || text.trim().length === 0){
									bot.reply(message, "Remove what, exactly?");
									break;
								}
								var term = sf.removePunctuationAndToLower(text);
								if (term) {
									bot.reply(message, "Goodbye to you, " + term);
								} else
									bot.reply(message, "I, uh, don't see that, but sure. Gone.");
								delete userDB[term];
								controller.storage.teams.save({
									id: message.team,
									userDB: userDB
								});
								break;
							default:
								if (entry) bot.reply(message, entry);
								else bot.reply(message, 'Your input is sort of... muddied. See help sass');
						}
					}).catch(function(error) {
						bot.reply(message, "I got an error that says: " + error);
					});

			});
		},
		addHelp: function(helpFile) {
			helpFile.sass = "User-made database of sassy definitions and responses. Saying just sass gives random sass. sass <term> will show you a pre-made definition.\nOther usages: sass add <term> <definition>, sass remove <term>. See help add and help remove for those usages. Also help list and help all.";
			helpFile.add = "Add a term to the user sass. Usage: sass <term> <definition>. Example: sass add mole For the Moletariate!";
			helpFile.remove = "Remove a term from the user sass. This is not reversible. Example: sass remove mole";
			helpFile.list = "Show all terms from the user sass.";
			helpFile.all = "Show a list of terms and sass from the user sass.";

		}
	};
	return ret;
}();
//'private' functions
function loadDBIfNeeded(controller, message) {
	return new Promise(function(resolve, reject) {
		if (!userDB || !team || team != message.team) {
			userDB = {};
			if (debug) sf.log("loading userDB");
			team = message.team;
			if (debug) sf.log("loading team: " + team);
			controller.storage.teams.get(team, function(err, team) {
				if (err) {
					sf.log("Error:no team data " + JSON.stringify(err));
					reject("no db data found. add some");
				} else {
					if (debug) sf.log("found in team: " + JSON.stringify(team));
					if (team && team.userDB) {
						userDB = team.userDB;
						resolve();
					} else {
						resolve({});
					}
				}
			});
		} else resolve(userDB);
	});
}