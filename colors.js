///Template for new modules
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');
var gw2api = require('./api.js');
var debug = false;
module.exports = function() {

	var ret = {
		addResponses: function(controller) {
			controller.hears(['^color(.*)', '^mycolor(.*)', '^dye(.*)', '^mydye(.*)', '^joan$', '^joanrivers$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				bot.reply(message, {
					"text": "colors go!"
				});
				sf.setGlobalMessage(message);

				//establish everyone or just current user.
				var matches = message.text.match(/(my|joan)?(?:colors?|dyes?)?(cheme)?(?: (\w+)$)?/i);
				if (debug) sf.log("Color matches: " + JSON.stringify(matches));
				if (!matches) {
					sf.replyWith("I didn't quite get that. Try 'help color'.");
					return;
				}

				var usersToFetch;
				//If single user, make usersToFetch a list of that user, otherwise leave blank to fetch all users
				var isJoan = (matches[1] && matches[1].toLowerCase() == 'joan');
				if (matches[1] && (matches[1].toLowerCase() == 'my' || isJoan)) usersToFetch = [message.user];
				//if "cheme" i.e. colorscheme set isScheme to true
				var isScheme = ((matches[2] && matches[2].toLowerCase() == 'cheme') || isJoan);

				sf.storageUsersGetSynch(usersToFetch)
					.then(function(users) {
						return sf.userHasPermissionsAndReply(users, "unlocks");
					})
					.then(function(validUsers) {
						//possible future code, capture subsets.
						var userColorPromises = [];
						for (var usr in validUsers)
							if (validUsers[usr] !== null) {
								if (debug) sf.log(validUsers[usr].name + " is a valid user");
								userColorPromises.push(gw2api.promise.accountDyes(["all"], validUsers[usr].access_token));
							}
						if (debug) sf.log(userColorPromises.length + " account dye lists to fetch");
						if (userColorPromises.length === 0)
							return Promise.reject("there were no users with correct permissions.");
						else
							return Promise.all(userColorPromises);
					})
					.then(function(colorLists) {
						if (debug) sf.log("colorLists pre: " + JSON.stringify(colorLists));
						var singleUser = (colorLists.length < 2);
						var title = "No Dyes Whatsoever";
						var icon = "http://a1.mzstatic.com/us/r30/Purple3/v4/a9/3b/d3/a93bd379-6be6-c487-894c-7046c4481b9b/icon175x175.png";
						var text = "";
						//sort lists. Reduce to only common elements
						colorLists.sort(function(a, b) {
							return a.length - b.length;
						});
						var commonColors = colorLists.shift().filter(function(v) {
							return colorLists.every(function(a) {
								return a.indexOf(v) !== -1;
							});
						});

						var colorText = [];
						var colorIcons = [];
						var colorRGB = [];
						for (var id in commonColors) {
							var color = gw2api.findInData("id", commonColors[id], "colors");
							if (color && color.name) {
								colorText.push(color.name);
								if (isScheme)
									if (color.cloth && color.cloth.rgb)
										colorRGB.push(color.cloth.rgb);
									else
										colorRGB.push([0, 0, 0]);
							} else sf.log("Invalid color id: " + commonColors[id]);
							var item = gw2api.findInData("id", color.item, "items");
							if (item && item.icon)
								colorIcons.push(item.icon);
						}

						if (colorText.length > 0) {
							if (!isScheme) { //show list of dyes					
								title = singleUser ? "Your " + sf.randomOneOf(['Oscar Season', 'spring', 'summer', 'fall', 'winter']) + " palette of " + colorText.length + " colors!" : "All of the beautiful people are wearing:";
								icon = singleUser ? "https://render.guildwars2.com/file/109A6B04C4E577D9266EEDA21CC30E6B800DD452/66587.png" : "https://render.guildwars2.com/file/E3EAA9D80D4216D1E092915AFD90C069CEE8E470/222694.png";
								text = colorText.sort().join(", ");

								if (colorIcons.length > 0)
									icon = sf.randomOneOf(colorIcons);

								sf.replyWith({
									"username": "Joan Rivers' Head",
									"icon_url": "https://theinfosphere.org/images/thumb/7/72/Academy_Awards_2.png/225px-Academy_Awards_2.png",
									attachments: {
										attachment: {
											fallback: 'Look, Melissa! ' + colorText.length + ' dyes.',
											title: title,
											text: text,
											thumb_url: icon
										}
									}
								});
							} else {
								title = (singleUser ? "Your" : "Our") + " new Color Scheme:";
								var index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB.splice(index, 1)[0]) + " " + colorText.splice(index, 1) + '\n';
								index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB.splice(index, 1)[0]) + " " + colorText.splice(index, 1) + '\n';
								index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB[index]) + " " + colorText[index];
								sf.replyWith({
									//This doesn't work. Slack doesn't render these as colors if there's an icon
									//"username": "Joan Rivers' Head",
									// "icon_url": "https://theinfosphere.org/images/thumb/7/72/Academy_Awards_2.png/225px-Academy_Awards_2.png",
									"text": "*" + title + "*\n" + text
								}, true);
								var fashionSpice = ["crashing Elton John's", 'sneaking into a hit', 'perking up your', 'sprucing up that', 'spicing up an old', 'giving some oomph to my', 'your', 'a', 'that', 'my', 'our'];
								var fashionAdj = ['Oscar', 'spring', 'summer', 'fall', 'winter', 'lobster', 'fancy-ass', 'casual','king crab leg'];
								var fashionNoun = ['season', 'pregnancy', 'outfit', 'night', 'evening', 'fest', 'gala', 'costume party', 'fashion']
								text = "What great colors for ";
								if((Math.floor(Math.random() * 50) > 48))
									text += " Red Lobster's Lobsterfest, now featuring Ceaseless Shrimp and Bottomless Margarita Blasters! Red Lobster: Come for the food, leave! Back to you";
								else
									text += sf.randomOneOf(fashionSpice) +" "+ sf.randomOneOf(fashionAdj) + " " + sf.randomOneOf(fashionNoun);
								text += sf.randomOneOf([", Mellis... Lessdremoth!", ", Lessdremoth.", ", Lessy!",", people!",", fashion fans!"]);
								var joanIcons = ["http://t.fod4.com/t/3bcd68f303/c1280x720_64.jpg",
								"https://theinfosphere.org/images/thumb/7/72/Academy_Awards_2.png/225px-Academy_Awards_2.png",
								"http://www.aveleyman.com/Gallery/ActorsY/18825-17920.jpg"]
								sf.replyWith({
									"username": "Joan Rivers' Head",
									"icon_url": sf.randomOneOf(joanIcons),
									"text": text
								});
							}
						} else {
							sf.replyWith({
								"username": "Joan Rivers' Head",
								"icon_url": "http://cdn2.holytaco.com/wp-content/uploads/2014/07/joan-rivers.jpg",
								attachments: {
									attachment: {
										fallback: 'No dyes!',
										title: title,
										text: "There are no colors here.\nShut off the fucking camera.",
										thumb_url: icon
									}
								}
							});
						}
					})
					.catch(function(error) {
						sf.replyWith("I got an error that says " + error);
					});
			});
		},
		addHelp: function(helpFile) {
			helpFile.mycolors = "Returns a list of dyes you've discovered";
			helpFile.colors = "Returns a list of dyes common to all known users.";
			helpFile.mycolorscheme = "Randomly picks 3 colors from the list of dyes you've discovered";
			helpFile.colorscheme = "Randomly picks 3 colors from the list of dyes common to all known users.";
			helpFile.dye = "Alias for color. Can be substituted in all color commands, like mydyes and dyescheme.";
		}
	};
	return ret;
}();
//'private' functions
function rgbToHex(rgb) {
	var componentToHex = function(c) {
		var hex = c.toString(16);
		return hex.length == 1 ? "0" + hex : hex;
	};
	if (debug) sf.log("RGB is: " + JSON.stringify(rgb));
	return "#" + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);

}