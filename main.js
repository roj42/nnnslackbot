//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
var debug = false;
var dataLoaded = false;
var toggle = true;
Botkit = require('botkit');
os = require('os');
gw2nodelib = require('gw2nodelib');
fileLoad = gw2nodelib.loadCacheFromFile('cache.json');

prefixData = getPrefixData();
helpFile = getHelpFile();
recipeById = [];
recipeByMade = [];
itemsById = [];

controller = Botkit.slackbot({
  debug: debug,
  json_file_store: 'slackbotDB',
});

if (debug) { //play area

  var postLoad = function() {

    console.log("data has " + Object.keys(gw2nodelib.data.recipes).length + " recipies");
    console.log("data has " + Object.keys(gw2nodelib.data.items).length + " items");

    // var itemId = 14949; //mighty bronze axe
    // // var itemId = 49478; // light of dwyna
    // var foundRecipe = findInData('output_item_id', itemId, 'recipes');
    // var foundItem = findInData('id', foundRecipe.output_item_id, 'items');
    // console.log('\n' + foundItem.name); // + ' recipe:' + JSON.stringify(foundRecipe));
    // // console.log('\nItem: ' + JSON.stringify(foundItem));
    // var initalIngred = foundRecipe.ingredients;
    // console.log(JSON.stringify(initalIngred));
    var itemSearchList = findCraftableItemByName('Accursed Chains');
    console.log('Found ' + itemSearchList.length);
    for (var n in itemSearchList)
      console.log(itemSearchList[n].name);
    if (itemSearchList.length === 0) {
      return;
    }
    var foundRecipe = findInData('output_item_id', itemSearchList[0].id, 'recipes');
    var initalIngred = foundRecipe.ingredients;
    var ingredients = getBaseIngredients(initalIngred);
    console.log("\nFinal List: ");
    for (var i in ingredients) {
      //      console.log(i+": "+JSON.stringify(ingredients[i]));
      var item = findInData('id', ingredients[i].item_id, 'items');
      if (item)
        console.log(ingredients[i].count + " " + item.name);
      else
        console.log('Unknown Item of id: ' + ingredients[i].item_id + '(' + ingredients[i].count + ')');
    }


  };

  var start;
  gw2nodelib.half = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;

    console.log("HALF " + apiKey + ": " + time);
  };
  var numDone = 0;
  gw2nodelib.done = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;
    console.log("DONE " + apiKey + ": " + time);
    if (++numDone == 2) postLoad();
  };
  start = new Date().getTime();
  gw2nodelib.load("recipes", false);
  gw2nodelib.load("items", false);

  //////////////////////////////////////////////////////
} else { //"real" code
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
  var numDone = 0;
  var start = new Date().getTime();
  gw2nodelib.half = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;
    console.log("HALF " + apiKey + ": " + time);
  };

  gw2nodelib.done = function(apiKey) {
    var end = new Date().getTime();
    var time = end - start;
    console.log("DONE " + apiKey + ": " + time);
    if (++numDone == 2) {
      dataLoaded = true;
    }
  };

  gw2nodelib.load("recipes", false);
  gw2nodelib.load("items", false);

  ////HELP
  controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/help ([a-zA-Z ]*)/i);
    if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + listKeys(helpFile));
    else {
      var name = matches[1].toLowerCase();
      bot.reply(message, helpFile[name]);
    }
  });

  ////recipe lookup
  controller.hears(['^craft (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/craft (.*)/i);
    if (!dataLoaded) {
      bot.reply(message, "I'm still loading data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    } else if (!matches || !matches[0]) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help craft\'?");
    } else {
      var searchTerm = matches[1];
      var itemSearchResults = findCraftableItemByName(searchTerm);
      if (debug) console.log(itemSearchResults.length + " matches found");
      if (itemSearchResults.length === 0) {
        bot.reply(message, "No item names contain that exact text. Note that I have no mystic forge recipies.");
      } else if (itemSearchResults.length > 10) {
        bot.reply(message, "Woah. I found " + itemSearchResults.length + ' items. Get more specific.');
      } else if (itemSearchResults.length == 1) {
        var attachments = assembleRecipeAttachment(itemSearchResults[0]);
        bot.reply(message, {
          'text': itemSearchResults[0].name,
          attachments: attachments,
          'icon_url': itemSearchResults[0].icon,
          "username": "RecipeBot",
        }, function(err, resp) {
          if (err || debug) console.log(err, resp);
        });
      } else { //a few items, allow user to choose
        bot.startConversation(message, function(err, convo) {
          var listofItems = '';
          for (var i in itemSearchResults) {
            listofItems += '\n' + [i] + ": " + itemSearchResults[i].name + (itemSearchResults[i].level ? " (level " + itemSearchResults[i].level + ")" : "");
          }
          convo.ask('I found multiple items with that name. Which number you mean? (say no to quit)' + listofItems, [{
            //number, no, or repeat
            pattern: new RegExp(/^(\d{1,2})/i),
            callback: function(response, convo) {
              var matches = response.text.match(/^(\d{1,2})/i);
              var selection = matches[0];
              if (selection < itemSearchResults.length) {
                var attachments = assembleRecipeAttachment(itemSearchResults[selection]);
                var message_with_attachments = {
                  'text': itemSearchResults[selection].name + (itemSearchResults[selection].level ? " (level " + itemSearchResults[selection].level + ")" : "") + " - " + itemSearchResults[selection].chat_link,
                  attachments: attachments,
                  'icon_url': itemSearchResults[selection].icon
                };
                convo.say(message_with_attachments);
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

  /////NOMENCLATURE
  controller.hears(['prefix (.*)', 'suffix (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var matches = message.text.match(/(prefix|suffix) ([a-zA-Z]*)\s?([a-zA-Z]*)?/i);
    var name = matches[2];
    var type = matches[3];
    var prefixes = prefixSearch(name, scrubType(type));
    if (!prefixes || (Object.keys(prefixes).length) < 1)
      bot.reply(message, 'No match for \'' + name + '\' of type \'' + type + '\'. Misspell?');
    else {
      bot.reply(message, printPrefixes(prefixes));
    }
  });
  //////DATA
  controller.hears(['db reload'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

      convo.ask('Are you sure? It can take a long time.', [{
        pattern: bot.utterances.yes,
        callback: function(response, convo) {
          dataLoaded = false;
          var innerConvo = convo;
          var start = new Date().getTime();
          var numDone = 0;
          gw2nodelib.half = function(apiKey) {
            var end = new Date().getTime();
            var time = end - start;
            console.log("HALF " + apiKey + ": " + time);
            if (message) {
              if (numDone == 1) bot.reply(message, 'Hrrrrngh.');
              bot.reply(message, 'Half done with ' + apiKey);
            }
          };

          gw2nodelib.done = function(apiKey) {
            var end = new Date().getTime();
            var time = end - start;
            console.log("DONE " + apiKey + ": " + time);
            if (++numDone == 2) {
              dataLoaded = true;
              if (innerConvo) innerConvo.next();
            }
            if (message) {
              bot.reply(message, 'Done with ' + apiKey);
              if (numDone == 1) bot.reply(message, 'One down, one to go.');
            }

          };
          start = new Date().getTime();
          gw2nodelib.load("recipes", true);
          gw2nodelib.load("items", true);
        }
      }, {
        pattern: bot.utterances.no,
        default: true,
        callback: function(response, convo) {
          convo.say('\'Kay.');
          convo.next();
        }
      }]);
    });
  });

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

  /////TOGGLE
  controller.hears(['^toggle'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (toggle) toggle = false;
    else toggle = true;
    bot.reply(message, "So toggled.");
  });


  controller.on('channel_left', function(bot, message) {

    console.log("I've left a channel.");
  });
  controller.on('rtm_reconnect_failed', function(bot, message) {

    console.log("reconnect failed.");
  });



  /////GENERIC BOT INFO
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
}

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

function debugit(jsonObj) {
  console.log('DEBUG JSON Object: ' + JSON.stringify(jsonObj));
}

function findInData(key, value, dataType) {
  for (var i in gw2nodelib.data[dataType]) {
    if (gw2nodelib.data[dataType][i][key] == value) {
      return gw2nodelib.data[dataType][i];
    }
  }
}

//Depricated. So much memory usage
// function attributeToKey(source, destination, keyName){
//     var count = 0; 
//       for(var num in source){
//         var identity = source[num][keyName];
//         if(destination[identity] && source[num][keyName]==19679) console.log("identity already existed! dest:  "+JSON.stringify(destination[identity]) + "\nsource: "+JSON.stringify(source[num]));
//         destination[identity] = source[num];
//         count++;
//       }
//       console.log("saw "+count+" items when atrribtokeying");

// }

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

function listToString(jsonList, skipComma) {
  if (debug) console.log("jsonList: " + JSON.stringify(jsonList));
  var outstring = "",
    len = Object.keys(jsonList).length;
  for (var i = 0; i < len; i++) {
    outstring += jsonList[i];
    if (i !== len - 1) outstring += ",";
    if (!skipComma) outstring += " ";
  }
  return outstring;
}

function printPrefixes(prefixes) {
  var outMessage = "";
  for (var key in prefixes) {
    outMessage += key + ": " + listToString(prefixes[key].stats) + "\n";
  }
  return outMessage;
}

//deprecated. Just store directly for now
function loadNomenclature() {
  controller.storage.teams.get('prefixes', function(err, prefixes) {
    if (err) {
      console.log('Error loading prefix data: ' + err);
      prefixData = {
        'text': "there was an error loading Prefix data: " + err,
        'id': 'prefixes',
        'formatsample': ['Power', 'Precision', 'Ferocity']
      };
    } else {
      console.log("Prefix data loaded successfully");
      prefixData = prefixes;
    }
  });
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

function getHelpFile() {
  return {
    "craft": "lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note there are no mystic forge recipes (yet). Example:craft Light of Dwyna",
    "hello": "lessdremoth will say hi back.",
    "hi": "lessdremoth will say hi back.",
    "shutdown": "command lessdremoth to shut down",
    "uptime": "lessdremoth will display some basic uptime information.",
    "who\ are\ you": "lessdremoth will display some basic uptime information.",
    "quaggans": "fetch a list of all fetchable quaggan pictures. See help quaggan.",
    "quaggan": "Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: \'quaggan box\'",
    "access": "Set up your guild wars account to allow lessdremoth to read data. Direct Message access token help for more information.",
    "characters": "Display a list of characters on your account.",
    "prefix": "Takes two arguments.\nOne: Returns a list of all item prefixes and their stats that contain that string.\nTwo: Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but \'a\' will be all.\nNotes:\n\'s-es (as in Zojja\'s) and \'of the\' strings have been removed.\n\'Healing power\' is called \'healing\'.\n\'Condition Damage\' is called \'condition\'\nExamples: \'prefix berzerker all\' \'prefix pow gem\' \'prefix pow asc\'",
    "suffix": "Alias for prefix. ",
  };
}

function getPrefixData() {
  return {
    "berserker": {
      type: "standard",
      stats: ["power", "precision", "ferocity"]
    },
    "ruby": {
      type: "gem",
      stats: ["power", "precision", "ferocity"]
    },
    "zojja": {
      type: "ascended",
      stats: ["power", "precision ", "ferocity"]
    },
    "zealot": {
      type: "standard",
      stats: ["power", "precision ", "healing"]
    },
    "watchwork": {
      type: "gem",
      stats: ["power", "precision", "healing"]
    },
    "keeper": {
      type: "ascended",
      stats: ["power", "precision ", "healing"]
    },
    "soldier": {
      type: "standard",
      stats: ["power", "toughness", "vitality"]
    },
    "ahamid": {
      type: "ascended",
      stats: ["power", "toughness", "vitality"]
    },
    "chorben": {
      type: "ascended",
      stats: ["power", "toughness", "vitality"]
    },
    "forsaken": {
      type: "standard",
      stats: ["power", "toughness", "healing"]
    },
    "valkyrie": {
      type: "standard",
      stats: ["power", "vitality", "ferocity"]
    },
    "beryl": {
      type: "gem",
      stats: ["power", "vitality", "ferocity"]
    },
    "gobrech": {
      type: "ascended",
      stats: ["power", "vitality", "ferocity"]
    },
    "stonecleaver": {
      type: "ascended",
      stats: ["power", "vitality", "ferocity"]
    },
    "captain": {
      type: "standard",
      stats: ["precision ", "power", "toughness"]
    },
    "emerald(gemstone or jewel)": {
      type: "gem",
      stats: ["toughness", "power", "precision"]
    },
    "emerald(crafted trinket)": {
      type: "gem",
      stats: ["precision ", "power", "toughness"]
    },
    "rampager": {
      type: "standard",
      stats: ["precision ", "power", "condition"]
    },
    "coral": {
      type: "gem",
      stats: ["precision ", "power", "condition"]
    },
    "forgemaster": {
      type: "ascended",
      stats: ["precision ", "power", "condition"]
    },
    "coalforge": {
      type: "ascended",
      stats: ["precision ", "power", "condition"]
    },
    "assassin": {
      type: "standard",
      stats: ["precision ", "power", "ferocity"]
    },
    "opal": {
      type: "gem",
      stats: ["precision ", "power", "ferocity"]
    },
    "saphir": {
      type: "ascended",
      stats: ["precision ", "power", "ferocity"]
    },
    "soros": {
      type: "ascended",
      stats: ["precision ", "power", "ferocity"]
    },
    "knight": {
      type: "standard",
      stats: ["toughness", "power", "precision "]
    },
    "beigarth": {
      type: "ascended",
      stats: ["toughness", "power", "precision "]
    },
    "cavalier": {
      type: "standard",
      stats: ["toughness", "power", "ferocity"]
    },
    "angchu": {
      type: "ascended",
      stats: ["toughness", "power", "ferocity"]
    },
    "nomad": {
      type: "standard",
      stats: ["toughness", "vitality", "healing"]
    },
    "ambrite": {
      type: "gem",
      stats: ["toughness", "vitality", "healing"]
    },
    "ventari": {
      type: "ascended",
      stats: ["toughness", "vitality", "healing"]
    },
    "giver(armor)": {
      type: "standard",
      stats: ["toughness", "boon duration", "healing"]
    },
    "winter": {
      type: "standard",
      stats: ["toughness", "boon duration", "healing"]
    },
    "snowflake": {
      type: "gem",
      stats: ["toughness", "boon duration", "healing"]
    },
    "settler": {
      type: "standard",
      stats: ["toughness", "condition", "healing"]
    },
    "leftpaw": {
      type: "ascended",
      stats: ["toughness", "condition", "healing"]
    },
    "sentinel": {
      type: "standard",
      stats: ["vitality", "power", "toughness"]
    },
    "azurite": {
      type: "gem",
      stats: ["vitality", "power", "toughness"]
    },
    "wei qi": {
      type: "ascended",
      stats: ["vitality", "power", "toughness"]
    },
    "tonn": {
      type: "ascended",
      stats: ["vitality", "power", "toughness"]
    },
    "shaman(universal upgrades)": {
      type: "standard",
      stats: ["vitality", "power", "healing"]
    },
    "shaman": {
      type: "standard",
      stats: ["vitality", "condition", "healing"]
    },
    "zintl": {
      type: "ascended",
      stats: ["vitality", "condition", "healing"]
    },
    "sinister": {
      type: "standard",
      stats: ["condition", "power", "precision "]
    },
    "charged ambrite": {
      type: "gem",
      stats: ["condition", "power", "precision "]
    },
    "verata": {
      type: "ascended",
      stats: ["condition", "power", "precision "]
    },
    "carrion": {
      type: "standard",
      stats: ["condition", "power", "vitality"]
    },
    "chrysocola": {
      type: "gem",
      stats: ["condition", "power", "vitality"]
    },
    "occam": {
      type: "ascended",
      stats: ["condition", "power", "vitality"]
    },
    "rabid": {
      type: "standard",
      stats: ["condition", "precision ", "toughness"]
    },
    "ferratus": {
      type: "ascended",
      stats: ["condition", "precision ", "toughness"]
    },
    "grizzlemouth": {
      type: "ascended",
      stats: ["condition", "precision ", "toughness"]
    },
    "sunless": {
      type: "ascended",
      stats: ["condition", "precision ", "toughness"]
    },
    "dire": {
      type: "standard",
      stats: ["condition", "toughness", "vitality"]
    },
    "morbach": {
      type: "ascended",
      stats: ["condition", "toughness", "vitality"]
    },
    "mathilde": {
      type: "ascended",
      stats: ["condition", "toughness", "vitality"]
    },
    "apostate": {
      type: "standard",
      stats: ["condition", "toughness", "healing"]
    },
    "giver(weapon)": {
      type: "standard",
      stats: ["condition duration", "precision ", "vitality"]
    },
    "cleric": {
      type: "standard",
      stats: ["healing", "power", "toughness"]
    },
    "sapphire": {
      type: "gem",
      stats: ["healing", "power", "toughness"]
    },
    "tateos": {
      type: "ascended",
      stats: ["healing", "power", "toughness"]
    },
    "theodosus": {
      type: "ascended",
      stats: ["healing", "power", "toughness"]
    },
    "magi": {
      type: "standard",
      stats: ["healing", "precision ", "vitality"]
    },
    "hronk": {
      type: "ascended",
      stats: ["healing", "precision ", "vitality"]
    },
    "apothecary": {
      type: "standard",
      stats: ["healing", "toughness", "condition"]
    },
    "passiflora(passion flower)": {
      type: "gem",
      stats: ["healing", "toughness", "condition"]
    },
    "veldrunner": {
      type: "ascended",
      stats: ["healing", "toughness", "condition"]
    },
    "ebonmane": {
      type: "ascended",
      stats: ["healing", "toughness", "condition"]
    },
    "commander": {
      type: "standard",
      stats: ["power", "precision ", "toughness", "concentration"]
    },
    "maguuma burl": {
      type: "gem",
      stats: ["power", "precision ", "toughness", "concentration"]
    },
    "tizlak": {
      type: "ascended",
      stats: ["power", "precision ", "toughness", "concentration"]
    },
    "marauder": {
      type: "standard",
      stats: ["power", "precision ", "vitality", "ferocity"]
    },
    "ebony orb": {
      type: "gem",
      stats: ["power", "precision ", "vitality", "ferocity"]
    },
    "svaard": {
      type: "ascended",
      stats: ["power", "precision ", "vitality", "ferocity"]
    },
    "vigilant": {
      type: "standard",
      stats: ["power", "toughness", "concentration", "expertise"]
    },
    "flax blossom": {
      type: "gem",
      stats: ["power", "toughness", "concentration", "expertise"]
    },
    "laranthir": {
      type: "ascended",
      stats: ["power", "toughness", "concentration", "expertise"]
    },
    "crusader": {
      type: "standard",
      stats: ["power", "toughness", "ferocity", "healing"]
    },
    "agate orb": {
      type: "gem",
      stats: ["power", "toughness", "ferocity", "healing"]
    },
    "ossa": {
      type: "ascended",
      stats: ["power", "toughness", "ferocity", "healing"]
    },
    "wanderer": {
      type: "standard",
      stats: ["power", "vitality", "toughness", "concentration"]
    },
    "moonstone orb": {
      type: "gem",
      stats: ["power", "vitality", "toughness", "concentration"]
    },
    "ruka": {
      type: "ascended",
      stats: ["power", "vitality", "toughness", "concentration"]
    },
    "viper": {
      type: "standard",
      stats: ["power", "condition", "precision ", "expertise"]
    },
    "black diamond": {
      type: "gem",
      stats: ["power", "condition", "precision ", "expertise"]
    },
    "yassith": {
      type: "ascended",
      stats: ["power", "condition", "precision ", "expertise"]
    },
    "trailblazer": {
      type: "standard",
      stats: ["toughness", "condition", "vitality", "expertise"]
    },
    "maguuma lily": {
      type: "gem",
      stats: ["toughness", "condition", "vitality", "expertise"]
    },
    "pahua": {
      type: "ascended",
      stats: ["toughness", "condition", "vitality", "expertise"]
    },
    "minstrel": {
      type: "standard",
      stats: ["toughness", "healing", "vitality", "concentration"]
    },
    "freshwater pearl": {
      type: "gem",
      stats: ["toughness", "healing", "vitality", "concentration"]
    },
    "maklain": {
      type: "ascended",
      stats: ["toughness", "healing", "vitality", "concentration"]
    },
    "celestial": {
      type: "standard",
      stats: ["power", "precision ", "toughness", "vitality"]
    },
    "sky": {
      type: "standard",
      stats: ["power", "precision ", "toughness", "vitality"]
    },
    "charged quartz": {
      type: "gem",
      stats: ["power", "precision ", "toughness", "vitality"]
    },
    "wupwup": {
      type: "ascended",
      stats: ["power", "precision ", "toughness", "vitality"]
    },
  };
}

function assembleRecipeAttachment(itemToDisplay) {
  var foundRecipe = findInData('output_item_id', itemToDisplay.id, 'recipes');
  if (!foundRecipe) return [];
  var initalIngred = foundRecipe.ingredients;
  var ingredients = getBaseIngredients(initalIngred);
  var gwPasteString = '';
  var attachments = [];
  var item;
  if (toggle) {

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
        gwPasteString += " " + ingredients[i].count + "x" + item.chat_link;
        attachment.fields.push({
          title: ingredients[i].count + " " + item.name,
          short: false
        });
      } else {
        gwPasteString += " " + ingredients[i].count + " of unknown item id " + ingredients[i].item_id;
        attachment.fields.push({
          title: ingredients[i].count + " of unknown item id " + ingredients[i].item_id,
          short: false
        });
      }
    }
    attachments.push(attachment);
  } else {
    for (var j in ingredients) {
      item = findInData('id', ingredients[j].item_id, 'items');
      if (item) {
        gwPasteString += " " + ingredients[j].count + "x" + item.chat_link;
        attachments.push({
          "fallback": ingredients[j].count + "x" + item.name,
          "author_name": ingredients[j].count + " " + item.name,
          "author_link": "http://wiki.guildwars2.com/wiki/" + item.name.replace(/\s/g, "_"),
          "author_icon": item.icon
        });
      } else {
        gwPasteString += " " + ingredients[j].count + " of unknown item id " + ingredients[j].item_id;
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

function findCraftableItemByName(name) {
  var itemsFound = [];
  for (var i in gw2nodelib.data.items) {
    if (gw2nodelib.data.items[i].name.toLowerCase().includes(name.toLowerCase()))
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
      //        var makeableIngredient = findInData('output_item_id', ingredients[i].item_id, 'recipes');
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
          if (ingredientsNeeded >= extraIngredients[x].count) {
            ingredientsNeeded -= extraIngredients[x].count;
            extraIngredients.splice(x, 1);
            if (debug) console.log("that was it for extra " + listItem);
          } else {
            extraIngredients[x].count -= ingredientsNeeded;
            ingredientsNeeded = 0;
            if (debug) console.log("had enough spare " + listItem);
          }
        }
      }
      if (ingredientsNeeded > 0) {
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) console.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
        //Calculate number of times to make the recipie to reach ingredientsNeeded
        //add all its parts times the number-to-make to the ingredient list for processing
        for (var n in makeableIngredient.ingredients) { //Ex1: add 10 copper and 1 tin to ingredients
          var singleComponent = {
            item_id: makeableIngredient.ingredients[n].item_id,
            count: (makeableIngredient.ingredients[n].count * numToMake)
          };
          //addIngredient(ingredients, singleComponent);
          ingredients = ingredients.concat([singleComponent]);
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
  return baseIngredients;
}