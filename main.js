//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
var debug = false;
var dataLoaded = false;
var toggle = true;
Botkit = require('botkit');
os = require('os');
fs = require('fs');
gw2nodelib = require('gw2nodelib');
fileLoad = gw2nodelib.loadCacheFromFile('cache.json');

prefixData = loadStaticDataFromFile('prefix.json');
helpFile = loadStaticDataFromFile('help.json');
sass = loadStaticDataFromFile('sass.json');
recipeById = [];
recipeByMade = [];
itemsById = [];

controller = Botkit.slackbot({
  debug: debug,
  json_file_store: 'slackbotDB',
});

if (!debug) { //"real" code
  if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
  }

  var bot = controller.spawn({
    token: process.env.token
  }).startRTM(function(err, bot, payload) {
    if (err) {
      throw new Error('Could not connect to Slack');
    }
  });
  var start = new Date().getTime();
  var globalMessage;

  gw2nodelib.half = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;
    if (globalMessage) {
      bot.reply(globalMessage, "Half done loading the list of recipies.");
    }
    console.log("HALF " + apiKey + ": " + time + "ms");
  };
  gw2nodelib.error = function(msg) {
    if (globalMessage) {
      bot.reply(globalMessage, "Oop. I got an error while loading data:\n" + msg + '\nTry loading again later.');
    }
    console.log("error loading: " + msg);
    dataLoaded = false;
  };
  gw2nodelib.done = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;
    if (globalMessage) {
      bot.reply(globalMessage, "Finished loading the list of recipies. Starting on items.");
    } else console.log("DONE " + apiKey + ": " + time + "ms");
    //Go through recipies, and get the item id of all output items and recipie ingredients.
    var itemsCompile = [];
    for (var t in gw2nodelib.data.recipes) {
      itemsCompile[gw2nodelib.data.recipes[t].output_item_id] = 1;
      for (var i in gw2nodelib.data.recipes[t].ingredients) {
        itemsCompile[gw2nodelib.data.recipes[t].ingredients[i].item_id] = 1;
      }
    }
    if (globalMessage) {
      bot.reply(globalMessage, "I need to fetch " + Object.keys(itemsCompile).length + " ingredient items");
    }
    console.log("we need to fetch " + Object.keys(itemsCompile).length + " recipie items");
    // console.log(JSON.stringify(itemsCompile));

    var offset = 200; //number to fetch at once
    var startIndex = 0;
    retry = 0;
    len = Object.keys(itemsCompile).length;
    total = Math.ceil(len / offset);
    loadMakeableItems(Object.keys(itemsCompile), startIndex, offset, (globalMessage ? true : false));
  };


  gw2nodelib.load("recipes", {}, false);

  ////HELP
  controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/help ([a-zA-Z ]*)/i);
    if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + listKeys(helpFile));
    else {
      var name = matches[1].toLowerCase();
      bot.reply(message, helpFile[name]);
    }
  });

  ////sass
  controller.hears(['^sass'], 'direct_message,direct_mention,mention', function(bot, message) {

    var num = Math.floor(Math.random() * sass.length);
    bot.reply(message, sass[num]);
  });


  ////////////////recipe lookup. I aplogize.
  controller.hears(['^craft (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    //Assembles an attahcment and calls bot reply. Used for one message, or after selectinv multiple.
    var replyWithRecipieFor = function(itemToMake) {
      var attachments = assembleRecipeAttachment(itemToMake);
      var foundRecipe = findInData('output_item_id', itemToMake.id, 'recipes');
      var amountString;
      if (foundRecipe && foundRecipe.output_item_count && foundRecipe.output_item_count > 1) { //if it's a multiple, collect multiple amount
        amountString = foundRecipe.output_item_count;
      }
      bot.reply(message, {
        'text': itemToMake.name + (amountString ? " x " + amountString : "") + (itemToMake.level ? " (level " + itemToMake.level + ")" : "") + (itemToMake.description ? "\n" + itemToMake.description : ""),
        attachments: attachments,
        'icon_url': itemToMake.icon,
        "username": "RecipeBot",
      }, function(err, resp) {
        if (err || debug) console.log(err, resp);
      });

    };

    var matches = message.text.match(/craft (.*)/i);
    if (!dataLoaded) { //still loading
      bot.reply(message, "I'm still loading data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    } else if (!matches || !matches[0]) { //mismatch
      bot.reply(message, "I didn't quite get that. Maybe ask \'help craft\'?");
    } else { //search
      var searchTerm = matches[1];
      var itemSearchResults = findCraftableItemByName(searchTerm);
      if (debug) console.log(itemSearchResults.length + " matches found");
      if (itemSearchResults.length === 0) { //no match
        bot.reply(message, "No item names contain that exact text. Note that I have no mystic forge recipies, and newly discovered items are added to the GW's API slowly.");
      } else if (itemSearchResults.length > 10) { //too many matches in our 'contains' search, notify and give examples.
        var itemNameFirst = itemSearchResults[0].name;
        var itemNameLast = itemSearchResults[itemSearchResults.length - 1].name;
        bot.reply(message, "Woah. I found " + itemSearchResults.length + ' items. Get more specific.\n(from ' + itemNameFirst + ' to ' + itemNameLast + ')');
      } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
        replyWithRecipieFor(itemSearchResults[0]);
      } else { //a few items, allow user to choose
        bot.startConversation(message, function(err, convo) {
          var listofItems = '';
          for (var i in itemSearchResults) {
            var levelString;
            if (itemSearchResults[i].level) {
              levelString = itemSearchResults[i].level;
            } else if (itemSearchResults[i].description) {
              var matches = itemSearchResults[i].description.match(/level (\d{1,2})/i);
              console.log("matches " + JSON.stringify(matches) + " of description " + itemSearchResults[i].description);
              if (matches && matches[1]) {
                levelString = matches[1];
              }
            }
            listofItems += '\n' + [i] + ": " + itemSearchResults[i].name + (levelString ? " (level " + levelString + ")" : "");
          }
          convo.ask('I found multiple items with that name. Which number you mean? (say no to quit)' + listofItems, [{
            //number, no, or repeat
            pattern: new RegExp(/^(\d{1,2})/i),
            callback: function(response, convo) {
              var matches = response.text.match(/^(\d{1,2})/i);
              var selection = matches[0];
              if (selection < itemSearchResults.length) {
                replyWithRecipieFor(itemSearchResults[selection]);
              } else convo.repeat();
              convo.next();
            }
          }, {
            pattern: bot.utterances.no,
            callback: function(response, convo) {
              convo.say('\'Kay.');
              convo.next();
            }
          }, {
            default: true,
            callback: function(response, convo) {
              // just repeat the question
              convo.repeat();
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
    bot.reply(message, 'You asked for it.');
    gw2nodelib.data.recipes = [];
    gw2nodelib.data.items = [];
    globalMessage = message;
    dataLoaded = false;
    var start = new Date().getTime();
    gw2nodelib.load("recipes", {}, true);
  });


  /////QUAGGANS
  controller.hears(['^quaggans$', '^quaggan$'], 'direct_message,direct_mention,mention', function(bot, message) {
    gw2nodelib.quaggans(function(jsonList) {
      if (jsonList.text || jsonList.error) {
        bot.reply(message, "Oops. I got this error when asking about quaggans: " + (jsonList.text ? jsonList.text : jsonList.error));
      } else {
        bot.reply(message, "I found " + Object.keys(jsonList).length + ' quaggans.');
        bot.reply(message, "Tell lessdremoth quaggan <quaggan name> to preview!");
        bot.reply(message, listToString(jsonList));
      }
    });
  });

  controller.hears(['quaggan (.*)', 'quaggans (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/quaggans? (.*)/i);
    if (!matches || !matches[1]) bot.reply(message, "Which quaggan? Tell lessdremoth \'quaggans\' for a list.");
    var name = matches[1];
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
  controller.hears(['access token'], 'direct_mention,mention', function(bot, message) {
    bot.reply(message, "Direct message me the phrase \'access token help\' for help.");
  });

  controller.hears(['access token help'], 'direct_message', function(bot, message) {
    bot.reply(message, "First you'll need to log in to arena net to create a token. Do so here:");
    bot.reply(message, "https://account.arena.net/applications");
    bot.reply(message, "Copy the token, and then direct message me (here) with \'access token <your token>\'");
    controller.storage.users.get(message.user, function(err, user) {
      if (user) {
        bot.reply(message, "Although I already have an access token on file for you.");
      }
    });
  });

  controller.hears(['access token (.*)'], 'direct_message', function(bot, message) {
    var matches = message.text.match(/access token (.*)/i);
    if (!matches[1]) bot.reply(message, "I didn't get that.");
    var token = matches[1];
    controller.storage.users.get(message.user, function(err, user) {
      if (user) {
        bot.reply(message, "I overwrote your existing token.");
      } else {
        user = {
          id: message.user,
        };
      }
      user.access_token = token;
      controller.storage.users.save(user, function(err, id) {
        bot.reply(message, 'Got it.');
      });
    });
  });

  /////CHARACTERS
  controller.hears(['characters'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
      if (!user || !user.access_token) {
        bot.reply(message, "Sorry, I don't have your access token on file. direct message me the phrase \'access token help\' for help.");
      } else gw2nodelib.characters(function(jsonList) {
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
                if (debug) console.log("char :" + jsonList[n]);
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
                if (err || debug) console.log(err, resp);
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

  /////PREFIX
  controller.hears(['prefix (.*)', 'suffix (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/(prefix|suffix) ([a-zA-Z]*)\s?([a-zA-Z]*)?/i);
    var name = matches[2];
    var type = matches[3];
    type = scrubType(type);
    var prefixes = prefixSearch(name, type);
    if (!prefixes || (Object.keys(prefixes).length) < 1)
      bot.reply(message, 'No match for \'' + name + '\' of type \'' + type + '\'. Misspell? Or maybe search all.');
    else {
      bot.reply(message, printPrefixes(prefixes));
    }
  });

  /////TOGGLE
  controller.hears(['^toggle'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (toggle) toggle = false;
    else toggle = true;
    bot.reply(message, "So toggled.");
  });

  //////SASS


  /////GENERIC BOT INFO
  // controller.hears(['call me (.*)'], 'direct_message,direct_mention,mention', function (bot, message) {
  //     var matches = message.text.match(/call me (.*)/i);
  //     var name = matches[1];
  //     controller.storage.users.get(message.user, function (err, user) {
  //         if (!user) {
  //             user = {
  //                 id: message.user,
  //             };
  //         }
  //         user.name = name;
  //         controller.storage.users.save(user, function (err, id) {
  //             bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
  //         });
  //     });
  // });

  // controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function (bot, message) {

  //     controller.storage.users.get(message.user, function (err, user) {
  //         if (user && user.name) {
  //             bot.reply(message, 'Your name is ' + user.name);
  //         } else {
  //             bot.reply(message, 'I don\'t know yet!');
  //         }
  //     });
  // });

  controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (message.user && message.user == 'U0T3J3J9W') {
      bot.reply(message, 'Farrrrt Pizza');
      addReaction(message, 'dash');
      addReaction(message, 'pizza');
    } else {
      bot.reply(message, 'Hello.');
      addReaction(message, 'robot_face');
    }


    // controller.storage.users.get(message.user, function (err, user) {
    //     if (user && user.name) {
    //         bot.reply(message, 'Hello ' + user.name + '!!');
    //     } else {
    //         bot.reply(message, 'Hello.');
    //     }
    // });
  });

  controller.on('channel_left', function(bot, message) {

    console.log("I've left a channel.");
  });
  controller.on('rtm_reconnect_failed', function(bot, message) {

    console.log("reconnect failed.");
  });

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


  controller.hears(['uptime', 'who are you'], 'direct_message,direct_mention,mention', function(bot, message) {

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message, ':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');

  });


  // controller.on('channel_joined',function(bot,message) {
  //   bot.reply(message, 'Lessdremoth lives.');
  //   // message contains data sent by slack
  //   // in this case:
  //   // https://api.slack.com/events/channel_joined

  // });

  /////Easter Eggs
  controller.hears(['my love for you is like a truck', 'my love for you is like a rock', 'my love for you is ticking clock'], 'direct_message,ambient', function(bot, message) {
    var name = 'berserker';
    var prefixes = prefixSearch(name);
    if (prefixes)
      for (var key in prefixes) {
        bot.reply(message, key + ": " + listToString(prefixes[key]));
      }
  });

  prefixData.nuprin = {
    "type": "standard",
    "stats": ["little", "yellow", "different"]
  };
}
///Helper functions
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

function loadStaticDataFromFile(fileName) {
  return JSON.parse(fs.readFileSync(fileName, {
    encoding: 'utf8'
  }));
}

function saveStaticDataToFile(fileName, obj) {
  fs.writeFile(fileName, JSON.stringify(obj));
}

function findInData(key, value, apiKey) {
  for (var i in gw2nodelib.data[apiKey]) {
    if (gw2nodelib.data[apiKey][i][key] == value) {
      return gw2nodelib.data[apiKey][i];
    }
  }
}

function addReaction(message, emoji) {
  bot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: emoji,
  }, function(err, res) {
    if (err) {
      bot.botkit.log('Failed to add emoji reaction :(', err);
    }
  });
}

function listKeys(jsonArray) {
  if (debug) console.log("jsonArray: " + JSON.stringify(jsonArray));
  var outstring = "";
  for (var key in jsonArray) {
    outstring += key + ", ";
  }
  return outstring.substring(0, outstring.length - 2);
}

function listToString(jsonList, skipSpace) {
  //  if (debug) console.log("jsonList: " + JSON.stringify(jsonList));
  var outstring = "",
    len = Object.keys(jsonList).length;
  for (var i = 0; i < len; i++) {
    outstring += jsonList[i];
    if (i !== len - 1) outstring += ",";
    if (!skipSpace) outstring += " ";
  }
  return outstring;
}

//////Prefix search helper functions
function printPrefixes(prefixes) {
  var outMessage = "";
  for (var key in prefixes) {
    outMessage += key + ": " + listToString(prefixes[key].stats) + "\n";
  }
  return outMessage;
}

function scrubType(type) {
  if (!type || type.length === 0) return 'standard';
  else if ('gem'.startsWith(type)) return 'gem';
  else if ('all'.startsWith(type)) return 'all';
  else if ('ascended'.startsWith(type)) return 'ascended';
  else return 'standard';
}

function prefixSearch(searchTerm, type) {
  var prefixList = {};
  type = scrubType(type);
  if (debug) console.log("searching " + searchTerm + " of type " + type);
  findPrefixByName(searchTerm, type, prefixList);
  findPrefixesByStat(searchTerm, type, prefixList);
  return prefixList;
}

function findPrefixByName(name, type, prefixList) {
  for (var key in prefixData) {
    //skip keywords
    if (prefixData.hasOwnProperty(key) && key.indexOf(name) > -1 && (type == 'all' || prefixData[key].type == type)) {
      if (debug) console.log("added key from name " + key);
      prefixList[key] = prefixData[key];
    }
  }
  if (debug) console.log("Total after ByName search " + Object.keys(prefixList).length);
}

function findPrefixesByStat(stat, type, prefixList) {
  for (var key in prefixData) {
    //skip keywords
    if (prefixData.hasOwnProperty(key)) {
      if (type == 'all' || prefixData[key].type == type) {
        for (var subKey in prefixData[key].stats) {
          if (debug) console.log("subkey " + prefixData[key].stats[subKey]);
          if (prefixData[key].stats[subKey].indexOf(stat) > -1) {
            if (debug) console.log("added key from stat " + key);
            prefixList[key] = prefixData[key];
            break;
          }
        }
      }
    }
  }
  if (debug) console.log("Total after ByStat search " + Object.keys(prefixList).length);

}

////////////////Recipe Lookup related functions
function loadMakeableItems(itemsToFetch, startIndex, offset, bypass) {
  //this is the same goddamn code as data load.

  console.log("fetching " + Math.ceil(startIndex / offset) + " of " + total);
  if (retry > 3) {
    console.log("too many retries");
    return;
  }
  if (startIndex < len) {
    var subList = itemsToFetch.slice(startIndex, startIndex + offset);
    gw2nodelib.items(function(jsonList) {
      if (jsonList.text || jsonList.error) {
        console.log("retrying after error:" + (jsonList.text ? jsonList.text : jsonList.error));
        retry++;
        loadMakeableItems(itemsToFetch, startIndex, offset, bypass);
      } else {
        for (var item in jsonList) {
          gw2nodelib.data.items = gw2nodelib.data.items.concat(gw2nodelib.daoLoad('items', jsonList[item]));
          if (debug && startIndex === 0 && item == '0') console.log("sample dao:\n" + JSON.stringify(jsonList[item]) + "\nbecomes\n" + JSON.stringify(gw2nodelib.daoLoad('items', jsonList[item])));
        }
        //        gw2nodelib.data.items = gw2nodelib.data.items.concat(jsonList); //append fetch results to data.items
        retry = 0;
        startIndex += offset;
        loadMakeableItems(itemsToFetch, startIndex, offset, bypass);
      }
    }, {
      ids: listToString(subList, true)
    }, bypass);
  } else {
    if (globalMessage) {
      bot.reply(globalMessage, "Ingredient list from recipies loaded. I know about " + Object.keys(gw2nodelib.data.items).length + " ingredients.");
    }
    console.log("Item list from recipies loaded. Data has " + Object.keys(gw2nodelib.data.items).length + " items");
    dataLoaded = true;
    globalMessage = null;
  }
}

function assembleRecipeAttachment(itemToDisplay) {
  var foundRecipe = findInData('output_item_id', itemToDisplay.id, 'recipes');
  if (!foundRecipe) return [];
  var initalIngred = foundRecipe.ingredients;
  var ingredients = getBaseIngredients(initalIngred);
  var gwPasteString = '';
  var gwLength = 0;
  var attachments = [];
  var item;
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
      thumb_url: foundRecipe.icon,
      fields: [],
      "fallback": itemToDisplay.name + " has " + ingredients.length + " items.",
      // "title": itemToDisplay.name + " (level " + itemToDisplay.level + ")",
      // "author_name": itemToDisplay.name + " on the wiki",
      // "author_link": "http://wiki.guildwars2.com/wiki/" + itemToDisplay.name.replace(/\s/g, "_"),
      // "author_icon": "https://render.guildwars2.com/file/25B230711176AB5728E86F5FC5F0BFAE48B32F6E/97461.png",
    };
    for (var i in ingredients) {
      item = findInData('id', ingredients[i].item_id, 'items');
      if (item) {
        gwLength += (" " + ingredients[i].count + "x[" + item.name + "]").length;
        gwPasteStringMaxInt(" " + ingredients[i].count + "x" + item.chat_link);
        attachment.fields.push({
          title: ingredients[i].count + " " + item.name,
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

function removePunctuationAndToLower(string) {
  var punctuationless = string.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()']/g, "");
  //                                     .,\/#!$%\^&\*;:'()+-<=>?@[]_`{|}~""
  var finalString = punctuationless.replace(/\s{2,}/g, " ");
  return finalString.toLowerCase();
}

function findCraftableItemByName(searchName) {
  var itemsFound = [];
  var cleanSearch = removePunctuationAndToLower(searchName);
  for (var i in gw2nodelib.data.items) {
    cleanItemName = removePunctuationAndToLower(gw2nodelib.data.items[i].name);
    if (cleanItemName.includes(cleanSearch))
      if (findInData('output_item_id', gw2nodelib.data.items[i].id, 'recipes'))
        itemsFound.push(gw2nodelib.data.items[i]);
      else if (debug) console.log('Found an item called ' + gw2nodelib.data.items[i].name + ' but it is not craftable');
  }
  return itemsFound;
}

function getBaseIngredients(ingredients) {

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
      if (debug) console.log(findInData('id', ingredients[i].item_id, 'items').name + " is a base ingredient "); //Ex1: 1 vial of blood
      addIngredient(baseIngredients, ingredients[i]);
    } else { //Ex1: an axe blade
      if (debug) console.log("need " + ingredients[i].count + " of " + findInData('id', ingredients[i].item_id, 'items').name + '(' + makeableIngredient.output_item_count + ')');
      //Add parts of this sub-recipie to the ingredients list
      var ingredientsNeeded = ingredients[i].count; //How many of this sub recipie to make
      var listItem;
      if (debug) listItem = findInData('id', ingredients[i].item_id, 'items').name;
      //Check if we have any in extra ingredients
      if (debug) console.log('see if we already have any of the ' + ingredientsNeeded + ' ' + listItem + '(s) we need');
      for (var x in extraIngredients) {
        if (debug) console.log("we have " + extraIngredients[x].count + " " + findInData('id', extraIngredients[x].item_id, 'items').name);
        if (extraIngredients[x].item_id == makeableIngredient.output_item_id) { //we've already made some
          if (ingredientsNeeded >= extraIngredients[x].count) { //we don't have enough, add what we have to the 'made' pile
            ingredientsNeeded -= extraIngredients[x].count;
            extraIngredients.splice(x, 1); //remove the 'used' extra ingredients
            if (debug) console.log("that was it for extra " + listItem);
          } else {
            extraIngredients[x].count -= ingredientsNeeded; //we have more than enough, subtract what we used.
            ingredientsNeeded = 0; // we need make no more
            if (debug) console.log("had enough spare " + listItem);
          }
        }
      }
      if (ingredientsNeeded > 0) { //Do we still need to make some after our extra ingredients pass?
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) console.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
        //Calculate number of times to make the recipie to reach ingredientsNeeded
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
    console.log("extra pile is:");
    for (var j in extraIngredients) {
      var item2 = findInData('id', extraIngredients[j].item_id, 'items');
      if (item2)
        console.log(extraIngredients[j].count + " " + item2.name);
      else
        console.log('Unknown Item of id: ' + extraIngredients[j].item_id + '(' + extraIngredients[j].count + ')');
    }
  }
  return baseIngredients; //return our list of non-makeable ingredients
}
if (debug) { //play area


  // var postpost = function() {
  //   var itemSearchList = findCraftableItemByName('clerics nob');
  //   console.log('Found ' + itemSearchList.length);
  //   for (var n in itemSearchList)
  //     console.log(itemSearchList[n].name);
  //   if (itemSearchList.length === 0) {
  //     return;
  //   }
  //   var foundRecipe = findInData('output_item_id', itemSearchList[0].id, 'recipes');
  //   var initalIngred = foundRecipe.ingredients;
  //   var ingredients = getBaseIngredients(initalIngred);
  //   setTimeout(function() {

  //     console.log("\nFinal List: ");
  //     for (var i in ingredients) {
  //       //      console.log(i+": "+JSON.stringify(ingredients[i]));
  //       var item = findInData('id', ingredients[i].item_id, 'items');
  //       if (item)
  //         console.log(ingredients[i].count + " " + item.name);
  //       else
  //         console.log('Unknown Item of id: ' + ingredients[i].item_id + '(' + ingredients[i].count + ')');
  //     }
  //   }, 10000);
  // };

  // var start;
  // gw2nodelib.half = function(apiKey) {
  //   var end = new Date().getTime();
  //   var time = end - start;

  //   console.log("HALF " + apiKey + ": " + time + "ms");
  // };
  // var numDone = 0;
  // gw2nodelib.done = function(apiKey) {
  //   var end = new Date().getTime();
  //   var time = end - start;
  //   console.log("DONE " + apiKey + ": " + time + "ms");
  //   console.log("data has " + Object.keys(gw2nodelib.data.recipes).length + " recipies");
  //   //Go through recipies, and get the item id of all output items and recipie ingredients.
  //   var itemsCompile = [];
  //   for (var t in gw2nodelib.data.recipes) {
  //     itemsCompile[gw2nodelib.data.recipes[t].output_item_id] = 1;
  //     for (var i in gw2nodelib.data.recipes[t].ingredients) {
  //       itemsCompile[gw2nodelib.data.recipes[t].ingredients[i].item_id] = 1;
  //     }
  //   }
  //   console.log("we need to fetch " + Object.keys(itemsCompile).length + " recipie items");
  //   // console.log(JSON.stringify(itemsCompile));

  //   var offset = 200; //number to fetch at once
  //   var startIndex = 0;
  //   var retry = 0;
  //   var len = Object.keys(itemsCompile).length;
  //   var total = Math.ceil(len / offset);
  //   //this is the same goddamn code as data load.
  //   var loadMakeableItems = function(itemsToFetch, startIndex, offset) {
  //     console.log("fetching " + Math.ceil(startIndex / offset) + " of " + total);
  //     if (retry > 3) {
  //       console.log("too many retries");
  //       return;
  //     }
  //     if (startIndex < len) {
  //       var subList = itemsToFetch.slice(startIndex, startIndex + offset);
  //       gw2nodelib.items(function(jsonList) {
  //         if (jsonList.text || jsonList.error) {
  //           console.log("retrying after error:" + (jsonList.text ? jsonList.text : jsonList.error));
  //           retry++;
  //           loadMakeableItems(itemsToFetch, startIndex, offset);
  //         } else {
  //           gw2nodelib.data.items = gw2nodelib.data.items.concat(jsonList); //append fetch results to data.items
  //           retry = 0;
  //           startIndex += offset;
  //           loadMakeableItems(itemsToFetch, startIndex, offset);
  //         }
  //       }, {
  //         ids: listToString(subList, true)
  //       }, false);
  //     } else {
  //       console.log("done. data has " + Object.keys(gw2nodelib.data.items).length + " items");
  //       postpost();
  //     }
  //   };


  //   //this is the same goddamn code as data load.
  //   loadMakeableItems(Object.keys(itemsCompile), startIndex, offset);
  // };
  // start = new Date().getTime();
  // gw2nodelib.load("recipes", {}, false);

}