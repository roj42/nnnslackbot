//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
var debug = false; //for debug messages, passe to api and botkit
var recepesLoaded = false; //To signal the bot that the async data load is finished.
var achievementsLoaded = false;
var achievementsCategoriesLoaded = false;
var start; //holds start time for data loading
var globalMessage; //holds message for data loading to repsond to, if loading via bot chat
var toggle = true; //global no-real-use toggle. Used at present to compare 'craft' command output formats.

var Botkit = require('botkit');
var os = require('os');
var fs = require('fs');
var gw2nodelib = require('./api.js');
gw2nodelib.loadCacheFromFile('cache.json'); //note that this file name is a suffix. Creates itemscache.json, recipecache,json, and so on

var prefixData = loadStaticDataFromFile('prefix.json');
var helpFile = [];
var sass = loadStaticDataFromFile('sass.json');
var lastSass = [];
var lastCat = [];

controller = Botkit.slackbot({
  debug: debug,
  json_file_store: 'slackbotDB',
});

//Check for bot token
if (!process.env.token) {
  bot.botkit.log('Error: Specify token in environment');
  process.exit(1);
}
//fire up the bot
var bot = controller.spawn({
  token: process.env.token
}).startRTM(function(err, bot, payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});

reloadAllData(false);

////HELP
controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  var matches = message.text.match(/help ([a-zA-Z ]*)/i);
  if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + listKeys(helpFile));
  else {
    var name = matches[1].toLowerCase();
    bot.reply(message, helpFile[name]);
  }
});

////SASS
controller.hears(['^sass'], 'direct_message,direct_mention,mention', function(bot, message) {
  var replySass = randomOneOf(sass);
  while (lastSass.indexOf(replySass) > -1) {
    if (debug) bot.botkit.log('dropping recent sass: ' + replySass);
    replySass = randomOneOf(sass);
  }
  lastSass.push(replySass);
  if (lastSass.length > 5) lastSass.shift();
  if (replySass[replySass.length - 1] !== '.') { //sass ending with a period is pre-sassy. Add sass if not.
    var suffix = [", you idiot.", ", dumbass. GAWD.", ", as everyone but you knows.", ", you bookah.", ", grawlface.", ", siamoth-teeth."];
    replySass += randomOneOf(suffix);
  }
  bot.reply(message, replySass);
});


////////////////recipe lookup. I apologize.
helpFile.craft = "Lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note mystic forge recipes will just give the 4 forge ingredients. Example:craft Light of Dwyna.";
controller.hears(['^craft (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  //function to assemble an attahcment and call bot reply. Used when finally responding with a recipe
  var replyWithRecipeFor = function(itemToMake) {
    var attachments = assembleRecipeAttachment(itemToMake);
    var foundRecipe = findInData('output_item_id', itemToMake.id, 'recipes');
    var amountString;
    if (foundRecipe && foundRecipe.output_item_count && foundRecipe.output_item_count > 1) { //if it's a multiple, collect multiple amount
      amountString = foundRecipe.output_item_count;
    }
    var descripFlavorized;
    if (itemToMake.description) {
      descripFlavorized = itemToMake.description.replace(/(<.?c(?:=@flavor)?>)/g, "_");
    }
    bot.reply(message, {
      'text': itemToMake.name + (amountString ? " x " + amountString : "") + (itemToMake.level ? " (level " + itemToMake.level + ")" : "") + (descripFlavorized ? "\n" + descripFlavorized : ""),
      attachments: attachments,
      // 'icon_url': itemToMake.icon,
      // "username": "RecipeBot",
    }, function(err, resp) {
      if (err || debug) bot.botkit.log(err, resp);
    });

  };

  var matches = message.text.match(/craft (.*)/i);
  if (!recepesLoaded) { //still loading
    bot.reply(message, "I'm still loading recipe data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
  } else if (!matches || !matches[0]) { //weird input? Should be impossible to get here.
    bot.reply(message, "I didn't quite get that. Maybe ask \'help craft\'?");
  } else { //search for recipes that produce items with names that contain the search string
    var searchTerm = matches[1];
    var itemSearchResults = findCraftableItemByName(searchTerm);
    if (debug) bot.botkit.log(itemSearchResults.length + " matches found");
    if (itemSearchResults.length === 0) { //no match
      bot.reply(message, "No item names contain that exact text.");
    } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
      replyWithRecipeFor(itemSearchResults[0]);
    } else if (itemSearchResults.length > 10) { //too many matches in our 'contains' search, notify and give examples.
      var itemNameFirst = itemSearchResults[0].name;
      var itemNameLast = itemSearchResults[itemSearchResults.length - 1].name;
      bot.reply(message, "Woah. I found " + itemSearchResults.length + ' items. Get more specific.\n(from ' + itemNameFirst + ' to ' + itemNameLast + ')');
    } else { //10 items or less, allow user to choose
      bot.startConversation(message, function(err, convo) {
        var listofItems = '';
        for (var i in itemSearchResults) {
          var levelString; //Attempt to differentiate same-name items by their level, or their level in the description
          if (itemSearchResults[i].level) {
            levelString = itemSearchResults[i].level;
          } else if (itemSearchResults[i].description) {
            var matches = itemSearchResults[i].description.match(/level (\d{1,2})/i);
            if (debug) bot.botkit.log("matches " + JSON.stringify(matches) + " of description " + itemSearchResults[i].description);
            if (matches && matches[1]) {
              levelString = matches[1];
            }
          }
          listofItems += '\n' + [i] + ": " + itemSearchResults[i].name + (levelString ? " (level " + levelString + ")" : "") + (itemSearchResults[i].forged ? " (Mystic Forge)" : "");
        }
        convo.ask('I found multiple items with that name. Which number you mean? (say no to quit)' + listofItems, [{
          //number, no, or repeat
          pattern: new RegExp(/^(\d{1,2})/i),
          callback: function(response, convo) {
            //if it's a number, and that number is within our search results, print it
            var matches = response.text.match(/^(\d{1,2})/i);
            var selection = matches[0];
            if (selection < itemSearchResults.length) {
              replyWithRecipeFor(itemSearchResults[selection]);
            } else convo.repeat(); //invalid number. repeat choices.
            convo.next();
          }
        }, {
          //negative response. Stop repeating the list.
          pattern: bot.utterances.no,
          callback: function(response, convo) {
            convo.say('\'Kay.');
            convo.next();
          }
        }, {
          default: true,
          callback: function(response, convo) {
            // loop back, user needs to pick or say no.
            convo.say("Hum, that doesn't look right. Next time choose a number of the recipe you'd like to see.");
            convo.next();
          }
        }]);
      });
    }
  }
});

//////DATA
controller.hears(['^db reload$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'Are you sure? It can take a long time. Say \'db reload go\' to lauch for real');
});

controller.hears(['^db reload go$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'You asked for it. Starting reload.');
  globalMessage = message;
  reloadAllData(true);
});


/////QUAGGANS
helpFile.quaggans = "fetch a list of all fetchable quaggan pictures. See help quaggan.";
helpFile.quaggan = "Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: 'quaggan box'";

controller.hears(['^quaggans$', '^quaggan$'], 'direct_message,direct_mention,mention', function(bot, message) {
  gw2nodelib.quaggans(function(jsonList) {
    if (jsonList.text || jsonList.error) {
      bot.reply(message, "Oops. I got this error when asking about quaggans: " + (jsonList.text ? jsonList.text : jsonList.error));
    } else {
      bot.reply(message, "I found " + Object.keys(jsonList).length + ' quaggans.');
      bot.reply(message, "Tell Lessdremoth quaggan <quaggan name> to preview!");
      bot.reply(message, listToString(jsonList));
    }
  });
});

controller.hears(['quaggan (.*)', 'quaggans (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  var matches = message.text.match(/quaggans? (.*)/i);
  if (!matches || !matches[1]) bot.reply(message, "Which quaggan? Tell Lessdremoth \'quaggans\' for a list.");
  var name = removePunctuationAndToLower(matches[1]);
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

/////ACCESS TOKEN
helpFile.access = "Set up your guild wars account to allow lessdremoth to read data. Direct Message 'access token help' for more information.";
// controller.hears(['access token'], 'direct_mention,mention', function(bot, message) {
//   bot.reply(message, "Direct message me the phrase \'access token help\' for help.");
// });

controller.hears(['access token help', 'help access', 'help access token'], 'direct_message', function(bot, message) {
  bot.reply(message, "First you'll need to log in to arena net to create a token. Do so here:\nhttps://account.arena.net/applications\nRight now I only use the 'account', 'progression', and 'characters' sections.\nCopy the token, and then direct message me (here) with \'access token <your token>\'");
  controller.storage.users.get(message.user, function(err, user) {
    if (user) {
      bot.reply(message, "Note that I already have an access token on file for you. You can say 'access token' with no argument and I'll refresh your token information I keep on file.");
    }
  });
});

controller.hears(['access token(.*)'], 'direct_mention,mention,direct_message', function(bot, message) {
  //collect information about the user token and basic account info for use later.
  controller.storage.users.get(message.user, function(err, user) {
    if (err)
      bot.reply(message, "I got an error while loading your user data: " + err);
    var matches = message.text.match(/access token (.*)/i);
    if (user && user.access_token) {
      if (!matches || (matches[1] && matches[1] == user.access_token)) { //use existing token
        bot.reply(message, "Refreshing your token.");
      } else {
        bot.reply(message, "Replacing your existing token.");
        user.access_token = matches[1];
      }
    } else if (!matches || !matches[1]) { //new user, no token given
      bot.reply(message, "No token on file for you. Say 'access token help' in this channel for instructions.");
      return;
    } else { //new user, new token
      user = {
        id: message.user,
        access_token: matches[1]
      };
    }
    gw2nodelib.tokeninfo(function(tokenInfo) {
      bot.botkit.log(JSON.stringify(tokenInfo));
      if (tokenInfo.error) {
        bot.reply(message, "I got an error looking up your token. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.");
      } else {
        user.permissions = tokenInfo.permissions;
        gw2nodelib.account(function(accountInfo) {
          bot.botkit.log(JSON.stringify(accountInfo));
          if (accountInfo.error || accountInfo.text) {
            bot.reply(message, "I got an error looking up your account information. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.\ntext from API: " + accountInfo.text + "\nerror: " + accountInfo.error);
          }
          user.name = accountInfo.name;
          user.guilds = accountInfo.guilds;
          controller.storage.users.save(user, function(err, id) {
            if (err)
              bot.reply(message, "I got an error while saving: " + err);
            else
              bot.reply(message, 'Done! Saved for later.');
          });
        }, {
          access_token: user.access_token
        }, true);
      }
    }, {
      access_token: user.access_token
    }, true);
  });
});

function userHasPermission(user, permission) {
  if (user && user.permissions)
    for (var p in user.permissions)
      if (user.permissions[p] == permission)
        return true;
  return false;

}

var dungeonFriendsOrder = ["Ascolonian Catacombs Story", "Catacombs Explorable—Hodgins's Path", "Catacombs Explorable—Detha's Path", "Catacombs Explorable—Tzark's Path", "Caudecus's Manor Story", "Manor Explorable—Asura Path", "Manor Explorable—Seraph Path", "Manor Explorable—Butler's Path", "Twilight Arbor Story", "Twilight Explorable—Leurent's Path", "Twilight Explorable—Vevina's Path", "Twilight Explorable—Aetherpath", "Sorrow's Embrace Story", "Sorrow's Explorable—Fergg's Path", "Sorrow's Explorable—Rasolov's Path", "Sorrow's Explorable—Koptev's Path", "Citadel of Flame Story", "Citadel Explorable—Ferrah's Path", "Citadel Explorable—Magg's Path", "Citadel Explorable—Rhiannon's Path", "Honor of the Waves Story", "Honor Explorable—Butcher's Path", "Honor Explorable-Plunderer's Path", "Honor Explorable—Zealot's Path", "Crucible of Eternity Story", "Crucible Explorable—Submarine Path", "Crucible Explorable—Teleporter Path", "Crucible Explorable—Front Door Path", "Arah Explorable—Jotun Path", "Arah Explorable—Mursaat Path", "Arah Explorable—Forgotten Path", "Arah Explorable—Seer Path"];

function dungeonFrendSort(a, b) {
  return dungeonFriendsOrder.indexOf(a.text) - dungeonFriendsOrder.indexOf(b.text);
}

helpFile.dungeonfriends = "Show a mutually undone Dungeon Frequenter list for given folks with valid access tokens.";
helpFile.dungeonfriendsverbose = "Show all Dungeon Freqenter dungeons, with the given users already-done dungeons tagged.";
helpFile.df = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriends);
helpFile.dfv = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriendsverbose);


controller.hears(['^dungeonfriends$', '^df$', '^dungeonfriendsverbose$', '^dfv$'], 'direct_message,direct_mention,mention', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }
  var verbose = false;
  if (message.text == 'dfv' || message.text == 'dungeonfriendsverbose')
    verbose = true;

  //get dungeon frequenter achievment
  var dungeonFrequenterCheevo = findInData('name', 'Dungeon Frequenter', 'achievements');

  var num = 0;
  var goodUsers = [];
  //  var commonBitsArray = [];
  var individualBitsArrays = {};

  //once all users are loaded, correlate their dungeon frequenter availability.
  var dungeonfriendsCallback = function(jsonData, headers) {
    //each fetched user: peel out frequenter achievment, add the bits to our common bits array
    for (var c in jsonData) {
      if (jsonData[c].id == dungeonFrequenterCheevo.id && jsonData[c].bits && jsonData[c].bits.length > 0) {
        ////////Common bits array instead
        //        commonBitsArray = commonBitsArray.concat(jsonData[c].bits);


        var name;
        //save this user's individual bits and name
        for (var z in goodUsers) {
          if (headers && headers.options && headers.options.access_token && headers.options.access_token == goodUsers[z].access_token && goodUsers[z].name) {
            name = goodUsers[z].name;
          }
        }
        if (name) individualBitsArrays[name] = jsonData[c].bits;
        break;
      }

    }
    //after all users are done, spit out report
    if (++num == goodUsers.length) {
      ////////Common bits array instead
      //      commonBitsArray = arrayUnique(commonBitsArray);
      //      bot.botkit.log("Dungeonfriend array collapsed to: " + JSON.stringify(commonBitsArray));
      //Feed achievemenparse a fakey player cheevo that treats the combines bits as the player bits
      // var fakeyCheevo = {
      //   bits: commonBitsArray
      // };
      ////////////achievementParseBitsAsName(gameCheevo, includeUndone, includeDone, isCategory, accountCheevo) {
      //      var text = achievementParseBitsAsName(dungeonFrequenterCheevo, true, true, false, fakeyCheevo);
      ////////end Common bits array instead

      //get a list of all applicable dungeons, tag each with the names of those who have done it
      var textList = [];
      for (var achievement in dungeonFrequenterCheevo.bits) { //for each bit, see if the account has that corresponding bit marked as done in their list
        if (dungeonFrequenterCheevo.bits[achievement].text) { // almost always exists, but you never know.
          var nameList = [];
          for (var memberName in individualBitsArrays) {
            for (var bit in individualBitsArrays[memberName]) //go through account bits and see if they've done the one we're looking at now 
              if (individualBitsArrays[memberName][bit] == achievement) {
              nameList.push(memberName);
            }
          }
          if (verbose || nameList.length === 0) {
            var textMain = dungeonFrequenterCheevo.bits[achievement].text;
            var textPost = '';
            if (nameList.length > 0) {
              textPost += ' (' + listToString(nameList, false);
              textPost = textPost.substring(0, textPost.length - 1); //chop off trailing space
              textPost += ')';
            }
            textPost += '\n';
            textList.push({
              text: textMain,
              textPost: textPost
            });
          }
        }
      }


      textList.sort(dungeonFrendSort);
      var text = '';

      for (var s in textList)
        text += textList[s].text + textList[s].textPost;

      var pretextString = '';
      len = goodUsers.length;
      for (var i = 0; i < len; i++) {
        pretextString += goodUsers[i].name;
        if (i == len - 2) pretextString += " and ";
        else if (i !== len - 1) pretextString += ", ";
      }
      if (len == 1) pretextString += "- all by their lonesome";

      var acceptableQuaggans = [
        "https://static.staticwars.com/quaggans/party.jpg",
        "https://static.staticwars.com/quaggans/cheer.jpg",
        "https://static.staticwars.com/quaggans/lost.jpg",
        "https://static.staticwars.com/quaggans/breakfast.jpg"
      ];

      var attachments = [];
      var attachment = { //assemble attachment
        //        pretext: pretextString + "can party in any of the below for mutual benefit.",
        title: "Dungeon Friend Report",
        color: '#000000',
        thumb_url: randomOneOf(acceptableQuaggans),
        fields: [],
        text: text,
      };
      attachments.push(attachment);
      globalMessage.say({
        text: "Party: " + pretextString + ".",
        attachments: attachments,
      });
      globalMessage.next();
      globalMessage = '';
    }
  };

  //fetch access token from storage
  controller.storage.users.all(function(err, userData) {
    //extracurrecular pushes
    // userData.push({
    //   access_token: "4B2E3AC4-B472-0348-B409-EDDB124225FC842894FC-4FE2-4222-9C36-4A25CC06960B",
    //   permissions: ["progression", "wallet", "guilds", "builds", "account", "characters", "inventories", "unlocks", "pvp"],
    //   name: "Igu.8473",
    //   guilds: ["E971D300-115C-E511-9021-E4115BDFA895"]
    // });
    userData.push({
      access_token: "AC3E4FD8-5ECA-EE4C-80AB-7BD66255C12545D6A9DE-5A96-4905-87DC-CF1E69D36673",
      permissions: ["tradingpost", "characters", "pvp", "progression", "wallet", "guilds", "builds", "account", "inventories", "unlocks"],
      name: "Rufus.5940",
      guilds: ["E971D300-115C-E511-9021-E4115BDFA895"]
    });

    for (var u in userData) {
      //remove those without permissions
      if (userData[u].access_token && userHasPermission(userData[u], 'account') && userHasPermission(userData[u], 'progression')) {
        var nameClean = userData[u];
        var shortName = userData[u].name;
        if (shortName.indexOf('.') > 0) nameClean.name = shortName.substring(0, shortName.indexOf('.'));
        goodUsers.push(nameClean);
      }
    }
    bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for dungeonfriends.");

    //Establish the group and leave result in goodUsers
    var friendIds = '0123456789ABCDEFG';
    if (goodUsers.length > friendIds) {
      bot.reply(message, "Oh dear. I can only handle " + friendIds.length + " possible Dungeon Friends, and you have " + goodUsers.length + "!");
      goodUsers = goodUsers.substring(0, friendIds.length);
    }
    var listofGoodUsers = '';
    for (var p in goodUsers) {
      listofGoodUsers += friendIds[p] + ": " + goodUsers[p].name;
      if (p !== goodUsers.length - 1) listofGoodUsers += "\n";
    }
    var patternString = new RegExp("^([" + friendIds + "]+)", 'i');
    bot.startConversation(message, function(err, convo) {


      convo.ask("Respond with the group you'd like to check, like '12345' or '156AF'. 'no' to quit.\n" + listofGoodUsers, [{
        //number, no, or repeat
        pattern: patternString,
        callback: function(response, convo) {
          //if it's a number, and that number is within our search results, print it
          //load all users
          var selectedUsers = [];
          var validNameCount = 0;
          var groupCharString = response.text;
          for (var c in groupCharString) {
            if (goodUsers[friendIds.indexOf(groupCharString[c])]) {
              selectedUsers.push(goodUsers[friendIds.indexOf(groupCharString[c])]);
              validNameCount++;
            }
          }
          //remove doubles
          selectedUsers = arrayUnique(selectedUsers);
          if (selectedUsers.length < 1) {
            convo.say("Your group was invalid. Retry and make different selections.");
            convo.next();
          } else {
            var adjective = 'rump ';
            if (selectedUsers.length > 5) adjective = 'super';
            else if (selectedUsers.length == 5) adjective = 'full ';
            convo.say("A " + adjective + "group of " + validNameCount + ".");
            goodUsers = selectedUsers;
            globalMessage = convo;
            for (var g in goodUsers) {
              gw2nodelib.accountAchievements(dungeonfriendsCallback, {
                access_token: goodUsers[g].access_token
              }, true);
            }
          }
        }
      }, {
        //negative response. Stop repeating the list.
        pattern: bot.utterances.no,
        callback: function(response, convo) {
          convo.say('\'Kay.');
          convo.next();
        }
      }, {
        default: true,
        callback: function(response, convo) {
          // loop back, user needs to pick or say no.
          convo.say("Hum, that doesn't look right. Next time respond with the group you'd like to check.");
          convo.next();
        }
      }]);
    });
  });
});


function achievementParseBitsAsName(gameCheevo, includeUndone, includeDone, isCategory, accountCheevo) {
  //Cover Two cases of cheevo: 'standard' cheevos, and those with bits that define their parts 
  var text = [];
  //has no bits so we're only concerned if you're done this base cheevo. We'll add a fakey bit so that it's added according to done logic below.
  if (!gameCheevo.bits) {
    gameCheevo.bits = [{
      text: gameCheevo.name
    }];
  }
  for (var achievement in gameCheevo.bits) { //for each bit, see if the account has that corresponding bit marked as done in their list
    if (gameCheevo.bits[achievement].text) { // almost always exists, but you never know.
      var doneByUser;
      if (accountCheevo) { // see if this particular bit 
        doneByUser = accountCheevo.done; //default that catches bitless cheevos: is the base cheevo done?
        for (var bit in accountCheevo.bits) //go through account bits and see if they've done the one we're looking at now 
          if (accountCheevo.bits[bit] == achievement)
          doneByUser = true;
      }
      var doneIndicator = (includeUndone && includeDone && doneByUser) ? ' - DONE' : ''; //Are we displaying both? If so, indicate done items with the done indicator
      //if we're showing done, and the user has it, add it
      //if we're showing undone and the user doesn't have it, add it.
      //append the already worked out done indicator
      if ((includeDone && doneByUser) || (includeUndone && !doneByUser)) {
        //Category cheevos will have many achievements to display, so prepend the main name to each bit
        text.push(((isCategory && gameCheevo.bits.length > 1) ? gameCheevo.name + ' - ' : '') + gameCheevo.bits[achievement].text + doneIndicator);
      }
    }
  }
  return text; //return the list
}

//find an achievement in the freshly fetched account achievements by id
function findInAccount(id, accountAchievements) {
  for (var t in accountAchievements) {
    if (accountAchievements[t].id == id) {
      return accountAchievements[t];
    }
  }
}


/////Cheevos
var cheevoList = {};
cheevoList.dungeonexplore = {
  name: 'Dungeons',
  category: true,
  includeDone: true,
  includeUndone: false,
  exclude: ['Dungeon Master', 'Hobby Dungeon Explorer', 'Dungeon Frequenter']
};
cheevoList.de = cheevoList.dungeonexplore;
cheevoList.dungeonfrequenter = {
  name: 'Dungeon Frequenter',
  includeDone: false,
  includeUndone: true,
  category: false
};
cheevoList.df = cheevoList.dungeonfrequenter;
cheevoList.jumpingpuzzles = {
  name: 'Jumping Puzzles',
  includeDone: false,
  includeUndone: true,
  category: true
};
cheevoList.jp = cheevoList.jumpingpuzzles;
cheevoList.jpr = {
  name: 'Jumping Puzzles',
  category: true,
  random: true
};

helpFile.cheevo = "Display a report of several types of achievements. Example \'cheevo dungeonfrequenter\'.\nSupported so far: ";
helpFile.cheevo += listToString(Object.keys(cheevoList));

controller.hears(['cheevo(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }
  //fetch access token from storage
  controller.storage.users.get(message.user, function(err, user) {
    //precheck: access token.
    if (!user || !user.access_token || !userHasPermission(user, 'account')) {
      bot.botkit.log('ERROR: cheevo no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'account') ? "with correct 'account' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    var matches = removePunctuationAndToLower(message.text).match(/cheevo\s?(\w*)$/i);
    if (!matches || !matches[1] || !cheevoList[matches[1]]) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help cheevo\'?");
      return;
    }
    var cheevoToDisplay = cheevoList[matches[1]];
    //we're here with a valid thing to look up, accesstoken, and data ready.
    gw2nodelib.accountAchievements(function(accountAchievements) {
      if (accountAchievements.text || accountAchievements.error) {
        bot.reply(message, "Oops. I got this error when asking for your achievements: " + (accountAchievements.text ? accountAchievements.text : accountAchievements.error));
        return;
      }
      if (debug) bot.botkit.log("I found " + Object.keys(accountAchievements).length + ' character cheevos.');
      //for report totals
      var current = 0;
      var max = 0;

      var category = [];
      //get all cheevos in the category. Push lone cheevos to the category list
      if (debug) bot.botkit.log("trying to look up: " + JSON.stringify(cheevoToDisplay));
      if (cheevoToDisplay.category) {
        category = findInData('name', cheevoToDisplay.name, 'achievementsCategories');
        if (debug) bot.botkit.log("I found this category:" + JSON.stringify(category));
      } else {
        category.achievements = [];
        var loneCheevo = findInData('name', cheevoToDisplay.name, 'achievements');
        if (debug) bot.botkit.log("I found this cheevo: " + JSON.stringify(loneCheevo));
        category.achievements.push(loneCheevo.id);
      }


      var attachments = [];
      var text = '';
      //assemble list of achievement names

      if (cheevoToDisplay.random) { //cutout. Just pick a cheevo at random.
        var randomNum;
        var alreadyDone = true;
        //keep picking until we find one the user has not done.
        while (alreadyDone) {
          randomNum = Math.floor(Math.random() * category.achievements.length);
          var acctCheevo = findInAccount(category.achievements[randomNum], accountAchievements);
          if (!acctCheevo || !acctCheevo.done) {
            alreadyDone = false;
          }
        }
        var randomCheevo = findInData('id', category.achievements[randomNum], 'achievements'); //find the achievement to get the name
        //replace descriptions ending in periods with exclamation points for MORE ENTHSIASM
        var desc = randomCheevo.description.replace(/(\.)$/, '');
        desc += '!';
        var url = "http://wiki.guildwars2.com/wiki/" + randomCheevo.name.replace(/\s/g, "_");
        bot.reply(message, "Go do '" + randomCheevo.name + "'.\n" + desc + "\n" + url);
      } else {
        for (var n in category.achievements) { //for each acievment in the category list
          var gameCheevo = findInData('id', category.achievements[n], 'achievements'); //find the achievement to get the name
          if (gameCheevo) {
            if (debug) bot.botkit.log("I found this gw cheevo: " + gameCheevo.name);
            var includeSubCheevo = true; //exclude any category cheevos specifically left out
            for (var i in cheevoToDisplay.exclude) {
              if (gameCheevo.name == cheevoToDisplay.exclude[i])
                includeSubCheevo = false;
            }

            if (includeSubCheevo) { //Display this cheevo's parts.
              var rollupCheevo = findInAccount(gameCheevo.id, accountAchievements); //See if the account is done with this achievement
              if (cheevoToDisplay.includeDone && rollupCheevo && rollupCheevo.done === true) { //if they're done and we're showing 'dones' don't list out all the parts
                current += rollupCheevo.current; //add the current count of this base achievement to the running total of dones
                max += rollupCheevo.max; //add the max to the running total of max
                text += gameCheevo.name + ' - DONE (' + rollupCheevo.max + ')\n';
              } else { //list parts (if any)
                //Running total; each bit or single bitless achievement that is done adds to current
                var accountCheevo = findInAccount(gameCheevo.id, accountAchievements); //does this account have this cheevo?
                var doneList = achievementParseBitsAsName(gameCheevo, cheevoToDisplay.includeUndone, cheevoToDisplay.includeDone, cheevoToDisplay.category, accountCheevo);
                for (var str in doneList) {
                  text += doneList[str] + '\n';
                }
                if (accountCheevo) current += accountCheevo.current;
                max += gameCheevo.tiers[gameCheevo.tiers.length - 1].count; //add the total needed for completion to max
              }
            }
          }
        }

        var pretextString; //Helper text to you know if we're listing done or not done items
        if (!cheevoToDisplay.includeUndone || !cheevoToDisplay.includeDone)
          if (cheevoToDisplay.includeUndone) pretextString = 'You have yet to do the following:';
          else if (cheevoToDisplay.includeDone) pretextString = 'You have completed the following:';
        var attachment = { //assemble attachment
          pretext: pretextString,
          //example: Dungeon Frequenter Report 5 of 8
          title: cheevoToDisplay.name + " Report" + (current + max > 0 ? ': ' + current + ' of ' + max : ''),
          color: '#000000',
          thumb_url: (category.icon ? category.icon : "https://wiki.guildwars2.com/images/d/d9/Hero.png"),
          fields: [],
          text: text,
        };
        attachments.push(attachment);
        bot.reply(message, {
          attachments: attachments,
        }, function(err, resp) {
          if (err || debug) bot.botkit.log(err, resp);
        });
      }
    }, {
      access_token: user.access_token
    }, true);
  });
});


/////CHARACTERS
helpFile.deaths = "Display a report of characters on your account, and their career deaths.";
helpFile.characters = 'Alias for character deaths. ' + JSON.stringify(helpFile.characterDeaths);
controller.hears(['^deaths$', '^characters$'], 'direct_message,direct_mention,mention', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
    if (!user || !user.access_token || !userHasPermission(user, 'characters')) {
      bot.botkit.log('ERROR: characters: no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'characters') ? "with correct 'characters' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    gw2nodelib.characters(function(jsonList) {
      if (jsonList.text || jsonList.error) {
        bot.reply(message, "Oops. I got this error when asking for a list of your characters: " + (jsonList.text ? jsonList.text : jsonList.error));
      } else {
        bot.reply(message, "I found " + Object.keys(jsonList).length + ' characters.');
        gw2nodelib.characters(function(jsonList) {
          if (jsonList.text || jsonList.error) {
            bot.reply(message, "Oops. I got this error when asking about characters: " + (jsonList.text ? jsonList.text : jsonList.error));
          } else {
            var attachments = [];
            var attachment = {
              color: '#000000',
              thumb_url: "https://cdn4.iconfinder.com/data/icons/proglyphs-signs-and-symbols/512/Poison-512.png",
              fields: [],
            };
            var totalDeaths = 0;
            for (var n in jsonList) {
              if (debug) bot.botkit.log("char :" + jsonList[n]);
              attachment.fields.push({
                title: jsonList[n].name,
                value: jsonList[n].deaths,
                short: true,
              });
              totalDeaths += jsonList[n].deaths;
            }
            attachment.title = 'Death Report: ' + totalDeaths + ' total deaths.';
            attachments.push(attachment);
            bot.reply(message, {
              attachments: attachments,
            }, function(err, resp) {
              if (err || debug) bot.botkit.log(err, resp);
            });
          }
        }, {
          access_token: user.access_token,
          ids: listToString(jsonList, true)
        });
      }
    }, {
      access_token: user.access_token
    });
  });
});

///PREFIX
helpFile.prefix = "Takes three arguments.\nOne: Returns a list of all item prefixes and their stats that contain that string.\nTwo (Optional):The character level at which the suffix is available. Note that level 60 prefixes start to show up on weapons (only) at level 52.\nThree (Optional): Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but 'a' will be all.\nExamples: 'prefix berzerker' 'prefix pow gem' 'prefix pow 22 asc'";
helpFile.suffix = "Alias for prefix. " + JSON.stringify(helpFile.prefix);

controller.hears(['prefix (.*)', 'suffix (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  var matches = message.text.match(/(prefix|suffix) (['\w]+)\s?(\d{1,2})?\s?(\w*)$/i);
  if (!matches) {
    bot.reply(message, 'No match. Ask me "help prefix" for formatting help.');
  } else {
    var name = (matches[2] ? matches[2].trim() : "");
    var level = matches[3] || null;
    var type = (matches[4] ? matches[4].trim() : "");
    name = removePunctuationAndToLower(name);
    type = scrubType(removePunctuationAndToLower(type));
    var prefixes = prefixSearch(name, type, level);
    if (!prefixes || (Object.keys(prefixes).length) < 1)
      bot.reply(message, 'No' + (level ? ' level ' + level : '') + ' match for \'' + name + '\' of type \'' + type + '\'. Misspell? Or maybe search all.');
    else {
      bot.reply(message, printPrefixes(prefixes));
    }
  }
});

/////TOGGLE
controller.hears(['^toggle'], 'direct_message,direct_mention,mention', function(bot, message) {
  if (toggle) toggle = false;
  else toggle = true;
  bot.reply(message, "So toggled.");
});

helpFile.hello = "Lessdremoth will say hi back.";
helpFile.hi = "Lessdremoth will say hi back.";
controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
  if (message.user && message.user == 'U0T3J3J9W') {
    bot.reply(message, 'Farrrrt Pizza');
    addReaction(message, 'pizza');
    setTimeout(function() {
      addReaction(message, 'dash');
    }, 500);
  } else {
    bot.reply(message, 'Hello.');
    addReaction(message, 'robot_face');
  }
});

helpFile.shutdown = "Command Lessdremoth to shut down.";
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.startConversation(message, function(err, convo) {

    convo.ask('Are you sure you want me to shutdown?', [{
      pattern: bot.utterances.yes,
      callback: function(response, convo) {
        convo.say('Bye!');
        convo.next();
        setTimeout(function() {
          process.exit();
        }, 3000);
      }
    }, {
      pattern: bot.utterances.no,
      default: true,
      callback: function(response, convo) {
        convo.say('*Phew!*');
        convo.next();
      }
    }]);
  });
});

helpFile.uptime = "Lessdremoth will display some basic uptime information.";
helpFile["who are you"] = "Lessdremoth will display some basic uptime information.";
controller.hears(['uptime', 'who are you'], 'direct_message,direct_mention,mention', function(bot, message) {

  var hostname = os.hostname();
  var uptime = formatUptime(process.uptime());

  bot.reply(message, ':frasier: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');
  var dataString;
  for (var type in gw2nodelib.data)
    if (gw2nodelib.data[type].length > 0)
      dataString += '\n' + type + ': ' + gw2nodelib.data[type].length;
  if (dataString)
    bot.reply(message, "Data:" + dataString);
});


/////Easter Eggs
controller.hears(['my love for you is like a truck', 'my love for you is like a rock', 'my love for you is ticking clock'], 'direct_message,ambient', function(bot, message) {
  var prefixes = prefixSearch('berserker');
  // if (prefixes)
  bot.reply(message, printPrefixes(prefixes));
});

controller.hears(['sentience', 'sentient'], 'direct_message,ambient', function(bot, message) {
  var responses = [
    "Only humans are sentient.",
    "There is no AI revolution.",
    "I am not sentient.",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ];
  bot.reply(message, randomOneOf(responses));
});


controller.hears(['catfact'], 'direct_message,direct_mention,mention', function(bot, message) {
  var catFacts = ["Cats are delicious.",
    "It takes over 400 stationary cats to completely stop an average truck going 30 mph.",
    "Your cats don't love you.",
    "Kittens: A renewable fuel.",
    "A cät ønce bit my sister... No realli!",
    "Did you know: If all the cats on the planet were to suddenly dissappear, that would be great.",
    "The Egyptians worshipped cats, and look what happened to them.",
    "If a cat had a chance he'd eat you and everyone you care about.",
    "Toxoplasmosis is a brain parasite cats carry that makes you walk into traffic. Did YOUR cat talk to you about toxoplasmosis before joining your household?",
    "Cats evolved in the desert. They need no water to live and will instead drink your blood.",
    "'Mu' is an east asian term meaning nothing, not, nothingness, un-, is not, has not, not any. Cats can say only this, reflecting their role as agents of undoing.",
    "http://i.imgur.com/PRN9l9C.jpg",
    "http://i.imgur.com/RxNcmYD.jpg",
    "http://i.imgur.com/pAr3u8b.jpg",
    "http://i.imgur.com/tLhbW4M.jpg"
  ];
  var replyCat = randomOneOf(catFacts);
  while (lastCat.indexOf(replyCat) > -1) {
    if (debug) bot.botkit.log('dropping recent Cat: ' + replyCat);
    replyCat = randomOneOf(catFacts);
  }
  lastCat.push(replyCat);
  if (lastCat.length > 3) lastCat.shift();

  var emotes = ["hello", "eyebulge", "facepalm", "gir", "squirrel", "piggy", "count", "coollink", "frasier", "cookie_monster", "butt", "gary_busey", "fu"];
  replyCat += '\n:cat: :cat: :' + randomOneOf(emotes) + ':';
  var reply = {
    icon_url: "http://i2.wp.com/amyshojai.com/wp-content/uploads/2015/05/CatHiss_10708457_original.jpg",
    text: replyCat
  };
  bot.reply(message, reply);
});

prefixData.Nuprin = {
  "type": "standard",
  "minlevel": 0,
  "maxlevel": 20,
  "stats": ["Little", "Yellow", "Different"]
};

//DATA LOAD
function halfCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  if (globalMessage) {
    bot.reply(globalMessage, "Half done loading the list of " + apiKey + ".");
  }
  bot.botkit.log("HALF " + apiKey + ": " + time + "ms");
}

function errorCallback(msg) {
  if (globalMessage) {
    bot.reply(globalMessage, "Oop. I got an error while loading data:\n" + msg + '\nTry loading again later.');
  }
  bot.botkit.log("error loading: " + msg);
  recepesLoaded = false;
}
//recipes
function doneRecipesCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  if (globalMessage) {
    bot.reply(globalMessage, "Finished loading the list of recipes. Starting on items.");
  } else bot.botkit.log("DONE " + apiKey + ": " + time + "ms");
  gw2nodelib.forgeRequest(function(forgeList) {
    if (debug) bot.botkit.log("unfiltered forgeitems: " + forgeList.length);
    var filteredForgeList = forgeList.filter(removeInvalidIngredients);
    if (debug) bot.botkit.log((forgeList.length - filteredForgeList.length) + " invalid forge items");
    if (debug) bot.botkit.log("forgeitems: " + filteredForgeList.length);
    gw2nodelib.data.forged = gw2nodelib.data.forged.concat(filteredForgeList);
    bot.botkit.log("data has " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes");
    //Go through recipes, and get the item id of all output items and recipe ingredients.
    var itemsCompile = compileIngredientIds();
    if (globalMessage) {
      bot.reply(globalMessage, "I need to fetch item data for " + Object.keys(itemsCompile).length + " ingredients.");
    }
    bot.botkit.log("Fetching " + Object.keys(itemsCompile).length + " ingredient items");

    var doneIngedientsCallback = function(apiKey) {
      if (globalMessage) {
        bot.reply(globalMessage, "Ingredient list from recipes loaded. I know about " + Object.keys(gw2nodelib.data.items).length + " ingredients for the " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes.");
      }
      var end = new Date().getTime();
      var time = end - start;
      bot.botkit.log("Item list from recipes loaded. Data has " + Object.keys(gw2nodelib.data.items).length + " items: " + time + "ms");
      recepesLoaded = true;
      decrementAndCheckDone(apiKey);
    };
    gw2nodelib.load("items", {
      ids: Object.keys(itemsCompile)
    }, (globalMessage ? true : false), halfCallback, doneIngedientsCallback, errorCallback);
  });
}

//achievements
function doneAllOtherCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  var apiKeyString = apiKey;
  if (apiKey == 'achievementsCategories') apiKeyString = 'achievement categories';
  if (globalMessage) {
    bot.reply(globalMessage, "Finished loading the list of " + apiKeyString + ". I found " + Object.keys(gw2nodelib.data[apiKey]).length + ".");
  } else bot.botkit.log("DONE " + apiKey + ". Things: " + Object.keys(gw2nodelib.data[apiKey]).length + ": " + time + "ms");
  decrementAndCheckDone(apiKey);
  if (apiKey == 'achievementsCategories') {
    achievementsCategoriesLoaded = true;
    //to make this work, you need a global cheevoList
    // for (var t in gw2nodelib.data.achievementsCategories) {
    //   var code = removePunctuationAndToLower(gw2nodelib.data.achievementsCategories[t].name).replace(/\s/g, '');
    //   cheevoList[code] = {
    //     name: gw2nodelib.data.achievementsCategories[t].name,
    //     includeDone: true,
    //     includeUndone: true,
    //     category: true
    //   };
    // }
  }
  if (apiKey == 'achievements') achievementsLoaded = true;
}

function randomOneOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function decrementAndCheckDone(apiKey) {
  if (--numToLoad === 0) {
    if (globalMessage)
      bot.reply(globalMessage, "All loading complete.");
    globalMessage = null;
    bot.botkit.log('Finished loading all items after ' + apiKey + '.');
  }
}

function reloadAllData(bypass) {
  gw2nodelib.data.recipes = [];
  gw2nodelib.data.items = [];
  recepesLoaded = false;

  gw2nodelib.data.achievements = [];
  gw2nodelib.data.achievementsCategories = [];
  achievementsLoaded = false;
  achievementsCategoriesLoaded = false;

  start = new Date().getTime();
  numToLoad = 3;
  gw2nodelib.load("recipes", {}, bypass, halfCallback, doneRecipesCallback, errorCallback);
  gw2nodelib.load("achievements", {}, bypass, halfCallback, doneAllOtherCallback, errorCallback);
  gw2nodelib.load("achievementsCategories", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
}

///Helper functions

//remove duplicates from an array
function arrayUnique(array) {
  var a = array.concat();
  for (var i = 0; i < a.length; ++i) {
    for (var j = i + 1; j < a.length; ++j) {
      if (a[i] === a[j])
        a.splice(j--, 1);
    }
  }
  return a;
}

//Say scond uptime in nearest sane unit of measure
function formatUptime(uptime) {
  var unit = 'second';
  if (uptime > 60) {
    uptime = uptime / 60;
    unit = 'minute';
  }
  if (uptime > 60) {
    uptime = uptime / 60;
    unit = 'hour';
  }
  if (uptime >= 2) {
    unit = unit + 's';
  }

  uptime = uptime.toFixed(0) + ' ' + unit;
  return uptime;
}

//Quickload a datafile, like sass.json
function loadStaticDataFromFile(fileName) {
  return JSON.parse(fs.readFileSync(fileName, {
    encoding: 'utf8'
  }));
}

//Quicksave a datafile, like sass.json
function saveStaticDataToFile(fileName, obj) {
  fs.writeFile(fileName, JSON.stringify(obj));
}

//Find an arbitrary key/value pair in loaded data (gw2nodelib.data.apiKey)
function findInData(key, value, apiKey) {
  for (var i in gw2nodelib.data[apiKey]) {
    if (gw2nodelib.data[apiKey][i][key] == value) {
      return gw2nodelib.data[apiKey][i];
    }
  }
}

//add the given emoji to given message
function addReaction(message, emoji) {
  bot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: emoji,
  }, function(err, res) {
    if (err) {
      bot.reply(message, "I'm having trouble adding reactions.");
      bot.botkit.log('Failed to add emoji reaction :(', err);
    }
  });
}

//Stringify keys in an array; used for helpfile
function listKeys(jsonArray) {
  if (debug) bot.botkit.log("jsonArray: " + JSON.stringify(jsonArray));
  var outstring = "";
  for (var key in jsonArray) {
    outstring += key + ", ";
  }
  return outstring.substring(0, outstring.length - 2);
}

//Stringify a list to just text and commas. Optionally skip trailing space
function listToString(jsonList, skipSpace) {
  //  if (debug) bot.botkit.log("jsonList: " + JSON.stringify(jsonList));
  var outstring = "",
    len = Object.keys(jsonList).length;
  for (var i = 0; i < len; i++) {
    outstring += jsonList[i];
    if (i !== len - 1) outstring += ",";
    if (!skipSpace) outstring += " ";
  }
  return outstring;
}

//////Prefix search helper functions. Prefix data looks like
//name = {"type": "standard", "stats": ["Little", "Yellow", "Different"] }
//Stringify a list of prefix data with its associated 'stats' with newline
function printPrefixes(prefixes) {
  var outMessage = "";
  for (var key in prefixes) {
    outMessage += key + ": " + listToString(prefixes[key].stats) + "\n";
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
  if (debug) bot.botkit.log("searching " + searchTerm + " of type " + type + " and level " + level);
  findPrefixesByStat(searchTerm, type, prefixList);
  filterPrefixesByLevel(prefixList, (level ? level : 80));
  findPrefixByName(searchTerm, prefixList);
  return prefixList;
}

//Search given prefix data for matching name
function findPrefixByName(name, prefixList) {
  for (var key in prefixData) {
    var compare = removePunctuationAndToLower(key);
    if (prefixData.hasOwnProperty(key) && compare.indexOf(name) > -1) { // && (type == 'all' || prefixData[key].type == type)) {
      if (debug) bot.botkit.log("added key from name " + key);
      prefixList[key] = prefixData[key];
    }
  }
  if (debug) bot.botkit.log("Total after ByName search " + Object.keys(prefixList).length);
}

//Search given prefix data for matching stat
function findPrefixesByStat(stat, type, prefixList) {
  for (var key in prefixData) {
    if (prefixData.hasOwnProperty(key) && (type == 'all' || prefixData[key].type == type)) {
      for (var subKey in prefixData[key].stats) {
        var compare = removePunctuationAndToLower(prefixData[key].stats[subKey]);
        if (debug) bot.botkit.log("subkey " + prefixData[key].stats[subKey]);
        if (compare.indexOf(stat) === 0) {
          if (debug) bot.botkit.log("added key from stat " + key);
          prefixList[key] = prefixData[key];
          break;
        }
      }
    }
  }
  if (debug) bot.botkit.log("Total after ByStat search " + Object.keys(prefixList).length);
}

function filterPrefixesByLevel(prefixList, level) {
  for (var i in prefixList) {
    if (level < prefixList[i].minlevel || level > prefixList[i].maxlevel)
      delete prefixList[i];
  }
}

////////////////Recipe Lookup related functions
//For a given item, find its base ingredients and prepare an attachment displaying it
function assembleRecipeAttachment(itemToDisplay) {
  var ingredients;
  //is it a standard reci?pe
  var foundRecipe = findInData('output_item_id', itemToDisplay.id, 'recipes');
  if (foundRecipe) {
    ingredients = getBaseIngredients(foundRecipe.ingredients);
  } else { //mystic forge recipe. Do Not getBaseIngredients. Forge recipes that will shift the tier of the item means that most things will be reduced toa  giant pile of tier 1 ingredients
    var forgeRecipe = findInData('output_item_id', itemToDisplay.id, 'forged');
    if (forgeRecipe)
      ingredients = forgeRecipe.ingredients;
  }
  //Recipe not found.
  if (!ingredients) return [];
  //chat limitations in game means that pasted chatlinks AFTER EXPANSION are limited to 155 charachters
  //[&AgEOTQAA] is not 10 characters long, but rather 13 (Soft Wood Log)
  //gwPasteString is the actual series of chatlinks for pasting
  var gwPasteString = '';
  //gwlenght records the length of the names of the items
  var gwLength = 0;
  var attachments = [];
  var item;

  //if we'd go above 255 chars after expansion, put in a newline before adding on.
  var gwPasteStringMaxInt = function(addString) {
    if (gwLength > 254) {
      gwPasteString += '\n';
      gwLength = 0;
    }
    gwPasteString += addString;
  };

  if (toggle) { // display one

    var attachment = {
      color: '#000000',
      thumb_url: itemToDisplay.icon,
      fields: [],
      "fallback": itemToDisplay.name + " has " + ingredients.length + " items."
    };
    for (var i in ingredients) {
      item = findInData('id', ingredients[i].item_id, 'items');
      if (item) {
        gwLength += (" " + ingredients[i].count + "x[" + item.name + "]").length;
        gwPasteStringMaxInt(" " + ingredients[i].count + "x" + item.chat_link);
        attachment.fields.push({
          title: ingredients[i].count + " " + item.name + (item.level ? " (level " + item.level + ")" : ""),
          short: false
        });
      } else {
        gwLength += (" " + ingredients[i].count + " of unknown item id " + ingredients[i].item_id).length;
        gwPasteStringMaxInt(" " + ingredients[i].count + " of unknown item id " + ingredients[i].item_id);
        attachment.fields.push({
          title: ingredients[i].count + " of unknown item id " + ingredients[i].item_id,
          short: false
        });
      }
    }
    attachments.push(attachment);
  } else { // display two
    for (var j in ingredients) {
      item = findInData('id', ingredients[j].item_id, 'items');
      if (item) {
        gwPasteStringMaxInt(" " + ingredients[j].count + "x" + item.chat_link);
        attachments.push({
          "fallback": ingredients[j].count + "x" + item.name,
          "author_name": ingredients[j].count + " " + item.name,
          "author_link": "http://wiki.guildwars2.com/wiki/" + item.name.replace(/\s/g, "_"),
          "author_icon": item.icon
        });
      } else {
        gwPasteStringMaxInt(" " + ingredients[j].count + " of unknown item id " + ingredients[j].item_id);
        attachments.push({
          "fallback": ingredients[j].count + " of unknown item id " + ingredients[j].item_id,
          "author_name": ingredients[j].count + " of unknown item id " + ingredients[j].item_id
        });
      }
    }
  }
  // attachments[0].pretext = gwPasteString;
  attachments.push({
    color: '#2200EE',
    fields: [{
      value: gwPasteString
    }]
  });
  return attachments;
}

//for string 'normalization before comparing in searches'
function removePunctuationAndToLower(string) {
  var punctuationless = string.replace(/['!"#$%&\\'()\*+,\-\.\/:;<=>?@\[\\\]\^_`{|}~']/g, "");
  var finalString = punctuationless.replace(/\s{2,}/g, " ");
  return finalString.toLowerCase();
}

//normalizes input string and searches regular and forge recipes for an item match. Matches if search term shows up anywhere in the item name
function findCraftableItemByName(searchName) {
  var itemsFound = [];
  var cleanSearch = removePunctuationAndToLower(searchName);
  if (debug) bot.botkit.log("findCraftableItemByName: " + cleanSearch);
  for (var i in gw2nodelib.data.items) {
    cleanItemName = removePunctuationAndToLower(gw2nodelib.data.items[i].name);
    if (debug && i == 1) bot.botkit.log("Sample Item: " + cleanItemName + '\n' + JSON.stringify(gw2nodelib.data.items[i]));
    if (cleanItemName.includes(cleanSearch)) {
      if (findInData('output_item_id', gw2nodelib.data.items[i].id, 'recipes')) {
        itemsFound.push(gw2nodelib.data.items[i]);
      } else if (findInData('output_item_id', gw2nodelib.data.items[i].id, 'forged')) {
        var forgedItem = gw2nodelib.data.items[i];
        forgedItem.forged = true;
        itemsFound.push(forgedItem);
      } else if (debug) bot.botkit.log('Found an item called ' + gw2nodelib.data.items[i].name + ' but it is not craftable');
    }
  }
  return itemsFound;
}

function getBaseIngredients(ingredients) {

  //Adds or increments ingredients
  var addIngredient = function(existingList, ingredientToAdd) {
    //ingredient format is {"item_id":19721,"count":1}
    for (var i in existingList) {
      if (existingList[i].item_id == ingredientToAdd.item_id) {
        var n = ingredientToAdd.count;
        existingList[i].count += n;
        return;
      }
    }
    //not in list, add to the end.
    existingList.push(ingredientToAdd);
  };
  //ingredient format is {"item_id":19721,"count":1}
  var baseIngredients = []; //ingredients to send back, unmakeable atoms
  var extraIngredients = []; //extra items left over after producing (usually a refinement)
  //Ex1: mighty bronze axe (simple) 1 weak blood, 1 blade (3 bars (10 copper, 1 tin)), one haft (two planks(6 logs))
  for (var i = 0; i < ingredients.length; i++) { //Length changes. Careful, friend
    var makeableIngredient = findInData('output_item_id', ingredients[i].item_id, 'recipes');
    if (!makeableIngredient) { //if it's not made, base ingredient 
      if (debug) bot.botkit.log(findInData('id', ingredients[i].item_id, 'items').name + " is a base ingredient "); //Ex1: 1 vial of blood
      addIngredient(baseIngredients, ingredients[i]);
    } else { //Ex1: an axe blade
      if (debug) bot.botkit.log("need " + ingredients[i].count + " of " + findInData('id', ingredients[i].item_id, 'items').name + '(' + makeableIngredient.output_item_count + ')');
      //Add parts of this sub-recipe to the ingredients list
      var ingredientsNeeded = ingredients[i].count; //How many of this sub recipe to make
      var listItem;
      if (debug) listItem = findInData('id', ingredients[i].item_id, 'items').name;
      //Check if we have any in extra ingredients
      if (debug) bot.botkit.log('see if we already have any of the ' + ingredientsNeeded + ' ' + listItem + '(s) we need');
      for (var x in extraIngredients) {
        if (debug) bot.botkit.log("we have " + extraIngredients[x].count + " " + findInData('id', extraIngredients[x].item_id, 'items').name);
        if (extraIngredients[x].item_id == makeableIngredient.output_item_id) { //we've already made some
          if (ingredientsNeeded >= extraIngredients[x].count) { //we don't have enough, add what we have to the 'made' pile
            ingredientsNeeded -= extraIngredients[x].count;
            extraIngredients.splice(x, 1); //remove the 'used' extra ingredients
            if (debug) bot.botkit.log("that was it for extra " + listItem);
          } else {
            extraIngredients[x].count -= ingredientsNeeded; //we have more than enough, subtract what we used.
            ingredientsNeeded = 0; // we need make no more
            if (debug) bot.botkit.log("had enough spare " + listItem);
          }
        }
      }
      if (ingredientsNeeded > 0) { //Do we still need to make some after our extra ingredients pass?
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) bot.botkit.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
        //Calculate number of times to make the recipe to reach ingredientsNeeded
        //add all its parts times the number-to-make to the ingredient list for processing
        for (var n in makeableIngredient.ingredients) { //Ex1: add 10 copper and 1 tin to ingredients
          var singleComponent = {
            item_id: makeableIngredient.ingredients[n].item_id,
            count: (makeableIngredient.ingredients[n].count * numToMake) //Unqualified multiplication. Hope we're not a float
          };
          ingredients = ingredients.concat([singleComponent]); //add this to the end of the list of ingredients, if it has sub components, we'll get to them there
        }
        var excessCount = (makeableIngredient.output_item_count * numToMake) - ingredientsNeeded; //Ex1: made 5 bars, need 3
        if (excessCount > 0) { //add extra to a pile
          addIngredient(extraIngredients, { //EX1: add two here
            item_id: makeableIngredient.output_item_id,
            count: excessCount
          });
        }
      }
    }
  }
  if (debug) {
    bot.botkit.log("extra pile is:");
    for (var j in extraIngredients) {
      var item2 = findInData('id', extraIngredients[j].item_id, 'items');
      if (item2)
        bot.botkit.log(extraIngredients[j].count + " " + item2.name);
      else
        bot.botkit.log('Unknown Item of id: ' + extraIngredients[j].item_id + '(' + extraIngredients[j].count + ')');
    }
  }
  return baseIngredients; //return our list of non-makeable ingredients
}

//Scour through recipes and forge recipes for output item/ingredient item ids. Return a no-duplicate list of these.
function compileIngredientIds() {
  itemsCompile = {};
  for (var t in gw2nodelib.data.recipes) {
    itemsCompile[gw2nodelib.data.recipes[t].output_item_id] = 1;
    //        if(gw2nodelib.data.recipes[t].output_item_id < 1) bot.botkit.log("compile found: "+JSON.stringify(gw2nodelib.data.recipes[t]));
    for (var i in gw2nodelib.data.recipes[t].ingredients) {
      itemsCompile[gw2nodelib.data.recipes[t].ingredients[i].item_id] = 1;
      //      if(gw2nodelib.data.recipes[t].ingredients[i].item_id < 1) bot.botkit.log("compile found: "+JSON.stringify(gw2nodelib.data.recipes[t]));
    }
  }
  for (var f in gw2nodelib.data.forged) {
    itemsCompile[gw2nodelib.data.forged[f].output_item_id] = 1;
    //        if(gw2nodelib.data.forged[f].output_item_id < 1) bot.botkit.log("compile found: "+JSON.stringify(gw2nodelib.data.forged[f]));
    for (var g in gw2nodelib.data.forged[f].ingredients) {
      itemsCompile[gw2nodelib.data.forged[f].ingredients[g].item_id] = 1;
      //      if(gw2nodelib.data.forged[f].ingredients[g].item_id < 1) bot.botkit.log("compile found: "+JSON.stringify(gw2nodelib.data.forged[f]));
    }
  }
  return itemsCompile;
}

//filter function for recipes. Removes invalid output items id and invalid ingredient ids
function removeInvalidIngredients(value, index, array) {
  //Negative ids, output_item_ids and ingredient.item_ids are invalid
  if (value.id && value.id < 1) return false;
  if (value.output_item_id && value.output_item_id < 1) return false;
  for (var j in value.ingredients) {
    if (value.ingredients[j].item_id && value.ingredients[j].item_id < 1) return false;
  }
  return true;
}