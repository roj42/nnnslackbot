//Dungeon Frequenter - collates dungeon frequenter achievement for all known users
//Author: Roger Lampe roger.lampe@gmail.com
var gw2api = require('./api.js');
var sf = require('./sharedFunctions.js');

module.exports = function() {

	var ret = {

		addResponses: function(controller) {

			controller.hears(['^squadgoals(.*)','^dungeonfriends(.*)', '^df(.*)', '^dungeonfriendsverbose(.*)', '^dfv(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				//precheck: account achievements loaded 
				if (!gw2api.loaded.achievements || !gw2api.loaded.achievementsCategories) {
					bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
					setGlobalMessage(message);
					return;
				}

				//get dungeon frequenter achievement
				var dungeonFrequenterCheevo = gw2api.findInData('name', 'Dungeon Frequenter', 'achievements');
				if (!dungeonFrequenterCheevo) {
					bot.reply(message, "I couldn't find the Dungeon Frequenter achievement in my loaded data. Try 'db reload'.");
					return;
				}

				//Ready to start. Setup variables
				var num = 0;
				var goodUsers = [];
				var individualBitsArrays = {};

				var matches = message.text.match(/(squadgoals|dungeonfriends(?:verbose)?|dfv?)(?: (\w+)$)?/i);

				var verbose = false;
				if (matches && (matches[1].toLowerCase() == 'dfv' || matches[1].toLowerCase() == 'dungeonfriendsverbose'))
					verbose = true;

				//once all users are loaded, correlate their dungeon frequenter availability.
				var dungeonfriendsCallback = function(jsonData, headers) {
					var name;

					//save this user's individual bits and name
					for (var z in goodUsers) {
						if (headers && headers.options && headers.options.access_token && headers.options.access_token == goodUsers[z].access_token && goodUsers[z].name) {
							name = goodUsers[z].name;
							if (jsonData.error || jsonData.text) {
								sf.replyWith("I got an error looking up the data for " + name + ". They will be omitted from the results.", true);
								//no need to exit. it will find nothing in jsonData and exit, unless this is the last one, then it will assemble the report.
								goodUsers[z].error = true;
							}
							break;
						}
					}

					//each fetched user: peel out frequenter achievement, add the bits to our common bits array
					for (var c in jsonData) {
						if (jsonData[c].id && jsonData[c].id == dungeonFrequenterCheevo.id && jsonData[c].bits && jsonData[c].bits.length > 0) {
							if (name) individualBitsArrays[name] = jsonData[c].bits;
							break;
						}

					}
					//after all users are done, spit out report
					if (++num == goodUsers.length) {
						//get a list of all applicable dungeons, tag each with the names of those who have done it
						var textList = [];
						for (var achievement in dungeonFrequenterCheevo.bits) { //for each bit, see if the account has that corresponding bit marked as done in their list
							if (dungeonFrequenterCheevo.bits[achievement].text) { // almost always exists, but you never know.
								var nameList = [];
								for (var memberName in individualBitsArrays) {
									for (var bit in individualBitsArrays[memberName]) //go through account bits and see if they've done the one we're looking at now 
										if (individualBitsArrays[memberName][bit] == achievement) { //they have, add to list
										nameList.push(memberName);
									}
								}
								if (verbose || nameList.length === 0) { //Add this dingeon to the list if we're in verbose mode (always show) or noone has done it and it's a candidate to do
									var textMain = dungeonFrequenterCheevo.bits[achievement].text; //name of the dungeon
									var textPost = '';
									if (nameList.length > 0) { //non verbose mode will simply have no names appended
										textPost += ' (' + nameList.join(", ");
										textPost += ')';
									}
									textPost += '\n';
									textList.push({ //stored this way so we can sort by name later
										text: textMain,
										textPost: textPost
									});
								}
							}
						}

						var acceptableQuaggans = [
							"https://static.staticwars.com/quaggans/party.jpg",
							"https://static.staticwars.com/quaggans/cheer.jpg",
							"https://static.staticwars.com/quaggans/lost.jpg",
							"https://static.staticwars.com/quaggans/breakfast.jpg"
						];

						textList.sort(function(a, b) {
							return dungeonFriendsOrder.indexOf(a.text) - dungeonFriendsOrder.indexOf(b.text);
						});
						var text = '';

						for (var r in textList) {
							if (verbose)
								text += dungeonNames[textList[r].text] + textList[r].textPost;
							else
								text += textList[r].text + textList[r].textPost;
							if (textList[r].text[0] == "H")
								acceptableQuaggans.push("https://static.staticwars.com/quaggans/killerwhale.jpg");
						}

						acceptableQuaggans = sf.arrayUnique(acceptableQuaggans);
						for (var e in goodUsers)
							if (goodUsers[e].error)
								goodUsers.splice(e, 1);

						var pretextString = '';
						len = goodUsers.length;
						for (var i = 0; i < len; i++) {
							pretextString += goodUsers[i].name;
							if (i == len - 2) pretextString += " and ";
							else if (i !== len - 1) pretextString += ", ";
						}
						if (len == 1) pretextString += " (all alone)";

						var fieldsFormatted = [];
						var half = Math.ceil(textList.length / 2);
						for (var s = 0; s < half; s++) {
							fieldsFormatted.push({
								"value": dungeonNames[textList[s].text] + textList[s].textPost,
								"short": true
							});
							if ((s + half) < textList.length)
								fieldsFormatted.push({
									"value": dungeonNames[textList[(s + half)].text] + textList[(s + half)].textPost,
									"short": true
								});
						}

						var attachments = [];
						var attachment = { //assemble attachment
							title: "Dungeon Friend Report",
							fallback: "Dungeon Friend Report",
							color: '#000000',
							thumb_url: sf.randomOneOf(acceptableQuaggans),
							fields: fieldsFormatted,
						};
						attachments.push(attachment);
						sf.replyWith({
							text: "Party: " + pretextString + ".",
							attachments: attachments,
						}, false);
					}
				};

				//fetch access tokens from storage
				controller.storage.users.all(function(err, userData) {

					var selectedUsers = [];

					var requesterName = '';
					for (var u in userData) {
						//remove those without permissions
						if (userData[u].access_token && sf.userHasPermission(userData[u], 'progression')) {
							goodUsers.push(userData[u]);
							if (userData[u].id == message.user)
								requesterName = "Okay, " + userData[u].dfid + sf.randomHonoriffic(userData[u].dfid, userData[u].id) + ". ";
						}
					}
					//goodUsers is now a list of users with good access tokens
					bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for dungeonfriends.");

					for (var c in goodUsers) {
						if (matches[2] && matches[2].indexOf(goodUsers[c].dfid) > -1)
							selectedUsers.push(goodUsers[c]);
					}

					//If no user id argument or only invalid arguments, print list and return
					if (!matches[2] || selectedUsers.length < 1) {
						var replyString = '';
						for (var k in goodUsers) {
							replyString += '\n' + goodUsers[k].dfid + ': ' + goodUsers[k].name;
						}
						bot.reply(message, requesterName + "Here's a list of eligible dungeon friends. You can see a report by string together their codes like 'df rsja'." + replyString + '\nTry df <string> again.');
						return;
					}

					//remove doubles
					selectedUsers = sf.arrayUnique(selectedUsers);

					var adjective = 'rump ';
					if (selectedUsers.length > 5) adjective = 'completely invalid super';
					else if (selectedUsers.length == 5) adjective = 'full ';
					bot.reply(message, requesterName + "Fetching info for a " + adjective + "group of " + selectedUsers.length + ".");
					goodUsers = selectedUsers;
					sf.setGlobalMessage(message);
					for (var g in goodUsers) {
						gw2api.accountAchievements(dungeonfriendsCallback, {
							access_token: goodUsers[g].access_token
						}, true);
					}

				});
			});

		},
		addHelp: function(helpFile) {
			helpFile.dungeonfriends = "Show a mutually undone Dungeon Frequenter list for given folks with valid access tokens. Example \'df ahrj\'";
			helpFile.dungeonfriendsverbose = "Show all Dungeon Freqenter dungeons, and explicitly mark the given users already-done dungeons. Example \'dfv ahrj\'";
			helpFile.df = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriends);
			helpFile.dfv = "alias for dungeonfriendsverbose. " + JSON.stringify(helpFile.dungeonfriendsverbose);
		}
	};
	return ret;
}();
var dungeonFriendsOrder = ["Ascalonian Catacombs Story", "Catacombs Explorable—Hodgins's Path", "Catacombs Explorable—Detha's Path", "Catacombs Explorable—Tzark's Path", "Caudecus's Manor Story", "Manor Explorable—Asura Path", "Manor Explorable—Seraph Path", "Manor Explorable—Butler's Path", "Twilight Arbor Story", "Twilight Explorable—Leurent's Path", "Twilight Explorable—Vevina's Path", "Twilight Explorable—Aetherpath", "Sorrow's Embrace Story", "Sorrow's Explorable—Fergg's Path", "Sorrow's Explorable—Rasolov's Path", "Sorrow's Explorable—Koptev's Path", "Citadel of Flame Story", "Citadel Explorable—Ferrah's Path", "Citadel Explorable—Magg's Path", "Citadel Explorable—Rhiannon's Path", "Honor of the Waves Story", "Honor Explorable—Butcher's Path", "Honor Explorable-Plunderer's Path", "Honor Explorable—Zealot's Path", "Crucible of Eternity Story", "Crucible Explorable—Submarine Path", "Crucible Explorable—Teleporter Path", "Crucible Explorable—Front Door Path", "Arah Explorable—Jotun Path", "Arah Explorable—Mursaat Path", "Arah Explorable—Forgotten Path", "Arah Explorable—Seer Path"];
var dungeonNames = {
	"Ascalonian Catacombs Story": "ACS",
	"Catacombs Explorable—Hodgins's Path": "AC1 Hodgins",
	"Catacombs Explorable—Detha's Path": "AC2 Detha",
	"Catacombs Explorable—Tzark's Path": "AC3 Tzark",
	"Caudecus's Manor Story": "CMS",
	"Manor Explorable—Asura Path": "CM1 Asura",
	"Manor Explorable—Seraph Path": "CM2 Seraph",
	"Manor Explorable—Butler's Path": "CM3 Butler",
	"Twilight Arbor Story": "TAS",
	"Twilight Explorable—Leurent's Path": "TAU Leurent",
	"Twilight Explorable—Vevina's Path": "TAF Vevina",
	"Twilight Explorable—Aetherpath": "TAAE Aether",
	"Sorrow's Embrace Story": "SES",
	"Sorrow's Explorable—Fergg's Path": "SE1 Fergg",
	"Sorrow's Explorable—Rasolov's Path": "SE2 Rasolov",
	"Sorrow's Explorable—Koptev's Path": "SE3 Koptev",
	"Citadel of Flame Story": "CoFS",
	"Citadel Explorable—Ferrah's Path": "CoF1 Ferrah",
	"Citadel Explorable—Magg's Path": "CoF2 Magg",
	"Citadel Explorable—Rhiannon's Path": "CoF3 Rhiannon",
	"Honor of the Waves Story": "HotWS",
	"Honor Explorable—Butcher's Path": "HotW1 Butcher",
	"Honor Explorable-Plunderer's Path": "HotW2 Plunderer",
	"Honor Explorable—Zealot's Path": "HotW3 Zealot",
	"Crucible of Eternity Story": "CoES",
	"Crucible Explorable—Submarine Path": "CoE1 Submarine",
	"Crucible Explorable—Teleporter Path": "CoE2 Teleporter",
	"Crucible Explorable—Front Door Path": "CoE3 Front Door",
	"Arah Explorable—Jotun Path": "Arah1 Jotun",
	"Arah Explorable—Mursaat Path": "Arah2 Mursaat",
	"Arah Explorable—Forgotten Path": "Arah3 Forgotten",
	"Arah Explorable—Seer Path": "Arah4 Seer"
};