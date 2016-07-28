///Template for new modules
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');
var gw2api = require('./api.js');
var debug = false;
module.exports = function() {

	var ret = {
		addResponses: function(controller) {
			controller.hears(['^color(.*)', '^mycolor(.*)', '^dye(.*)', '^mydye(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
				bot.reply(message, "colors go!");
				sf.setGlobalMessage(message);

				//establish everyone or just current user.
				var matches = message.text.match(/(my)?(?:colors?|dyes?)(cheme)?(?: (\w+)$)?/i);
				if(debug) sf.log("Color matches: "+JSON.stringify(matches));
				if (!matches) {
					sf.replyWith("I didn't quite get that. Try 'help color'.");
					return;
				}

				var userToFetch;
				//If single user, make userToFetch a list of that user
				if (matches[1] && matches[1].toLowerCase() == 'my') userToFetch = [message.user];
				//if "cheme" i.e. colorscheme set isScheme to true
				var isScheme = (matches[2] && matches[2].toLowerCase() == 'cheme');

				sf.storageUsersGetSynch(userToFetch)
					.then(function(users) {
						return sf.userHasPermissionsAndReply(users, "unlocks");
					})
					.then(function(validUsers) {
						//possible future code, capture subsets.
						var userColorPromises = [];
						for (var usr in validUsers)
							if (validUsers[usr] !== null) {
								if (debug) sf.log(validUsers[usr].name + " is a valid user", true);
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
								title = singleUser?"Dyes Known: " + colorText.length:"Common Dyes";
								icon = singleUser?"https://render.guildwars2.com/file/109A6B04C4E577D9266EEDA21CC30E6B800DD452/66587.png"
								:"https://render.guildwars2.com/file/E3EAA9D80D4216D1E092915AFD90C069CEE8E470/222694.png";
								text = colorText.sort().join(", ");
							} else {
								title = (singleUser?"Your":"Our")+" new Color Scheme:";
								// icon = "https://render.guildwars2.com/file/FFE3A6302A0409148059239E05C9064D5DAF1E04/561734.png";
								var index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB.splice(index, 1)[0]) + " " + colorText.splice(index, 1) + '\n';
								index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB.splice(index, 1)[0]) + " " + colorText.splice(index, 1) + '\n';
								index = Math.floor(Math.random() * colorText.length);
								text += rgbToHex(colorRGB[index]) + " " + colorText[index];
								sf.replyWith("*" + title + "*\n" + text);
							}
							if (colorIcons.length > 0)
								icon = sf.randomOneOf(colorIcons);
						}
						sf.replyWith({
							attachments: {
								attachment: {
									fallback: 'A list of ' + colorText.length + ' dyes.',
									title: title,
									text: text,
									thumb_url: icon
								}
							}
						});
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