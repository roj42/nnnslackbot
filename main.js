//A botkit based guildwars helperbot
//Main controls data load and coordinates the node files
//Author: Roger Lampe roger.lampe@gmail.com
var version = "2.17.1"; //Retries to 20, added shop help
debug = false; //for debug messages, passed to botkit
start = 0; //holds start time for data loading
var toggle = true; //global no-real-use toggle. Used at present to compare 'craft' command output formats.

var Botkit = require('botkit');

helpFile = [];
cheevoList = {};

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
  token: process.env.token,
  retry: 20
}).startRTM(function(err, bot, payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});

//load shared code to the global scope
var sf = require('./sharedFunctions.js');
sf.setBot(bot);
sf.setController(controller);
//add craft function
var craft = require('./crafting.js');
craft.addResponses(controller);
craft.addHelp(helpFile);
//add characters
var characters = require('./characters.js');
characters.addResponses(controller);
characters.addHelp(helpFile);
//add achievements
var achievements = require('./achievements.js');
achievements.addResponses(controller);
achievements.addHelp(helpFile);
//add inventories
var inventories = require('./inventories.js');
inventories.addResponses(controller);
inventories.addHelp(helpFile);
//add dungeon frequenter
var dungeonFrequenter = require('./dungeonFrequenter.js');
dungeonFrequenter.addResponses(controller);
dungeonFrequenter.addHelp(helpFile);
//add prefix
var prefix = require('./prefix.js');
prefix.addResponses(controller);
prefix.addHelp(helpFile);
//add colors
var colors = require('./colors.js');
colors.addResponses(controller);
colors.addHelp(helpFile);

//Add standalone responses: Riker, catfacts, sass
var standalone = require('./standaloneResponses.js');
standalone.addResponses(controller);
standalone.addHelp(helpFile);


var gw2api = require('./api.js');
gw2api.setCacheTime(86400, 'quaggans');
gw2api.setCacheTime(86400, 'currencies');
gw2api.setCacheTime(86400, 'colors');
gw2api.setCacheTime(86400, 'items');
gw2api.setCacheTime(86400, 'skins');
gw2api.setCacheTime(86400, 'titles');
gw2api.setCacheTime(86400, 'minis');
gw2api.setCacheTime(86400, 'recipes');
gw2api.setCacheTime(3600, 'achievements');
gw2api.setCacheTime(3600, 'achievementsCategories');

gw2api.setCachePath('./slackbotDB/caches/');
gw2api.loadCacheFromFile('cache.json'); //note that this file name is a suffix. Creates itemscache.json, recipecache,json, and so on

reloadAllData(false);



////HELP
controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/help ([a-zA-Z ]*)/i);
  if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + Object.keys(helpFile).join(", "));
  else {
    var name = matches[1].toLowerCase();
    bot.reply(message, helpFile[name]);
  }
});

helpFile.latest = "Show latest completed TODO item";
controller.hears(['^latest$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  bot.reply(message, "shopping list outputs stuff used");
});

helpFile.todo = "Display the backlog";
controller.hears(['^todo', '^backlog'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var todoList = [
    "dyes: capture subsets of users, like dungeon frequenter",
    "Sprinkle pre-req improvments to inventories to other parts of the project. Make a generic chooser function for multi-results",
    "add sass from slack",
    "logging"
  ];
  bot.reply(message, todoList.join("\n"));
});


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
    gw2api.tokeninfo(function(tokenInfo) {
      bot.botkit.log("access token tokenInfo fetch: " + JSON.stringify(tokenInfo));
      if (tokenInfo.error || tokenInfo.text) {
        bot.reply(message, "I got an error looking up your token and did not save it. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.");
        return;
      }
      user.permissions = tokenInfo.permissions;

      gw2api.account(function(accountInfo) {
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

////QUAGGANS
helpFile.quaggans = "fetch a list of all fetchable quaggan pictures. See help quaggan.";
helpFile.quaggan = "Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: 'quaggan box'";
controller.hears(['^quaggans$', '^quaggan$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  gw2api.quaggans(function(jsonList) {
    if (jsonList.text || jsonList.error) {
      bot.reply(message, "Oops. I got this error when asking about quaggans: " + (jsonList.text ? jsonList.text : jsonList.error));
    } else {
      bot.reply(message, "I found " + Object.keys(jsonList).length + ' quaggans.');
      bot.reply(message, "Tell Lessdremoth quaggan <quaggan name> to preview!");
      bot.reply(message, jsonList.join(", "));
    }
  });
});

controller.hears(['^quaggan (.*)', '^quaggans (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/quaggans? (.*)/i);
  if (!matches || !matches[1]) bot.reply(message, "Which quaggan? Tell Lessdremoth \'quaggans\' for a list.");
  var name = sf.removePunctuationAndToLower(matches[1]);
  if (name == 'hoodieup') name = 'hoodie-up';
  if (name == 'hoodiedown') name = 'hoodie-down';
  gw2api.quaggans(function(jsonItem) {
    if (jsonItem.text || jsonItem.error) {
      bot.reply(message, "Oops. I got this error when asking about your quaggan: " + (jsonItem.text ? jsonItem.text : jsonItem.error));
    } else {
      bot.reply(message, jsonItem.url);
    }
  }, {
    id: name
  });
});

helpFile.hello = "Lessdremoth will say hi back.";
helpFile.hi = "Lessdremoth will say hi back.";
controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
  if (message.user && message.user == 'U1AGDSX3K') {
    bot.reply(message, "Hi, roj. You're the best");
    sf.addReaction(message, 'gir');
  } else {
    bot.reply(message, 'Hello.');
    sf.addReaction(message, 'robot_face');
  }
});

helpFile.shutdown = "Command Lessdremoth to shut down.";
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message, true);
});
helpFile.restart = "Command Lessdremoth to restart.";
controller.hears(['restart'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message, true);
});

function botShutdown(message, restart) {
  bot.startConversation(message, function(err, convo) {
    convo.ask('Are you sure you want me to ' + (restart ? 'restart' : 'shutdown') + '?', [{
      pattern: bot.utterances.yes,
      callback: function(response, convo) {
        convo.say('(╯°□°)╯︵ ┻━┻');
        if (restart)
          convo.say("Oh wait, you said restart...");
        if (restart) {
          convo.say("┬─┬﻿ ノ( ゜-゜ノ)\nBRB.");
        } else
          convo.say(sf.tantrum());
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

  bot.reply(message, ':frasier: I am a bot named <@' + bot.identity.name + '> (version ' + version + '). I have been running for ' + uptime + ' on ' + hostname + '.');
  var dataString = '';
  for (var type in gw2api.data)
    if (gw2api.data[type].length > 0)
      dataString += '\n' + type + ': ' + gw2api.data[type].length;
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
  achievements.flipToggle();
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
    replyMessage = "testy:" + sf.getTest();
  } else replyMessage += "...   for YOU";
  bot.reply(message, replyMessage);
});

////DATA
controller.hears(['^db reload$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'Are you sure? It can take a long time. Say \'db reload go\' to launch for real');
});

controller.hears(['^db reload go$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'You asked for it. Starting reload.');
  sf.setGlobalMessage(message);
  prefixData = sf.loadStaticDataFromFile('prefix.json');
  standalone.reloadAllData();
  reloadAllData(true);
});

function halfCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  sf.replyWith("Half done loading the list of " + apiKey + ".", true);
  bot.botkit.log("HALF " + apiKey + ": " + time + "ms");
}

function errorCallback(msg) {
  sf.replyWith("Oop. I got an error while loading data:\n" + msg + '\nTry loading again later.', false);
  bot.botkit.log("error loading: " + msg);
}

function doneRecipesCallback(apiKey) {
  //Recipes govern item load, so use a special callback
  var end = new Date().getTime();
  var time = end - start;
  sf.replyWith("Finished loading the list of recipes. I found " + Object.keys(gw2api.data[apiKey]).length + ". Starting on items.", true);
  bot.botkit.log("DONE " + apiKey + ": " + time + "ms");
  gw2api.forgeRequest(function(forgeList) {
    if (debug) bot.botkit.log("unfiltered forgeitems: " + forgeList.length);
    var filteredForgeList = forgeList.filter(removeInvalidIngredients);
    if (debug) bot.botkit.log((forgeList.length - filteredForgeList.length) + " invalid forge items");
    if (debug) bot.botkit.log("forgeitems: " + filteredForgeList.length);
    gw2api.data.forged = gw2api.data.forged.concat(filteredForgeList);
    bot.botkit.log("data has " + Object.keys(gw2api.data.recipes).length + " recipes and " + Object.keys(gw2api.data.forged).length + " forge recipes");
    //Go through recipes, and get the item id of all output items and recipe ingredients.
    var itemsCompile = compileIngredientIds();
    sf.replyWith("I need to fetch item data for " + itemsCompile.length + " ingredients.", true);
    bot.botkit.log("Fetching " + itemsCompile.length + " ingredient items");
    decrementAndCheckDone(apiKey);
    var doneIngredientsCallback = function(apiKey) {
      sf.replyWith("Ingredient list from recipes loaded. I know about " + Object.keys(gw2api.data.items).length + " ingredients for the " + Object.keys(gw2api.data.recipes).length + " recipes and " + Object.keys(gw2api.data.forged).length + " forge recipes.", true);
      var end = new Date().getTime();
      var time = end - start;
      bot.botkit.log("Item list from recipes loaded. Data has " + gw2api.data.items.length + " items: " + time + "ms");
      decrementAndCheckDone(apiKey); //apiKey will be items
    };
    gw2api.load("items", {
      ids: itemsCompile
    }, (sf.isGlobalMessageSet() ? true : false), halfCallback, doneIngredientsCallback, errorCallback);
  });
}

function doneAllOtherCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  var apiKeyString = apiKey;
  if (apiKey == 'achievementsCategories') apiKeyString = 'achievement categories';
  sf.replyWith("Finished loading the list of " + apiKeyString + ". I found " + Object.keys(gw2api.data[apiKey]).length + ".", true);
  bot.botkit.log("DONE " + apiKey + ". Things: " + Object.keys(gw2api.data[apiKey]).length + ": " + time + "ms");
  if (apiKey == 'achievementsCategories') {
    //to make this work, you need a global cheevoList
    for (var t in gw2api.data.achievementsCategories) {
      var code = sf.removePunctuationAndToLower(gw2api.data.achievementsCategories[t].name).replace(/\s+/g, '');
      if (!cheevoList[code]) {
        cheevoList[code] = {
          name: gw2api.data.achievementsCategories[t].name,
          includeDone: true,
          includeUndone: true,
          category: true
        };
      }
    }
  }
  if (apiKey == 'achievements') {
    for (var a in gw2api.data.achievements) {
      //to make this work, you need a global cheevoList
      var acode = sf.removePunctuationAndToLower(gw2api.data.achievements[a].name).replace(/\s+/g, '');
      if (!cheevoList[acode]) {
        cheevoList[acode] = {
          name: gw2api.data.achievements[a].name,
          includeDone: true,
          includeUndone: true,
          category: false
        };
      }
    }
  }
  decrementAndCheckDone(apiKey);
}

function decrementAndCheckDone(apiKey) {
  if (--numToLoad === 0) {
    sf.replyWith("All loading complete.", false);
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
  for (var t in gw2api.data.recipes) {
    itemsCompile.push(gw2api.data.recipes[t].output_item_id);
    for (var i in gw2api.data.recipes[t].ingredients) {
      itemsCompile.push(gw2api.data.recipes[t].ingredients[i].item_id);
    }
  }
  for (var f in gw2api.data.forged) {
    itemsCompile.push(gw2api.data.forged[f].output_item_id);
    for (var g in gw2api.data.forged[f].ingredients) {
      itemsCompile.push(gw2api.data.forged[f].ingredients[g].item_id);
    }
  }

  return sf.arrayUnique(itemsCompile);
}


function reloadAllData(bypass) {
  start = new Date().getTime();
  numToLoad = 6; //colors, currencies, recipies (recipies and items), achievements, achievement catagores

  gw2api.load("colors", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
  sf.replyWith("Starting to load colors.", true);

  gw2api.load("currencies", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
  sf.replyWith("Starting to load currencies.", true);

  sf.replyWith("Starting to load recipes.", true);
  gw2api.load("recipes", {}, bypass, halfCallback, doneRecipesCallback, errorCallback);

  sf.replyWith("Starting to load achievements.", true);
  gw2api.load("achievements", {}, bypass, halfCallback, doneAllOtherCallback, errorCallback);

  sf.replyWith("Starting to load achievement categories.", true);
  gw2api.load("achievementsCategories", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
}