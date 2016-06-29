//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
debug = false; //for debug messages, passed botkit
var recipiesLoaded = false; //To signal the bot that the async data load is finished.
var achievementsLoaded = false;
var achievementsCategoriesLoaded = false;
start = 0; //holds start time for data loading
globalMessage = null; //holds message for data loading to repsond to, if loading via bot chat
var toggle = true; //global no-real-use toggle. Used at present to compare 'craft' command output formats.

var Botkit = require('botkit');
// var winston = require('winston');

helpFile = [];
cheevoList = {};

controller = Botkit.slackbot({
  debug: debug,
  json_file_store: 'slackbotDB',
  // logger: new winston.Logger({
  //   transports: [
  //     new(winston.transports.Console)({
  //       level: 'info'
  //     }),
  //     new(winston.transports.File)({
  //       filename: './bot.log',
  //       level: 'warning'
  //     })
  //   ]
  // })

});

//Check for bot token
if (!process.env.token) {
  bot.botkit.log('Error: Specify token in environment');
  process.exit(1);
}
//fire up the bot
var bot = controller.spawn({
  token: process.env.token,
  retry: 5
}).startRTM(function(err, bot, payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});
// bot.botkit.log.warning("WARN TEST");
// bot.botkit.log.error("ERROR TEST");
// bot.botkit.log("INFO TEST");

//load shared code to the global scope
var sf = require('./sharedFunctions.js');
//Add standalone responses: Riker, catfacts, sass
var standalone = require('./standaloneResponses.js');
standalone.addResponses(controller);
standalone.addHelp(helpFile);
//add craft function
var craft = require('./baseIngredients.js');
craft.addResponses(controller);
craft.addHelp(helpFile);

var gw2nodelib = require('./api.js');
gw2nodelib.setCacheTime(3600, 'achievements');
gw2nodelib.setCacheTime(3600, 'achievementsCategories');
gw2nodelib.setCachePath('./slackbotDB/caches/');
gw2nodelib.loadCacheFromFile('cache.json'); //note that this file name is a suffix. Creates itemscache.json, recipecache,json, and so on


reloadAllData(false);

////HELP
controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/help ([a-zA-Z ]*)/i);
  //Stringify keys in an array;
  var listKeys = function(jsonArray) {
    if (debug) bot.botkit.log("jsonArray: " + JSON.stringify(jsonArray));
    var outstring = "";
    for (var key in jsonArray) {
      outstring += key + ", ";
    }
    return outstring.substring(0, outstring.length - 2);
  };
  helpFile.sort();
  if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + listKeys(helpFile));
  else {
    var name = matches[1].toLowerCase();
    bot.reply(message, helpFile[name]);
  }
});

helpFile.latest = "Show latest completed TODO item";
helpFile.update = "Alias for latest: " + JSON.stringify(helpFile.latest);
controller.hears(['^update$', '^latest$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  bot.reply(message, "Coding re-org. Does everything still work?");
});

helpFile.todo = "Display the backlog";
controller.hears(['^todo', '^backlog'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var todoList = [
    "add worn equipment to bank",
    "merge bank and wallet? (bank also searches your wallet)",
    "Ascended shopping list: what you need yet to make a given ascended recipe, given your inventory",
    "Scan achievements for low-hanging achievement fruit",
    "logging",
    "add sass from slack"
  ];
  bot.reply(message, todoList.join("\n"));
});


////wallet
helpFile.wallet = "List the contents of your wallet. Optionally add a search string to filter the list. Useage:wallet <name>";
helpFile.dungeonWallet = "Lists only your dungeon currencies.";
helpFile.dw = 'Alias for dungeon wallet: ' + JSON.stringify(helpFile.dungeonwallet);
controller.hears(['^wallet(.*)', '^dungeonwallet(.*)', '^dw(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
    if (err) {
      bot.reply(message, "I got an error loading your data (or you have no access token set up). Try again later");
      bot.botkit.log("Error:wallet no user data " + err);
      return;
    }
    //precheck - input scrub a bit
    var matches = sf.removePunctuationAndToLower(message.text).match(/(dw|dungeonwallet|wallet)([\s\w]*)$/i);
    if (!matches) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help wallet\'?");
      return;
    }
    //precheck: access token.
    if (!user || !user.access_token || !userHasPermission(user, 'wallet')) {
      bot.botkit.log('ERROR: bank no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'wallet') ? "with correct 'wallet' 'permissions' " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    var searchTerm = (matches[2] ? matches[2].replace(/\s+/g, '') : null);
    var isDungeonOnly = (matches[1] == "dungeonwallet" || matches[1] == 'dw');
    if (searchTerm) bot.reply(message, "Okay, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ", rifling through your wallet for " + searchTerm + ".");

    gw2nodelib.accountWallet(function(walletList, headers) {
      if (isDungeonOnly) {
        var dungeonCurrencyList = [5, 9, 11, 10, 13, 12, 14, 6, 7, 24];
        walletList = walletList.filter(function(value) {
          return (dungeonCurrencyList.indexOf(value.id) >= 0);
        });
        walletList.sort(function(a, b) {
          return dungeonCurrencyList.indexOf(a.id) - dungeonCurrencyList.indexOf(b.id);
        });
      }
      //['Ascalonian Tear', 'Seal of Beetletun', 'Deadly Bloom', 'Manifesto of the Moletariate', 'Flame Legion Charr Carving', 'Symbol of Koda', 'Knowledge Crystal', 'Shard of Zhaitan', 'Fractal Relic', 'Pristine Fractal Relic'];
      var text = [];
      var goldIcon = 'https://render.guildwars2.com/file/98457F504BA2FAC8457F532C4B30EDC23929ACF9/619316.png';
      var lastIcon;
      for (var i in walletList) {
        var currency = findInData('id', walletList[i].id, 'currencies');
        if (currency &&
          (!searchTerm || (searchTerm && sf.removePunctuationAndToLower(currency.name).replace(/\s+/g, '').includes(searchTerm)))
          //&& (!isDungeonOnly || (dungeonCurrencyList.indexOf(currency.name) >= 0))
        ) {
          if (currency.name == 'Coin') {
            var gold = Math.floor(walletList[i].value / 10000);
            var silver = Math.floor((walletList[i].value % 10000) / 100);
            var copper = Math.floor(walletList[i].value % 100);
            text.push("Coin: " + (gold > 0 ? gold + 'g ' : '') + (silver > 0 ? silver + 's ' : '') + (copper > 0 ? copper + 'c ' : ''));
          } else
            text.push(currency.name + ": " + walletList[i].value);
          lastIcon = currency.icon;
        }
      }
      if (text.length > 0)
        bot.reply(message, {
          attachments: {
            attachment: {
              fallback: 'Too many items found in search.',
              pretext: (searchTerm ? 'Looking for: ' + searchTerm : ''),
              text: text.join("\n"),
              thumb_url: ((lastIcon && text.length > 1) ? goldIcon : lastIcon)
            }
          }
        });
      else bot.reply(message, "You don't have any.");
    }, {
      access_token: user.access_token,
    });

  });
});


////BANK
helpFile.bank = "Search your possessions for an item. Looks in character inventories, shared inventory, bank and material storage. Usage: bank <item name>";
controller.hears(['^bank (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
    if (err) {
      bot.reply(message, "I got an error loading your data (or you have no access token set up). Try again later");
      bot.botkit.log("Error:bank no user data " + err);
      return;
    }
    //precheck - input scrub a bit
    var matches = sf.removePunctuationAndToLower(message.text).match(/(bank)\s?([\s\w]*)$/i);
    if (!matches || !matches[2]) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help bank\'?");
      return;
    }
    //precheck: access token.
    if (!user || !user.access_token || !userHasPermission(user, 'inventories')) {
      bot.botkit.log('ERROR: bank no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'inventories') ? "with correct 'inventories' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    bot.reply(message, "Okay, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ", rifling through your pockets for spare " + matches[2] + ".");
    var searchTerm = matches[2].replace(/\s+/g, '');

    var inventories = [];
    //callback to give to the character fetch at the end to kick all this off.
    var charactersCallback = function(jsonList, headers) {
      if (jsonList.text || jsonList.error) {
        bot.reply(message, "Oops. I got this error when asking about your character inventories: " + (jsonList.text ? jsonList.text : jsonList.error) + '\n' + JSON.stringify(err));
        return;
      }
      //Build a list of all inventories. Character and account
      //setup:promise fetch items in each character inventory
      for (var ch in jsonList) {
        var idList = [];
        var countList = [];
        for (var bg in jsonList[ch].bags) {
          if (jsonList[ch].bags[bg] !== null) { //there can be no bag in the slot
            for (var it in jsonList[ch].bags[bg].inventory) {
              if (jsonList[ch].bags[bg].inventory[it] !== null) { //there can be no item in the bag
                idList.push(jsonList[ch].bags[bg].inventory[it].id);
                countList.push(jsonList[ch].bags[bg].inventory[it].count);
              }
            }
          }
        }
        inventories.push({
          source: jsonList[ch].name,
          ids: idList,
          counts: countList
        });
      }
      //setup: promise fetch shared inventory, bank, and material storage.
      Promise.all([
          gw2nodelib.promise.accountBank(['all'], user.access_token),
          gw2nodelib.promise.accountInventory(['all'], user.access_token),
          gw2nodelib.promise.accountMaterials(['all'], user.access_token)
        ])
        .then(function(results) {
          var sourceNames = ['Your bank', 'Your shared inventory', 'Your materials storage'];
          for (var sourceList in results) {
            var idList = [];
            var countList = [];
            for (var item in results[sourceList]) {
              if (results[sourceList][item] !== null && (results[sourceList][item].count && results[sourceList][item].count !== 0)) {
                if (results[sourceList][item].id === null) console.log("null item " + JSON.stringify(results[sourceList][item]));
                idList.push(results[sourceList][item].id);
                countList.push(results[sourceList][item].count);
              }
            }
            inventories.push({
              source: sourceNames[sourceList],
              ids: idList,
              counts: countList
            });
          }
          if (debug)
            for (var ch in inventories)
              bot.botkit.log(inventories[ch].source + " has " + (inventories[ch].counts.length == inventories[ch].ids.length ? inventories[ch].counts.length + " items" : " an error"));
          return inventories;
        })
        .then(function() { //collate the IDs of all items in all inventories, and fetch
          var ownedItemIds = [];
          for (var inv in inventories)
            ownedItemIds = ownedItemIds.concat(inventories[inv].ids);
          ownedItemIds = sf.arrayUnique(ownedItemIds);
          if (debug) bot.botkit.log("Fetching " + ownedItemIds.length + " unique items");
          var itemPagePromises = [];
          for (var i = 0; i < ownedItemIds.length; i += 200) {
            itemPagePromises.push(gw2nodelib.promise.items(ownedItemIds.slice(i, i + 200)));
          }
          return Promise.all(itemPagePromises);
        }).then(function(results) { //find items with our original search string

          var itemList = [];
          for (var list in results)
            itemList = itemList.concat(results[list]);
          if (debug) bot.botkit.log("results has " + itemList.length + " items");
          if (debug)
            analyzeForMissingItems(inventories, itemList);

          var itemSearchResults = [];
          for (var i in itemList) {
            if (removePunctuationAndToLower(itemList[i].name).replace(/\s+/g, '').includes(searchTerm))
              itemSearchResults.push(itemList[i]);
          }
          //And Display!
          if (itemSearchResults.length === 0) { //no match
            bot.reply(message, "No item names on your account contain that exact text.");
          } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
            tallyAndDisplay(itemSearchResults[0]);
          } else if (itemSearchResults.length > 10) { //too many matches in our 'contains' search, notify and give examples.
            var itemNameList = [];
            for (var n in itemSearchResults) {
              itemNameList.push(itemSearchResults[n].name + levelAndRarityForItem(itemSearchResults[n]));
            }
            bot.reply(message, {
              attachments: {
                attachment: {
                  fallback: 'Too many items found in search.',
                  text: "Bro. I found " + itemSearchResults.length + ' items. Get more specific.\n' + itemNameList.join("\n")
                }
              }
            });
          } else { //10 items or less, allow user to choose
            bot.startConversation(message, function(err, convo) {
              var listofItems = '';
              for (var i in itemSearchResults) {
                listofItems += '\n' + [i] + ": " + itemSearchResults[i].name + levelAndRarityForItem(itemSearchResults[i]) + (itemSearchResults[i].forged ? " (Mystic Forge)" : "");
              }
              convo.ask('I found multiple items with that name. Which number you mean? (say no to quit)' + listofItems, [{
                //number, no, or repeat
                pattern: new RegExp(/^(\d{1,2})/i),
                callback: function(response, convo) {
                  //if it's a number, and that number is within our search results, print it
                  var matches = response.text.match(/^(\d{1,2})/i);
                  var selection = matches[0];
                  if (selection < itemSearchResults.length) {
                    tallyAndDisplay(itemSearchResults[selection]);
                  } else convo.repeat(); //invalid number. repeat choices.
                  convo.next();
                }
              }, {
                //negative response. Stop repeating the list.
                pattern: bot.utterances.no,
                callback: function(response, convo) {
                  convo.say('¯\\_(ツ)_/¯');
                  convo.next();
                }
              }, {
                default: true,
                callback: function(response, convo) {
                  // loop back, user needs to pick or say no.
                  convo.say("Nope. Next time choose a number of the item you'd like to see.");
                  convo.next();
                }
              }]);
            });
          }
        }).catch(function(error) {
          bot.reply(message, "I got an error on my way to promise land from the bank. Send help!\nTell them " + error);
        });
    };

    var tallyAndDisplay = function(itemToDisplay) {
      var total = 0;
      var totalStrings = [];
      for (var inv in inventories) {
        var start = 0;
        var sourceCount = 0;
        var ind = inventories[inv].ids.indexOf(itemToDisplay.id, start);
        while (ind >= 0) {
          sourceCount += inventories[inv].counts[ind];
          total += inventories[inv].counts[ind];
          start = ind + 1;
          ind = inventories[inv].ids.indexOf(itemToDisplay.id, start);
        }
        if (sourceCount > 0)
          totalStrings.push(inventories[inv].source + " has " + (sourceCount > 500 ? sourceCount + ' of the goddamn things' : sourceCount));
      }
      if (total > 0 && totalStrings.length > 0) {
        bot.reply(message, "*" + itemToDisplay.name + " Report: " + total + " owned*\n" + totalStrings.join('\n'));
      } else
        bot.reply(message, "You have none of that. None.");
    };

    //setup: fetch character list and callback
    gw2nodelib.characters(charactersCallback, {
      access_token: user.access_token,
      ids: 'all'
    });


    var analyzeForMissingItems = function(inventories, itemList) {
      var ownedItems = [];
      for (var inv in inventories)
        ownedItems = ownedItems.concat(inventories[inv].ids);
      ownedItems = sf.arrayUnique(ownedItems);
      var compareFunc = function(element) {
        if (i === 0) console.log("compare: " + element.id + " to " + ownedItems[i]);
        return element.id == ownedItems[i];
      };
      for (var i in ownedItems) {
        var missing = itemList.find(compareFunc);
        if (!missing) bot.botkit.log(" Missing: " + ownedItems[i]);
      }
    };



  });
});


function getAscendedItemsByPrefix(prefixSearch) {
  //Where prefix is an ascended name, its equivalent prefix name, a substring thereof, or 'any'

  var possiblePrefixes = sf.loadStaticDataFromFile("ascendedPrefixMap.json");
  //looks like:
  //{
  //"Maguuma Burl":["Tizlak's"],
  //"Marauder":["Svaard's"],
  //"Sapphire":["Tateos's","Theodosus'"]
  //  }
  for (var prefix in possiblePrefixes) {
    if (removePunctuationAndToLower(prefix).includes(prefixSearch)) {
      return possiblePrefixes[prefix];
    } else
      for (var name in possiblePrefixes[prefix])
        if (removePunctuationAndToLower(possiblePrefixes[prefix][name]).includes(prefixSearch)) {
          return [possiblePrefixes[prefix][name]];
        }
  }
  return [];
}

function getAscendedWeight(weight) {
  //where weight is light/med/heavy/weapon or a substring thereof or 'any'
  //Maybe add some alt names for the weights. Light/lite/cloth/scholar, medium/med/leather/adventurer, heavy/hev/plate/solider
  var possibleWeights = {
    Weapon: ["weapon"],
    Light: ["light", "lite", "cloth", "scholar"],
    Medium: ["medium", "leather", "adventurer"],
    Heavy: ["heavy", "hev", "plate", "soldier"]
  };
  for (var weightName in possibleWeights) {
    for (var j in possibleWeights[weightName])
      if (removePunctuationAndToLower(possibleWeights[weightName][j]).includes(weight))
        return weightName;
  }
  return sf.randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", "Garbage"]);
}

function getItemSlot(slotName) {
  //and slot is a big six armor slot or a weapon type or 'any'
  var possibleSlots = ['Boots', 'Coat', 'Gloves', 'Helm', 'HelmAquatic', 'Leggings', 'Shoulders',
    'Axe', 'Dagger', 'Mace', 'Pistol', 'Scepter', 'Sword', 'Focus', 'Shield', 'Torch', 'Warhorn',
    'Greatsword', 'Hammer', 'LongBow', 'Rifle', 'ShortBow', 'Staff',
    'Harpoon', 'Speargun', 'Trident',
    'LargeBundle', 'SmallBundle', 'Toy', 'TwoHandedToy'
  ];
  for (var i in possibleSlots) {
    if (removePunctuationAndToLower(possibleSlots[i]).includes(slotName))
      return possibleSlots[i];
  }
  return sf.randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", "Garbage"]);
}


////ACCESS TOKEN
helpFile.access = "Set up your guild wars account to allow lessdremoth to read data. Say 'access token help' for more information.";
controller.hears(['^access token help', '^help access', '^help access token'], 'direct_message,mention,direct_message,ambient', function(bot, message) {
  bot.reply(message, "First you'll need to log in to arena net to create a token. Do so here:\nhttps://account.arena.net/applications\nRight now I only use the 'account', 'progression', 'inventories', 'wallet' and 'characters' sections.\nCopy the token, and then say \'access token <your token>.\'");
  controller.storage.users.get(message.user, function(err, user) {
    if (user) {
      bot.reply(message, "Note that I already have an access token on file for you, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ". You can give me a new one to overwrite the old, or you can say 'access token' with no argument and I'll refresh your token permissions I keep on file.");
    }
  });
});

controller.hears(['^access token(.*)'], 'direct_mention,mention,direct_message,ambient', function(bot, message) {
  //collect information about the user token and basic account info for use later.
  controller.storage.users.get(message.user, function(err, user) {
    var adressUsersAs = 'newbie';
    if (user && user.dfid)
      adressUsersAs = user.dfid + sf.randomHonoriffic(user.dfid, user.id);
    bot.reply(message, "Okay, " + adressUsersAs + ", let's get you set up.");

    var matches = message.text.match(/access token (\w{8}-\w{4}-\w{4}-\w{4}-\w{20}-\w{4}-\w{4}-\w{4}-\w{12})$/i);
    if (message.text.length > 12 && !matches) { // they put SOMETHING in, but it was mangled
      bot.reply(message, "Incorrect token format. Check the spelling and try again. I Expected something like:\nEIGHTABC-ABCD-1234-A1B2-TWENTYCHARACTERSHERE-7777-6543-BBBB-THERESTWELVE");
      return;
    }
    if (err && err != 'Error: could not load data') //missing file error.
      bot.reply(message, "I got an error while loading your user data: " + err);
    if (user && user.access_token) {
      if (!matches || (matches[1] && matches[1] == user.access_token)) { //use existing token
        bot.reply(message, "Refreshing your existing token.");
      } else {
        bot.reply(message, "Replacing your existing token.");
        user.access_token = matches[1];
      }
    } else if (!matches) { //new user, no token given
      bot.reply(message, "No token on file for you. Say 'access token help' in this channel for instructions.");
      return;
    } else { //new user, new token
      user = {
        id: message.user,
        access_token: matches[1]
      };
    }
    gw2nodelib.tokeninfo(function(tokenInfo) {
      bot.botkit.log("access token tokenInfo fetch: " + JSON.stringify(tokenInfo));
      if (tokenInfo.error || tokenInfo.text) {
        bot.reply(message, "I got an error looking up your token and did not save it. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.");
        return;
      }
      user.permissions = tokenInfo.permissions;

      gw2nodelib.account(function(accountInfo) {
        bot.botkit.log("access token accountInfo fetch: " + JSON.stringify(accountInfo));

        if (debug) bot.botkit.log(JSON.stringify(accountInfo));
        if (accountInfo.error || accountInfo.text) {
          bot.reply(message, "I got an error looking up your account information. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.\ntext from API: " + accountInfo.text + "\nerror: " + accountInfo.error);
          return;
        }

        if (accountInfo.name && accountInfo.name.indexOf('.') > 0) user.name = accountInfo.name.substring(0, accountInfo.name.indexOf('.'));
        else user.name = accountInfo.name;
        user.guilds = accountInfo.guilds;

        //Fetch user data to check for doubles.
        controller.storage.users.all(function(err, userData) {

          //assemble list of ids in use, skip their existing one if it's already in the list
          var idsInUse = [];
          for (var u in userData)
            if (!user.dfid || user.dfid != userData[u].dfid)
              idsInUse.push(userData[u].dfid);
          console.log("ids in use " + idsInUse.join(", "));
          //set user dfid to a reasonable default or the old one
          user.dfid = (user.dfid ? user.dfid : sf.removePunctuationAndToLower(user.name[0]));

          //Scramble the id name if its in use to present a workable default
          while (idsInUse.indexOf(user.dfid) > -1) {
            var nextChar = user.dfid;
            nextChar = String.fromCharCode(nextChar.charCodeAt() + 1);
            if (!nextChar.match(/\w/i)) nextChar = 'a';
            user.dfid = nextChar;
          }

          bot.startConversation(message, function(err, convo) {

            convo.ask('What one letter or number best describes you? Might I suggest ' + user.dfid + '?\n(say no to quit)', [{
              pattern: bot.utterances.no,
              callback: function(response, convo) {
                convo.say('¯\\_(ツ)_/¯');
                convo.next();
              }
            }, {
              pattern: new RegExp(/^(\w)$/i),
              callback: function(response, convo) {
                if (idsInUse.indexOf(response.text) > -1) {
                  convo.say('That appears to be in use:\n' + idsInUse.join(", "));
                  convo.repeat();
                  convo.next();
                } else {
                  user.dfid = response.text;
                  controller.storage.users.save(user, function(err, id) {
                    if (err)
                      bot.reply(message, "I got an error while saving: " + err);
                    else
                      bot.reply(message, 'Done! You are \'' + user.dfid + '\'. Your access token provided me with these permissions:\n' + user.permissions.join(", "));
                    convo.next();
                  });
                }
              }
            }, {
              pattern: new RegExp(/.*/i),
              default: true,
              callback: function(response, convo) {
                convo.say("I didn't get that. Just one letter/number, please.");
                convo.repeat();
                convo.next();
              }
            }]);
          });
        });
      }, {
        access_token: user.access_token
      }, true);
    }, {
      access_token: user.access_token
    }, true);
  });
});

////DUNGEON FRIENDS
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

helpFile.dungeonfriends = "Show a mutually undone Dungeon Frequenter list for given folks with valid access tokens. Example \'df ahrj\'";
helpFile.dungeonfriendsverbose = "Show all Dungeon Freqenter dungeons, with the given users already-done dungeons tagged. Example \'dfv ahrj\'";
helpFile.df = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriends);
helpFile.dfv = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriendsverbose);

controller.hears(['^dungeonfriends(.*)', '^df(.*)', '^dungeonfriendsverbose(.*)', '^dfv(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }

  //get dungeon frequenter achievement
  var dungeonFrequenterCheevo = findInData('name', 'Dungeon Frequenter', 'achievements');
  if (!dungeonFrequenterCheevo) {
    bot.reply(message, "I couldn't find the Dungeon Frequenter achievement in my loaded data. Try 'db reload'.");
    return;
  }

  //Ready to start. Setup variables
  var num = 0;
  var goodUsers = [];
  var individualBitsArrays = {};

  var matches = message.text.match(/(dungeonfriends(?:verbose)?|dfv?)(?: (\w+)$)?/i);

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
          replyWith("I got an error looking up the data for " + name + ". They will be omitted from the results.", true);
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
      replyWith({
        text: "Party: " + pretextString + ".",
        attachments: attachments,
      }, false);
    }
  };

  //fetch access tokens from storage
  controller.storage.users.all(function(err, userData) {

    var requesterName = '';
    for (var u in userData) {
      //remove those without permissions
      if (userData[u].access_token && userHasPermission(userData[u], 'progression')) {
        goodUsers.push(userData[u]);
        if (userData[u].id == message.user)
          requesterName = "Okay, " + userData[u].dfid + sf.randomHonoriffic(userData[u].dfid, userData[u].id) + ". ";
      }
    }
    //goodUsers is now a list of users with good access tokens
    bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for dungeonfriends.");

    var selectedUsers = [];
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
    globalMessage = message;
    for (var g in goodUsers) {
      gw2nodelib.accountAchievements(dungeonfriendsCallback, {
        access_token: goodUsers[g].access_token
      }, true);
    }

  });
});

//find an achievement in the freshly fetched account achievements by id
function findInAccount(id, accountAchievements) {
  for (var t in accountAchievements) {
    if (accountAchievements[t].id == id) {
      return accountAchievements[t];
    }
  }
}

////ACHIEVEMENTS
helpFile.cheevo = "Display a report of several types of achievements. Example \'cheevo dungeonfrequenter\'.\nI know about " + Object.keys(cheevoList).length + " achievements and categories.";
helpFile.cheevor = "Display a random achievement from a category, or random part of an achievement. Use as a suggestion for what to do next.";
helpFile.cheevof = "Display a 'full' achievement. If you choose an achievement (not a category), displays tiers, and rewards.";
controller.hears(['^cheevo(.*)', '^cheevor(.*)', '^cheevof(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }
  //fetch access token from storage
  controller.storage.users.get(message.user, function(err, user) {
    if (err) {
      bot.reply(message, "I got an error loading your data (or you have no access token set up). Try again later");
      bot.botkit.log("Error:cheevo no user data " + JSON.stringify(err));
      return;
    }
    var lookupSass = [
      'let me get right on that for you.',
      'I am sworn to look up your achievements.',
      "I'll check.",
      "let's do this.",
      "I'm on it.",
      "I guess I can."
    ];
    bot.reply(message, "Okay, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ", " + sf.randomOneOf(lookupSass));

    //precheck - input scrub a bit
    var matches = sf.removePunctuationAndToLower(message.text).match(/(cheevor|cheevof|cheevo)\s?([\s\w]*)$/i);
    if (!matches || !matches[2]) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help " + (isRandom ? 'cheevor' : 'cheevo') + "\'?");
      return;
    }
    var isRandom = matches[1] == 'cheevor';
    var isFull = matches[1] == 'cheevof';

    //precheck: access token.
    if (!user || !user.access_token || !userHasPermission(user, 'progression')) {
      bot.botkit.log('ERROR: cheevo no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'progression') ? "with correct 'progression' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    //precheck: account acievements
    gw2nodelib.accountAchievements(function(accountAchievements) {
      if (accountAchievements.text || accountAchievements.error) {
        bot.reply(message, "Oops. I got an error when asking for your achievements.\nTry again later, it'll probably be fine.");
        bot.botkit.log("Account fetch error for user " + message.user + "." + (accountAchievements.text ? " Text:" + accountAchievements.text : '') + (accountAchievements.error ? "\nError:" + accountAchievements.error : ''));
        return;
      }
      cheevoSearchString = matches[2].replace(/\s+/g, '');
      //Look up the string.
      var cheevoToDisplay; //try a loop with contains
      var possibleMatches = [];
      var exactMatches = [];
      for (var c in gw2nodelib.data.achievementsCategories) {
        var cheeCat = gw2nodelib.data.achievementsCategories[c];
        if (cheeCat.name) {
          var cleanCat = sf.removePunctuationAndToLower(cheeCat.name).replace(/\s+/g, '');
          if (cleanCat == cheevoSearchString) {
            exactMatches.push(cheeCat);
            break;
          } else if (cleanCat.includes(cheevoSearchString))
            possibleMatches.push(cheeCat);
        }
      }
      for (var ch in gw2nodelib.data.achievements) {
        var chee = gw2nodelib.data.achievements[ch];
        if (chee.name) {
          var cleanChee = sf.removePunctuationAndToLower(chee.name).replace(/\s+/g, '');
          if (cleanChee == cheevoSearchString) {
            exactMatches.push(chee);
            break;
          } else if (cleanChee.includes(cheevoSearchString))
            possibleMatches.push(chee);
        }
      }
      if (exactMatches.length > 0) //cutout for categories or achievements with exact names.
        possibleMatches = exactMatches;
      if (possibleMatches.length < 1) {
        bot.reply(message, "No Achievements or Achievement Categories contain that phrase.  ¯\\_(ツ)_/¯");
        return;
      } else if (possibleMatches.length == 1) {
        globalMessage = message;
        if (possibleMatches[0].achievements)
          displayCategoryCallback(accountAchievements, possibleMatches[0]);
        else
          lookupCheevoParts(accountAchievements, possibleMatches[0], isFull, (isRandom ? displayRandomCheevoCallback : displayCheevoCallback));
      } else if (possibleMatches.length > 10) {
        var itemNameList = [];
        for (var n in possibleMatches)
          itemNameList.push(possibleMatches[n].name);
        bot.reply(message, {
          attachments: {
            attachment: {
              fallback: 'Too many achievements found in search.',
              text: "Woah. I found " + possibleMatches.length + ' achievements. Get more specific.\n' + itemNameList.join("\n")
            }
          }
        });
      } else {
        bot.startConversation(message, function(err, convo) {
          var askNum = 2;
          var listofItems = '';
          for (var i in possibleMatches) {
            var descString = '';
            if (possibleMatches[i].requirement) {
              descString = possibleMatches[i].requirement;
            } else if (possibleMatches[i].description) {
              descString = possibleMatches[i].description;
            } else if (possibleMatches[i].achievements) {
              descString = 'Category with ' + possibleMatches[i].achievements.length + ' achievements.';
            }
            if (descString.length > 32) {
              descString = descString.slice(0, 32);
              descString += '...';
            }

            listofItems += '\n' + [i] + ": " + possibleMatches[i].name + (descString ? " - " + descString : '');
          }
          convo.ask('I found multiple achievements with that name. Which number you mean? (say no to quit)' + listofItems, [{
            //number, no, or repeat
            pattern: new RegExp(/^(\d{1,2})/i),
            callback: function(response, convo) {
              //if it's a number, and that number is within our search results, print it
              var matches = response.text.match(/^(\d{1,})/i);
              var selection = matches[0];
              if (selection < possibleMatches.length) {
                globalMessage = convo;
                if (possibleMatches[selection].achievements)
                  displayCategoryCallback(accountAchievements, possibleMatches[selection]);
                else
                  lookupCheevoParts(accountAchievements, possibleMatches[selection], isFull, (isRandom ? displayRandomCheevoCallback : displayCheevoCallback));
              } else if (askNum-- > 0) {
                convo.say("Choose a valid number.");
                convo.repeat();
              } else
                convo.say("Oh well.");
              convo.next();
            }
          }, {
            //negative response. Stop repeating the list.
            pattern: bot.utterances.no,
            callback: function(response, convo) {
              convo.say('¯\\_(ツ)_/¯');
              convo.next();
            }
          }, {
            default: true,
            callback: function(response, convo) {
              // loop back, user needs to pick or say no.
              if (askNum-- > 0) {
                convo.say("Choose a number of the achievement you'd like to see.");
                convo.repeat();
              } else
                convo.say("Be serious.");
              convo.next();
            }
          }]);
        });
      }
    }, {
      access_token: user.access_token
    }, true);
  });
});

//must be a category Just pick a cheevo at random from the category
function displayRandomCheevoCallback(accountAchievements, cheevoToDisplay) {
  var randomNum;
  var alreadyDone = true;
  var acctCheevo;
  if (cheevoToDisplay.achievements) { //choose random achievement from sub category
    //keep picking until we find one the user has not done.
    acctCheevo = findInAccount(cheevoToDisplay.achievements[randomNum], accountAchievements);
    while (alreadyDone) {
      randomNum = Math.floor(Math.random() * cheevoToDisplay.achievements.length);
      if (!acctCheevo || !acctCheevo.done || acctCheevo.current < acctCheevo.max) {
        alreadyDone = false;
      }
    }
    var randomCheevo = findInData('id', cheevoToDisplay.achievements[randomNum], 'achievements'); //find the achievement to get the name
    //replace descriptions ending in periods with exclamation points for MORE ENTHSIASM
    var desc = randomCheevo.description.replace(/(\.)$/, '');
    desc += '!';
    var url = "http://wiki.guildwars2.com/wiki/" + randomCheevo.name.replace(/\s/g, "_");
    replyWith("Go do '" + randomCheevo.name + "'." + (desc.length > 1 ? "\n" + desc : '') + "\n" + url);
  } else if (cheevoToDisplay.bits) { //choose random part of an achievement
    acctCheevo = findInAccount(cheevoToDisplay.id, accountAchievements);
    while (alreadyDone) {
      randomNum = Math.floor(Math.random() * cheevoToDisplay.bits.length);
      if (!acctCheevo || !acctCheevo.bits) {
        alreadyDone = false;
      } else {
        for (var bit in acctCheevo.bits) { //go through account bits and see if they've done the one we've randoed
          if (acctCheevo.bits[bit] == randomNum)
            alreadyDone = false;
        }
      }
    }
    replyWith("Go forth and get...\n" + displayAchievementBit(cheevoToDisplay.bits[randomNum]), false);
  } else {
    replyWith("Sorry, that particular achievement has no parts to randomly choose from.\n...from which to randomly choose. Whatever.");
  }
}

function displayCategoryCallback(accountAchievements, categoryToDisplay) {

  //go through each achievement in the category, get name, if done by user: sum progress
  var numDone = 0;
  var totalAchievements = categoryToDisplay.achievements.length;
  var partsCurrentSum = 0;
  var partsMaxSum = 0;
  var achievementTextList = [];
  for (var a in categoryToDisplay.achievements) {
    var gameAchievement = findInData('id', categoryToDisplay.achievements[a], 'achievements');
    if (!gameAchievement) { //if we don't have the game data, skip it
      achievementTextList.push("No Achievement found in data - id  " + categoryToDisplay.achievements[a]);
      continue;
    }
    var name = 'Nameless Achievement';
    var doneProgress = '';
    var repeat = '';
    if (gameAchievement.name) name = gameAchievement.name;
    var acctCheevo = findInAccount(categoryToDisplay.achievements[a], accountAchievements);
    if (acctCheevo && typeof acctCheevo.current == 'number' && typeof acctCheevo.max == 'number') {
      if (typeof acctCheevo.repeated == 'number' && acctCheevo.repeated > 0) {
        repeat = " (repeated " + (acctCheevo.repeated > 1 ? acctCheevo.repeated + " times" : 'once') + ")";
        //on a repeat, add to the total as if we've done it once, despite current progress
        partsCurrentSum += acctCheevo.max;
      } else {
        //otehrwise, add our current progress to it.
        partsCurrentSum += acctCheevo.current;
      }
      partsMaxSum += acctCheevo.max;
      doneProgress = " - " + acctCheevo.current + "/" + acctCheevo.max;
      if (acctCheevo.done || repeat.length > 0) {
        numDone++;
        if (typeof acctCheevo.repeated != 'number' || acctCheevo.repeated <= 0) //append 'done' if we're not mid-repeat.
          doneProgress += ' (Done)';
      }
    } else //not done/progressed, add highest tier count as a 'max' and show 0 of that amount
    if (gameAchievement.tiers) {
      var tierMax = gameAchievement.tiers[gameAchievement.tiers.length - 1].count;
      doneProgress = " - 0/" + tierMax;
      partsMaxSum += tierMax;
    }

    achievementTextList.push(name + doneProgress + repeat);
  }
  var pretext = '';
  var fields = [];

  title = categoryToDisplay.name + " Report";
  if (partsCurrentSum > 0)
    fields.push({
      title: "Total" + (numDone + totalAchievements > 0 ? ': ' + numDone + ' of ' + totalAchievements : ''),
      value: "You've done " + partsCurrentSum + " out of " + partsMaxSum + " parts (" + Math.floor(partsCurrentSum / partsMaxSum * 100) + "%).\nRepeats count as their max value."
    });


  attachment = {};
  attachment = { //assemble attachment
    fallback: title,
    pretext: pretext,
    //example: Dungeon Frequenter Report 5 of 8 - Done 4 times
    title: title,
    color: '#AA129F',
    thumb_url: (categoryToDisplay.icon ? categoryToDisplay.icon : "https://wiki.guildwars2.com/images/d/d9/Hero.png"),
    fields: fields,
    text: achievementTextList.join('\n')
  };
  replyWith({
    text: '',
    attachments: {
      attachment: attachment
    }
  });
}

function lookupCheevoParts(accountAchievements, cheevoToDisplay, isFull, callback) {

  var skinsToFetch = [];
  var titlesToFetch = [];
  var minisToFetch = [];
  var itemsToFetch = [];

  var searchList = [];
  if (typeof cheevoToDisplay.bits != 'undefined')
    searchList = searchList.concat(cheevoToDisplay.bits);
  if (typeof cheevoToDisplay.rewards != 'undefined')
    searchList = searchList.concat(cheevoToDisplay.rewards);
  //collate list of things to fetch
  for (var b in searchList) {
    if (searchList[b].id) {
      var searchId = searchList[b].id;
      switch (searchList[b].type) {
        case "Skin":
          skinsToFetch.push(searchId);
          break;
        case "Title":
          titlesToFetch.push(searchId);
          break;
        case "Minipet":
          minisToFetch.push(searchId);
          break;
        case "Item":
          itemsToFetch.push(searchId);
      }
    }
  }
  if (debug) console.log(skinsToFetch.length + " skins to fetch\n" +
    titlesToFetch.length + " titles to fetch\n" +
    minisToFetch.length + " minis to fetch\n" +
    itemsToFetch.length + " items to fetch");
  Promise.all([gw2nodelib.promise.skins(skinsToFetch), gw2nodelib.promise.titles(titlesToFetch), gw2nodelib.promise.minis(minisToFetch), gw2nodelib.promise.items(itemsToFetch)]).then(function(results) {
    fetchFreshData = results;
    callback(accountAchievements, cheevoToDisplay, isFull);
  }).catch(function(error) {
    bot.reply(message, "I got an error on my way to promise land from cheevos. Send help!\nTell them " + error);
  });
}

function displayCheevoCallback(accountAchievements, cheevoToDisplay, isFull) {
  //setup all but the bits
  var pretext = '';
  var acctCheevo = findInAccount(cheevoToDisplay.id, accountAchievements);
  var currentPartsDone = 0;

  //max is the count of the highest tier, not just the sum ob the bits.
  var maxParts = (cheevoToDisplay.tiers && cheevoToDisplay.tiers[cheevoToDisplay.tiers.length - 1].count > 1 ? cheevoToDisplay.tiers[cheevoToDisplay.tiers.length - 1].count : 0);
  var repeat = '';
  if (acctCheevo) {
    if (typeof acctCheevo.current == 'number') currentPartsDone = acctCheevo.current;
    if (typeof acctCheevo.max == 'number') maxParts = acctCheevo.max;
    if (typeof acctCheevo.repeated == 'number' && acctCheevo.repeated > 0) repeat = ", repeated " + (acctCheevo.repeated > 1 ? acctCheevo.repeated + " times" : 'once');
  }
  var title = cheevoToDisplay.name + " Report";
  var text = '';

  //Load bits to desplay into data first.
  var cheevoBits = [];
  for (var b in cheevoToDisplay.bits) {
    var doneFlag = false;
    if (acctCheevo && acctCheevo.bits) {
      if (acctCheevo.bits.indexOf(Number(b)) >= 0) {
        doneFlag = true;
      }
    }
    cheevoBits.push(displayAchievementBit(cheevoToDisplay.bits[b], doneFlag));
  }
  var fields = [];

  var totalString = '';
  if (maxParts > 1)
    totalString = "Total: " + currentPartsDone + ' of ' + maxParts + " (" + (Math.floor(currentPartsDone / maxParts * 100) > 100 ? '100' : Math.floor(currentPartsDone / maxParts * 100)) + "%)" + repeat;
  else
    totalString = (acctCheevo && acctCheevo.done ? "" : "Not ") + "Complete" + repeat;
  var summaryField = {
    title: totalString,
    value: ''
  };

  if (cheevoToDisplay.description.length > 0)
    summaryField.value += "\nDescription: " + replaceGWFlavorTextTags(cheevoToDisplay.description);
  if (cheevoToDisplay.requirement.length > 0)
    summaryField.value += "\nRequirement: " + replaceGWFlavorTextTags(cheevoToDisplay.requirement);

  fields.push(summaryField);

  if (cheevoToDisplay.tiers && isFull) { //there's aways a tiers, but whatever.
    var tierField = {
      title: 'Tiers',
      value: '#\tPoints'
    };
    for (var tier in cheevoToDisplay.tiers) {
      tierField.value += '\n' + cheevoToDisplay.tiers[tier].count + "\t" + cheevoToDisplay.tiers[tier].points;
    }

    fields.push(tierField);
  }

  if (cheevoToDisplay.rewards && isFull) {
    var rewardField = {
      title: "Rewards",
      value: ""
    };
    for (var reward in cheevoToDisplay.rewards) {
      rewardField.value += '\n' + displayAchievementBit(cheevoToDisplay.rewards[reward]);
    }
    fields.push(rewardField);
  }

  if (!toggle) {
    //raw data for debug
    fields.push({
      title: "Raw Cheevo",
      value: JSON.stringify(cheevoToDisplay)
    });
    //raw data for debug
    fields.push({
      title: "Raw Progress",
      value: (acctCheevo ? JSON.stringify(acctCheevo) : "Not done")
    });
  }

  attachment = {};
  attachment = { //assemble attachment
    fallback: title,
    pretext: pretext,
    //example: Dungeon Frequenter Report 5 of 8 - Done 4 times
    title: title,
    color: '#F0AC1B',
    thumb_url: getIconForParentCategory(cheevoToDisplay),
    fields: fields,
    text: text + "\n" + cheevoBits.join('\n')
  };
  replyWith({
    text: '',
    attachments: {
      attachment: attachment
    }
  });

}

function getIconForParentCategory(cheevo) {
  if (cheevo.icon) return cheevo.icon;
  else {
    for (var cat in gw2nodelib.data.achievementsCategories) {
      if (gw2nodelib.data.achievementsCategories[cat].achievements.indexOf(cheevo.id) >= 0 && gw2nodelib.data.achievementsCategories[cat].icon)
        return gw2nodelib.data.achievementsCategories[cat].icon;
    }
  }
  //default
  return "https://wiki.guildwars2.com/images/d/d9/Hero.png";
}

var fetchFreshData = []; //filled by promise fetch in Display cheevo call back
function displayAchievementBit(bit, doneFlag, data) {

  //covers achievement bits and rewards. Rewards have a count
  //Types are:
  //Text: simple text
  //Item and id {"type":"Item","id":78252,"count":1}
  //Coins: a count of coins (in copper) {"type":"Coins","count":50000}]}
  //mastery Tyria or maguuma {"type": "Mastery","region": "Tyria"}
  //Skin and id (no count) {"type": "Skin","id": 208}
  //Minipet and id (no count) {"type": "Minipet","id": 12}

  var skinData = fetchFreshData[0];
  var titleData = fetchFreshData[1];
  var miniData = fetchFreshData[2];
  var itemData = fetchFreshData[3];

  if (bit.type == 'Text')
    return bit.text + (doneFlag ? " - DONE" : '');
  else if (bit.type == 'Coins') {
    var gold = Math.floor(bit.count / 10000);
    var silver = Math.floor((bit.count % 10000) / 100);
    var copper = Math.floor(bit.count % 100);
    return "Coins: " + (gold > 0 ? gold + 'g ' : '') + (silver > 0 ? silver + 's ' : '') + (copper > 0 ? copper + 'c ' : '');
  } else if (bit.type == 'Mastery')
    return bit.region + " " + bit.type;
  else if (bit.type == 'Item') {
    var foundItem;
    for (var it in itemData) {
      if (bit.id == itemData[it].id) {
        foundItem = itemData[it];
        break;
      }
    }
    var itemType = ''; //weapon, armor, bag, etc
    if (foundItem && foundItem.type) {
      itemType = " (" + foundItem.type;
      if (foundItem.type != 'Container' && foundItem.details && foundItem.details.type) itemType += ": " + (foundItem.details.weight_class ? foundItem.details.weight_class + " " : "") + foundItem.details.type;
      itemType += ")";
      return foundItem.name + itemType + (bit.count && bit.count > 1 ? ', ' + bit.count : '') + (doneFlag ? " - DONE" : '');
    } else {
      return "Unknown item: " + bit.id + (doneFlag ? " - DONE" : '');
    }
  } else if (bit.type == 'Skin') {
    var foundSkin;
    for (var sk in skinData) {
      if (bit.id == skinData[sk].id) {
        foundSkin = skinData[sk];
        break;
      }
    }
    if (foundSkin) {
      var type = (foundSkin.details ? foundSkin.details.type : foundSkin.type);
      var weight = (foundSkin.details && foundSkin.details.weight_class ? foundSkin.details.weight_class : '');
      return foundSkin.name + " (" + (weight.length > 0 ? weight + " " : "") + type + " skin)" + (doneFlag ? " - DONE" : '');
    } else {
      return "Unknown skin: " + bit.id + (doneFlag ? " - DONE" : '');
    }
  } else if (bit.type == 'Title') {
    var foundTitle;
    for (var ti in titleData) {
      if (bit.id == titleData[ti].id) {
        foundTitle = titleData[ti];
        break;
      }
    }
    if (foundTitle) {
      var cheevoName = 'unknown achievement';
      var foundCheevo = findInData('id', foundTitle.achievement, 'achievements');
      if (foundCheevo) cheevoName = foundCheevo.name;
      return foundTitle.name + " (Title from " + cheevoName + ")";
    } else {
      return "Unknown title: " + bit.id + (doneFlag ? " - DONE" : '');
    }
  } else if (bit.type == 'Minipet') {
    var foundMini;
    for (var mi in miniData) {
      if (bit.id == miniData[mi].id) {
        foundMini = miniData[mi];
        break;
      }
    }
    if (foundMini) {
      return foundMini.name;
    } else {
      return "Unknown Minipet: " + bit.id + (doneFlag ? " - DONE" : '');
    }
  } else return bit.type + ': ' + bit.id + (doneFlag ? " - DONE" : '');
}

////DAILIES
helpFile.daily = "Prints a report of the daily achievements for today and tomorrow.";
helpFile.today = "Prints a report of the daily achievements for today.";
helpFile.tomorrow = "Prints a report of the daily achievements for tomorrow.";
controller.hears(['^daily$', '^today$', '^tomorrow$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  if (!achievementsLoaded) { //still loading
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }

  var printToday = true;
  var printTomorrow = true;
  var doneToday = false;
  var doneTomorrow = false;
  if (message.text.toLowerCase() == 'today') {
    printTomorrow = false;
    doneTomorrow = true;
  }
  if (message.text.toLowerCase() == 'tomorrow') {
    printToday = false;
    doneToday = true;
  }
  var levelEightiesOnly = function(arrayItem) {
    return arrayItem.level.max == 80;
  };

  var todayPvEs;
  var tomorrowPvEs;
  var dailiesCallback = function(dailyList, header) {
    if (header.options.day == 'today') {
      todayPvEs = dailyList.pve.filter(levelEightiesOnly);
      doneToday = true;
    } else if (header.options.day == 'tomorrow') {
      tomorrowPvEs = dailyList.pve.filter(levelEightiesOnly);
      doneTomorrow = true;
    }

    if (doneTomorrow && doneToday) {
      var fieldsFormatted = [];
      if (printToday) {
        fieldsFormatted.push({
          "title": "Today's Daily Achievements",
          //"value": day.name,
          "short": false
        });
        for (var d in todayPvEs) {
          var day = findInData('id', todayPvEs[d].id, 'achievements');
          var dayLabel;
          if (day && day.name) {
            dayLabel = day.name;
            if (todayPvEs[d].required_access.length == 1)
              dayLabel += (todayPvEs[d].required_access[0] == 'GuildWars2' ? ' (Old World)' : ' (HoT)');
          } else dayLabel = "Nameless Achievement - id  " + todayPvEs[d].id;
          fieldsFormatted.push({
            //            "title": ,
            "value": dayLabel,
            "short": false
          });
        }
      }
      if (printTomorrow) {
        fieldsFormatted.push({
          "title": "Tomorow's Daily Achievements",
          //"value": day.name,
          "short": false
        });

        for (var t in tomorrowPvEs) {
          var morrow = findInData('id', tomorrowPvEs[t].id, 'achievements');
          var morrowLabel;
          if (morrow && morrow.name) {
            morrowLabel = morrow.name;
            if (tomorrowPvEs[t].required_access.length == 1)
              morrowLabel += (tomorrowPvEs[t].required_access[0] == 'GuildWars2' ? ' (Old World)' : ' (HoT)');
          } else morrowLabel = "Nameless Achievement - id " + tomorrowPvEs[t].id;
          fieldsFormatted.push({
            "value": morrowLabel,
            "short": false
          });

        }
      }

      var attachments = [];
      var attachment = { //assemble attachment
        fallback: 'Daily Achievements',
        color: '#000000',
        thumb_url: "https://wiki.guildwars2.com/images/1/14/Daily_Achievement.png",
        fields: fieldsFormatted,
      };
      attachments.push(attachment);
      bot.reply(message, {
        attachments: attachments,
      }, function(err, resp) {
        if (err || debug) bot.botkit.log(err, resp);
      });
    }
  };

  if (printToday)
    gw2nodelib.dailies(dailiesCallback, {
      day: 'today'
    }, true);
  if (printTomorrow)
    gw2nodelib.dailiesTomorrow(dailiesCallback, {
      day: 'tomorrow'
    }, true);

});

////CHARACTERS
helpFile.deaths = "Display a report of characters on your account, and their career deaths.";
helpFile.characters = 'Alias for character deaths. ' + JSON.stringify(helpFile.characterDeaths);
controller.hears(['^deaths$', '^characters$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
    if (!user || !user.access_token || !userHasPermission(user, 'characters')) {
      bot.botkit.log('ERROR: characters: no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'characters') ? "with correct 'characters' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    gw2nodelib.characters(function(jsonList) {
      if (jsonList.text || jsonList.error) {
        bot.reply(message, "Oops. I got this error when asking about characters: " + (jsonList.text ? jsonList.text : jsonList.error));
      } else {
        bot.reply(message, "I found " + Object.keys(jsonList).length + ' characters, ' + user.dfid + sf.randomHonoriffic(user.dfid, user.id));
        var attachments = [];
        var attachment = {
          fallback: 'A character death report' + (user.name ? " for " + user.name : '') + '.',
          color: '#000000',
          thumb_url: "https://cdn4.iconfinder.com/data/icons/proglyphs-signs-and-symbols/512/Poison-512.png",
          fields: [],
        };
        var totalDeaths = 0;
        for (var n in jsonList) {
          if (debug) bot.botkit.log("char :" + jsonList[n]);
          attachment.fields.push({
            value: jsonList[n].name + '\n' + (jsonList[n].race == 'Charr' ? 'Filthy Charr' : jsonList[n].race) + ' ' + jsonList[n].profession,
            title: jsonList[n].deaths,
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
      ids: "all"
    }, true);
  });
});

////PREFIX
helpFile.prefix = "Takes three arguments.\nOne: Returns a list of all item prefixes and their stats that contain that string.\nTwo (Optional):The character level at which the suffix is available. Note that level 60 prefixes start to show up on weapons (only) at level 52.\nThree (Optional): Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but 'a' will be all.\nExamples: 'prefix berzerker' 'prefix pow gem' 'prefix pow 22 asc'";
helpFile.suffix = "Alias for prefix. " + JSON.stringify(helpFile.prefix);
var prefixData = sf.loadStaticDataFromFile('prefix.json');
controller.hears(['^prefix (.*)', '^suffix (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/(prefix|suffix) (['\w]+)\s?(\d{1,2})?\s?(\w*)$/i);
  if (!matches) {
    bot.reply(message, 'No match. Ask me "help prefix" for formatting help.');
  } else {
    var name = (matches[2] ? matches[2].trim() : "");
    var level = matches[3] || null;
    var type = (matches[4] ? matches[4].trim() : "");
    name = sf.removePunctuationAndToLower(name);
    type = scrubType(removePunctuationAndToLower(type));
    var prefixes = prefixSearch(name, type, level);
    if (!prefixes || (Object.keys(prefixes).length) < 1)
      bot.reply(message, 'No' + (level ? ' level ' + level : '') + ' match for \'' + name + '\' of type \'' + type + '\'. Misspell? Or maybe search all.');
    else {
      bot.reply(message, printPrefixes(prefixes));
    }
  }
});

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
  if (debug) bot.botkit.log("searching " + searchTerm + " of type " + type + " and level " + level);
  findPrefixesByStat(searchTerm, type, prefixList);
  filterPrefixesByLevel(prefixList, (level ? level : 80));
  findPrefixByName(searchTerm, prefixList);
  return prefixList;
}

//Search given prefix data for matching name
function findPrefixByName(name, prefixList) {
  for (var key in prefixData) {
    var compare = sf.removePunctuationAndToLower(key);
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
        var compare = sf.removePunctuationAndToLower(prefixData[key].stats[subKey]);
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

////PROFESSION REPORT
helpFile.professionReport = "Collate all known accounts characters by profession";
helpFile.pr = "Alias for professionReport. " + JSON.stringify(helpFile.professionReport);
controller.hears(['^professionReport$', '^pr$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  //Setup variables
  var num = 0;
  var goodUsers = [];
  var classes = [];

  //once all users are loaded, correlate their professions.
  var professionReportCallback = function(jsonData, headers) {
    var name;
    //save this user classes and name
    for (var z in goodUsers) {
      if (headers && headers.options && headers.options.access_token && headers.options.access_token == goodUsers[z].access_token && goodUsers[z].name) {
        name = goodUsers[z].name;
        if (jsonData.error || jsonData.text) {
          replyWith("I got an error looking up the data for " + name + ". They will be omitted from the results.", true);
          bot.botkit.log("error: " + jsonData.error + "\ntext: " + jsonData.text);
          //no need to exit. it will find nothing in jsonData and exit, unless this is the last one, then it will assemble the report.
          goodUsers[z].error = true;
        }
        break;
      }
    }
    for (var c in jsonData) {
      if (jsonData[c].profession) {
        if (!classes[jsonData[c].profession])
          classes[jsonData[c].profession] = {
            num: 0,
            user: []
          };
        classes[jsonData[c].profession].num++;
        classes[jsonData[c].profession].user.push(name);
      } else bot.botkit.log("Unknown profession?" + JSON.stringify(jsonData[c]));
    }

    //after all users are done, spit out report
    if (++num == goodUsers.length) {
      var acceptableQuaggans = [
        "https://static.staticwars.com/quaggans/helmut.jpg",
        "https://static.staticwars.com/quaggans/knight.jpg",
        "https://static.staticwars.com/quaggans/hoodie-up.jpg",
        "https://static.staticwars.com/quaggans/lollipop.jpg"
      ];

      acceptableQuaggans = sf.arrayUnique(acceptableQuaggans);

      //remove errored users
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
      for (var s in classes) {
        var plural = (s == 'Thief' ? 'Thieves' : s + 's');
        fieldsFormatted.push({
          "title": classes[s].num + ' ' + (classes[s].num != 1 ? plural : s),
          "value": classes[s].user.join(", "),
          "short": true
        });
      }

      var attachments = [];
      var attachment = { //assemble attachment
        fallback: 'A Profession Report',
        color: '#000000',
        thumb_url: sf.randomOneOf(acceptableQuaggans),
        fields: fieldsFormatted,
      };
      attachments.push(attachment);
      replyWith({
        text: "Collating the professions of: " + pretextString + ".",
        attachments: attachments,
      }, false);
    }
  };

  //fetch access tokens from storage
  controller.storage.users.all(function(err, userData) {
    for (var u in userData) {
      //remove those without permissions
      if (userData[u].access_token && userHasPermission(userData[u], 'characters')) {
        goodUsers.push(userData[u]);
      }
    }
    //goodUsers is now a list of users with good access tokens
    bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for profession report.");

    //If no user id argument or only invalid arguments, print list and return
    bot.reply(message, "Professions? Hang on.");
    globalMessage = message;
    for (var g in goodUsers) {
      gw2nodelib.characters(professionReportCallback, {
        access_token: goodUsers[g].access_token,
        ids: 'all'
      }, true);
    }

  });
});

helpFile.hello = "Lessdremoth will say hi back.";
helpFile.hi = "Lessdremoth will say hi back.";
controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
  if (message.user && message.user == 'U1AGDSX3K') {
    bot.reply(message, "Hi, roj. You're the best");
    addReaction(message, 'gir');
  } else {
    bot.reply(message, 'Hello.');
    addReaction(message, 'robot_face');
  }
});

helpFile.shutdown = "Command Lessdremoth to shut down.";
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message);
});
helpFile.restart = "Command Lessdremoth to restart.";
controller.hears(['restart'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message, true);
});

function botShutdown(message, restart) {
  bot.startConversation(message, function(err, convo) {
    convo.ask('Are you sure you want me to shutdown?', [{
      pattern: bot.utterances.yes,
      callback: function(response, convo) {
        convo.say('(╯°□°)╯︵ ┻━┻');
        if (restart)
          convo.say("Oh wait, you said restart...");
        if (restart) {
          convo.say("┬─┬﻿ ノ( ゜-゜ノ)\nBRB.");
        } else
          convo.say(tantrum());
        convo.next();
        setTimeout(function() {
          process.exit((restart ? 1 : 0));
        }, 3000);
      }
    }, {
      pattern: bot.utterances.no,
      default: true,
      callback: function(response, convo) {
        convo.say('¯\\_(ツ)_/¯');
        convo.next();
      }
    }]);
  });
}

helpFile.uptime = "Lessdremoth will display some basic uptime information.";
helpFile["who are you"] = "Lessdremoth will display some basic uptime information.";
controller.hears(['^uptime', '^who are you'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var os = require('os');
  var hostname = os.hostname();
  //Say scond uptime in nearest sane unit of measure
  var formatUptime = function(uptime) {
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
  };

  var uptime = formatUptime(process.uptime());

  bot.reply(message, ':frasier: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');
  var dataString = '';
  for (var type in gw2nodelib.data)
    if (gw2nodelib.data[type].length > 0)
      dataString += '\n' + type + ': ' + gw2nodelib.data[type].length;
  if (dataString)
    bot.reply(message, "Data:" + dataString);
});

////EASTER EGGS AND DEBUGS


helpFile.sample = "Shows a sample attachment.";
controller.hears(['^sample'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var attachments = [];
  attachment = { //assemble attachment
    fallback: 'This is sample fallback text.',
    pretext: 'This is sample pretext above the thing',
    title: 'This is the title. ',
    color: '#F0AC1B',
    thumb_url: "http://icons.iconarchive.com/icons/hopstarter/gloss-mac/256/Burn-icon.png",
    text: "None of this can be formatted, apparently. <b>Nope</b> *Nope*. This is the text. We can also display an image instead of that black and yellow thumb, but it'll take up the whole space and be below everything. Toggle to flip.",
    author_name: "There can be an 'Author' Name (and link), and image.",
    author_icon: "http://images2.fanpop.com/image/photos/9200000/Moose-Eddie-frasier-9288166-176-160.jpg",
    footer: "There's also a footer down here, with icon and timestamp.",
    footer_icon: "https://platform.slack-edge.com/img/default_application_icon.png",
    "ts": message.ts
  };
  if (!toggle) {
    attachment.image_url = "http://www.noupe.com/wp-content/uploads/2014/04/funny_icons_toilet.png";
    attachment.text += '\n(I left off the fields since the image is large, but attachments can have both.)';
  } else {
    attachment.fields = [{
      title: "This is a Field",
      value: "This text is its 'value'. Fields can be type long and take up the whole width, or:",
      short: false
    }, {
      title: "Field Title Two",
      value: "Or short and put in a pair of columns",
      short: true
    }, {
      title: "Really Long Text Title And Value on a Short Field",
      value: "Fields are always separated by a little space, and the short ones line up in the space needed for the largest.",
      short: true
    }, {
      title: "Another Field",
      value: "The color bar is also customizable. This one's #F0AC1B. A message can have more than one attachment, but each attachment is denoted by its single color bar.",
      short: false
    }];
  }
  attachments.push(attachment);
  attachments.push({
    text: 'a second attachment with only text.',
    color: '#000000'
  });
  bot.reply(message, {
    text: '',
    "username": "Username is Changeable",
    icon_url: "http://2.bp.blogspot.com/-2LwDu1XiyBQ/TsWG3vO99GI/AAAAAAAABL4/j6f8EtRPR-Y/s1600/Ep86.jpg",
    attachments: attachments
  });
});

controller.hears(['^toggle'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var replyString = '(╯°□°)╯︵ ┻━┻';
  if (toggle) toggle = false;
  else {
    toggle = true;
    replyString = '┬─┬﻿ ノ( ゜-゜ノ)';
  }
  bot.reply(message, "So toggled.\n" + replyString);
});


controller.hears(['my love for you is like a truck', 'my love for you is like a rock', 'my love for you is ticking clock'], 'direct_message,ambient', function(bot, message) {
  var prefixes = prefixSearch('berserker');
  // if (prefixes)
  bot.reply(message, printPrefixes(prefixes));
});



controller.hears(['^debugger'], 'direct_message,direct_mention', function(bot, message) {
  var replyMessage = 'no debugs right now';
  if (message.user && message.user == 'U1AGDSX3K') {
    bot.reply(message, "ᕙ(⇀‸↼‶)ᕗ");
    // var itemsWithRarity = [];
    // for(var i in gw2nodelib.data.items){
    //   if(gw2nodelib.data.items[i].rarity)
    //     itemsWithRarity.push(gw2nodelib.data.items[i].name + ": "+gw2nodelib.data.items[i].rarity);
    // }
    // replyMessage = "found:\n"+itemsWithRarity.join('\n'));
    var listy = [];
    for (var i in gw2nodelib.data.achievements) {
      if (gw2nodelib.data.achievements[i].flags && gw2nodelib.data.achievements[i].flags.indexOf("Hidden") >= 0) {
        listy.push(gw2nodelib.data.achievements[i].name);
      }
      if (listy.length > 20)
        break;
    }
    replyMessage = "Some Hidden Guys:\n";
    replyMessage += listy.join("\n");
  } else replyMessage += "...   for YOU";
  bot.reply(message, replyMessage);
});



controller.hears(['^little', 'yellow', 'two of these', 'nuprin', 'headache'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {

  var prefixes = prefixSearch('nuprin');
  // if (prefixes)
  bot.reply(message, printPrefixes(prefixes));

});

prefixData.Nuprin = {
  "type": "standard",
  "minlevel": 8,
  "maxlevel": 20,
  "stats": ["Little", "Yellow", "Different"]
};

////HELPER FUNCTIONS
function userHasPermission(user, permission) {
  if (user && user.permissions)
    for (var p in user.permissions)
      if (user.permissions[p] == permission)
        return true;
  return false;
  //   account
  // Your account display name, ID, home world, and list of guilds. Required permission.
  // inventories
  // Your account bank, material storage, recipe unlocks, and character inventories.
  // characters
  // Basic information about your characters.
  // tradingpost
  // Your Trading Post transactions.
  // wallet
  // Your account's wallet.
  // unlocks
  // Your wardrobe unlocks—skins, dyes, minipets, finishers, etc.—and currently equipped skins.
  // pvp
  // Your PvP stats, match history, reward track progression, and custom arena details.
  // builds
  // Your currently equipped specializations, traits, skills, and equipment for all game modes.
  // progression
  // Your achievements, dungeon unlock status, mastery point assignments, and general PvE progress.
  // guilds
  // Guilds' rosters, history, and MOTDs for all guilds you are a member of. (if guild leader, also allow guild inventory access)
}

//reply to a convo or a standard message, depending on what is saved in globalMessage, optionally clear out globalmessage
function replyWith(messageToSend, keepGlobalMessage) {
  if (!globalMessage) return;
  if (globalMessage.say) //convo
    globalMessage.say(messageToSend);
  else
    bot.reply(globalMessage, messageToSend);
  if (!keepGlobalMessage)
    globalMessage = null;
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
  bot.botkit.log("Add reation to: " + JSON.stringify(message));
  bot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: emoji,
  }, function(err, res) {
    if (err) {
      bot.reply(message, "I'm having trouble adding reactions.");
      bot.botkit.log('Failed to add emoji reaction :(', err, res);
    }
  });
}

//replace strange tags that occasionally make it into item text.
function replaceGWFlavorTextTags(string, replacementText) {
  //replce <c=@flavor> and <c> with the replacment string (in GW, these indicate italics, so we can fee slack underscores)
  //replace <br> with newlines
  if (typeof replacementText == 'undefined') replacementText = '';
  return string.replace(/(<.?c(?:=@flavor)?>)/g, replacementText).replace(/(<br>)/g, '\n');
}

////DATA
controller.hears(['^db reload$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'Are you sure? It can take a long time. Say \'db reload go\' to launch for real');
});

controller.hears(['^db reload go$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'You asked for it. Starting reload.');
  globalMessage = message;
  prefixData = sf.loadStaticDataFromFile('prefix.json');
  standalone.reloadAllData();
  reloadAllData(true);
});

function halfCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  replyWith("Half done loading the list of " + apiKey + ".", true);
  bot.botkit.log("HALF " + apiKey + ": " + time + "ms");
}

function errorCallback(msg) {
  replyWith("Oop. I got an error while loading data:\n" + msg + '\nTry loading again later.', true);
  bot.botkit.log("error loading: " + msg);
  recipiesLoaded = false;
}

function doneRecipesCallback(apiKey) {
  //Recipes govern item load, so use a special callback
  var end = new Date().getTime();
  var time = end - start;
  replyWith("Finished loading the list of recipes. I found " + Object.keys(gw2nodelib.data[apiKey]).length + ". Starting on items.", true);
  bot.botkit.log("DONE " + apiKey + ": " + time + "ms");
  gw2nodelib.forgeRequest(function(forgeList) {
    if (debug) bot.botkit.log("unfiltered forgeitems: " + forgeList.length);
    var filteredForgeList = forgeList.filter(removeInvalidIngredients);
    if (debug) bot.botkit.log((forgeList.length - filteredForgeList.length) + " invalid forge items");
    if (debug) bot.botkit.log("forgeitems: " + filteredForgeList.length);
    gw2nodelib.data.forged = gw2nodelib.data.forged.concat(filteredForgeList);
    bot.botkit.log("data has " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes");
    //Go through recipes, and get the item id of all output items and recipe ingredients.
    var itemsCompile = sf.arrayUnique(compileIngredientIds());
    replyWith("I need to fetch item data for " + itemsCompile.length + " ingredients.", true);
    bot.botkit.log("Fetching " + itemsCompile.length + " ingredient items");

    var doneIngedientsCallback = function(apiKey) {
      replyWith("Ingredient list from recipes loaded. I know about " + Object.keys(gw2nodelib.data.items).length + " ingredients for the " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes.", true);
      var end = new Date().getTime();
      var time = end - start;
      bot.botkit.log("Item list from recipes loaded. Data has " + gw2nodelib.data.items.length + " items: " + time + "ms");
      recipiesLoaded = true;
      decrementAndCheckDone(apiKey);
    };
    console.log("items load, bypass cache is "+(globalMessage ? true : false));
    gw2nodelib.load("items", {
      ids: itemsCompile
    }, (globalMessage ? true : false), halfCallback, doneIngedientsCallback, errorCallback);
  });
}

function doneAllOtherCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  var apiKeyString = apiKey;
  if (apiKey == 'achievementsCategories') apiKeyString = 'achievement categories';
  replyWith("Finished loading the list of " + apiKeyString + ". I found " + Object.keys(gw2nodelib.data[apiKey]).length + ".", true);
  bot.botkit.log("DONE " + apiKey + ". Things: " + Object.keys(gw2nodelib.data[apiKey]).length + ": " + time + "ms");
  decrementAndCheckDone(apiKey);
  if (apiKey == 'achievementsCategories') {
    //to make this work, you need a global cheevoList
    for (var t in gw2nodelib.data.achievementsCategories) {
      var code = sf.removePunctuationAndToLower(gw2nodelib.data.achievementsCategories[t].name).replace(/\s+/g, '');
      if (!cheevoList[code]) {
        cheevoList[code] = {
          name: gw2nodelib.data.achievementsCategories[t].name,
          includeDone: true,
          includeUndone: true,
          category: true
        };
      }
    }
    achievementsCategoriesLoaded = true;
  }
  if (apiKey == 'achievements') {
    for (var a in gw2nodelib.data.achievements) {
      //to make this work, you need a global cheevoList
      var acode = sf.removePunctuationAndToLower(gw2nodelib.data.achievements[a].name).replace(/\s+/g, '');
      if (!cheevoList[acode]) {
        cheevoList[acode] = {
          name: gw2nodelib.data.achievements[a].name,
          includeDone: true,
          includeUndone: true,
          category: false
        };
      }
    }
    achievementsLoaded = true;
  }
}

function decrementAndCheckDone(apiKey) {
  if (--numToLoad === 0) {
    replyWith("All loading complete.", false);
    bot.botkit.log('Finished loading all apikeys after ' + apiKey + '.');
  }
}
//filter function for recipe data. Removes invalid output items id and invalid ingredient ids
function removeInvalidIngredients(value, index, array) {
  //Negative ids, output_item_ids and ingredient.item_ids are invalid
  if (value.id && value.id < 1) return false;
  if (value.output_item_id && value.output_item_id < 1) return false;
  for (var j in value.ingredients) {
    if (value.ingredients[j].item_id && value.ingredients[j].item_id < 1) return false;
  }
  return true;
}

//Scour through recipes and forge recipes for output item/ingredient item ids. Return a no-duplicate list of these.
function compileIngredientIds() {
  itemsCompile = [];
  for (var t in gw2nodelib.data.recipes) {
    itemsCompile.push(gw2nodelib.data.recipes[t].output_item_id);
    for (var i in gw2nodelib.data.recipes[t].ingredients) {
      itemsCompile.push(gw2nodelib.data.recipes[t].ingredients[i].item_id);
    }
  }
  for (var f in gw2nodelib.data.forged) {
    itemsCompile.push(gw2nodelib.data.forged[f].output_item_id);
    for (var g in gw2nodelib.data.forged[f].ingredients) {
      itemsCompile.push(gw2nodelib.data.forged[f].ingredients[g].item_id);
    }
  }
  return itemsCompile;
}


function reloadAllData(bypass) {
  gw2nodelib.data.recipes = [];
  gw2nodelib.data.items = [];
  gw2nodelib.data.forged = [];
  recipiesLoaded = false;

  gw2nodelib.data.achievements = [];
  gw2nodelib.data.achievementsCategories = [];
  achievementsLoaded = false;
  achievementsCategoriesLoaded = false;

  start = new Date().getTime();
  numToLoad = 4;
  gw2nodelib.load("currencies", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
  replyWith("Starting to load recipes.", true);
  gw2nodelib.load("recipes", {}, bypass, halfCallback, doneRecipesCallback, errorCallback);
  replyWith("Starting to load achievements.", true);
  gw2nodelib.load("achievements", {}, bypass, halfCallback, doneAllOtherCallback, errorCallback);
  replyWith("Starting to load achievement categories.", true);
  gw2nodelib.load("achievementsCategories", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
}