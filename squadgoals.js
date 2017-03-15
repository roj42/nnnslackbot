//Template for new modules
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');
var gw2api = require('./api.js');
var colors = require('./colors.js');
var dungeonFreqenter = require('./dungeonFrequenter.js');
var debug = false;
module.exports = function() {

	var ret = {

		addResponses: function(controller) {
			controller.hears(['^squadgoals(.*)', '^sg(.*)', '^dp(.*)', '^dungeonparty(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				//pre-reqs
				if (!gw2api.loaded.achievements || !gw2api.loaded.achievementsCategories) {
					bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
					sf.setGlobalMessage(message);
					return;
				}

				//get dungeon frequenter achievement
				var dungeonFrequenterCheevo = gw2api.findInData('name', 'Dungeon Frequenter', 'achievements');
				if (!dungeonFrequenterCheevo) {
					bot.reply(message, "I couldn't find the Dungeon Frequenter achievement in my loaded data. Try 'db reload'.");
					return;
				}

				sf.setGlobalMessage(message);

				//establish everyone or just current user.
				var matches = message.text.match(/(?:squadgoals|dungeonparty|dp|sg)(?: (\w+)$)?/i);
				if (debug) sf.log("dp matches: " + JSON.stringify(matches));
				if (!matches) {
					sf.replyWith("I didn't quite get that. Try 'help dungeonparty'.");
					return;
				}

				var userSelectString = matches[1] || null;

				//fetch all color permissions from disc
				sf.storageUsersGetSynch()
					.then(function(users) {
						return sf.userHasPermissionsAndReply(users, 'unlocks', 'progression');
					})
					//get selected/valid users
					.then(function(validUsers) {
						if (userSelectString) {
							var requesterName = '';
							var selectedUsers = [];
							for (var c in validUsers) {
								if (validUsers[c].id == message.user)
									requesterName = "Yo, " + validUsers[c].dfid + sf.randomHonoriffic(validUsers[c].dfid, validUsers[c].id) + ". ";
								if (userSelectString && userSelectString.indexOf(validUsers[c].dfid) > -1)
									selectedUsers.push(validUsers[c]);
							}

							selectedUsers = sf.arrayUnique(selectedUsers);
							//If no user id argument or only invalid arguments, print list and return
							if (selectedUsers.length < 1) {
								var replyString = '';
								for (var k in validUsers) {
									replyString += '\n' + validUsers[k].dfid + ': ' + validUsers[k].name;
								}
								sf.replyWith(requesterName + "Here's a list of eligible squadgoalers. You can see a report by string together their codes like 'colors rsja'." + replyString + '\nTry colors <string> again.');
								return Promise.resolve(null);
							} else
								bot.reply(message, "(" + selectedUsers.length + " players selected with correct permissions.)");

							//remove doubles
							validUsers = selectedUsers;
						}
						return validUsers;
					})
					.then(function(validUsers) {
						//get colors
						colors.getColorsForUsers(validUsers)
							.then(colors.getCommonColors)
							.then(function(commonColors) {
								var colorText = [];
								var colorRGB = [];
								colors.colorLookups(commonColors, colorText, colorRGB);
								var text = colors.generateColorScheme(colorText, colorRGB);
								bot.reply(message, "*Wear:*\n" + text);
								setTimeout(function() {
									colors.joanColorCommentary();
								}, 1000);
							});

						//get dungeon
						dungeonFreqenter.getCheevosForUsers(validUsers)
							.then(function(jsonData) {
								if (debug) sf.log("userCheevos size:" + jsonData.length);
								var bitsArrays = [];
								for (var u in jsonData) {
									for (var c in jsonData[u]) {
										if (jsonData[u][c].id && jsonData[u][c].id == dungeonFrequenterCheevo.id && jsonData[u][c].bits && jsonData[u][c].bits.length > 0) {
											if (debug) sf.log("user " + u + "'s bits array:" + JSON.stringify(jsonData[u][c].bits));
											bitsArrays = bitsArrays.concat(jsonData[u][c].bits);
											break;
										}
									}
								}
								//reduce to bits in common
								bitsArrays = sf.arrayUnique(bitsArrays);
								if (debug) sf.log("final bits array:" + JSON.stringify(bitsArrays));
								var candidates = [];
								for (var bit in dungeonFrequenterCheevo.bits) {
									if (bitsArrays.indexOf(bit) < 0)
										candidates.push(dungeonFrequenterCheevo.bits[bit]);
								}
								//pick a random dungeon, and spit it out
								bot.reply(message, "*Where:*\n" + dungeonFreqenter.dungeonNames[sf.randomOneOf(candidates).text]);
							});
					})
					.catch(function(error) {
						sf.replyWith("I got an error that says " + error);
					});
			});
		},
		addHelp: function(helpFile) {
			//helpFile.command = ...
			helpFile.dungeonparty = "Recommend a dungeon party. Takes input like dungeonfreqenter and uses access token data to give you a dungeon everyone could use and a color pallete everyone can wear. Example \'dp ahrj\'";
			helpFile.dp = "Alias for dungeonparty. " + JSON.stringify(helpFile.dungeonparty);
			helpFile.squadgoals = "Alias for dungeonparty. " + JSON.stringify(helpFile.dungeonparty);
			helpFile.sg = "Alias for dungeonparty. " + JSON.stringify(helpFile.dungeonparty);
		}
	};
	return ret;
}();
//'private' functions