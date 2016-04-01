//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
var debug = false;

Botkit = require('botkit');
os = require('os');
gw2nodelib = require('gw2nodelib');
fileLoad = gw2nodelib.loadCacheFromFile('cache.json');

prefixData = getPrefixData();
helpFile = getHelpFile();

controller = Botkit.slackbot({
    debug: debug,
    json_file_store: 'slackbotDB',
});



if(debug) {//play area

  var name = 'emerald';
  var prefixes = prefixSearch(name);
  if(!prefixes || (Object.keys(prefixes).length) < 1) console.log('Misspell?');
  else{
    for (var key in prefixes) {
      console.log(key+": "+listToString(prefixes[key]));
    }
  }



  console.log(helpFile['prefix']);
  // console.log(listToString(helpFile));
  // console.log("file set successfully: " + fileLoad);

  // gw2nodelib.items(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' items.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{ids : "9437"});

  // gw2nodelib.items(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' items.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{ids : "1"});

  // gw2nodelib.items(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' items.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{ids : "6"});

}
else{ //"real" code
  if (!process.env.token) {
      console.log('Error: Specify token in environment');
      process.exit(1);
  }

  var bot = controller.spawn({
      token: process.env.token
  }).startRTM(function(err,bot,payload) {
    if (err) {
      throw new Error('Could not connect to Slack');
    }
  });

////HELP
  controller.hears(['help','help (.*)'],'direct_message,direct_mention,mention', function (bot, message) {
      var matches = message.text.match(/help (.*)/i);
      if(!matches) bot.reply(message, "Help topics: "+listKeys(helpFile));
      else{
        var name = matches[1].toLowerCase();
        bot.reply(message,helpFile[name]);
      }
  });
/////QUAGGANS
  controller.hears(['quaggans'],'direct_message,direct_mention,mention', function (bot, message) {
    gw2nodelib.quaggans(function(jsonList) {
       bot.reply(message,"I found "+Object.keys(jsonList).length+' quaggans.');
        bot.reply(message,"Tell lessdremoth quaggan <quaggan name> to preview!");
        bot.reply(message,listToString(jsonList));
    });
  });

  controller.hears(['quaggan (.*)'], 'direct_message,direct_mention,mention', function (bot, message) {
      var matches = message.text.match(/quaggan (.*)/i);
      var name = matches[1];
      if(debug) console.log('Quaggan of type '+name);
      gw2nodelib.quaggans(function(jsonItem) {
        bot.reply(message,jsonItem.url);
    },{id: name},true);
  });

/////ACCESS TOKEN
  controller.hears(['access token (.*)'], 'direct_mention,mention', function (bot, message) {
        bot.reply(message, "Direct message me the phrase \'access token help\' for help.");
  });

  controller.hears(['access token help'], 'direct_message', function (bot, message) {
    bot.reply(message, "First you'll need to log in to arena net to create a token. Do so here:");
    bot.reply(message, "https://account.arena.net/applications");
    bot.reply(message, "Copy the token, and then direct message me (here) with \'access token <your token>\'");
    controller.storage.users.get(message.user, function (err, user) {
      if (user) {
          bot.reply(message, "Although I already have an access token on file for you.");
      }
    });
  });

  controller.hears(['access token (.*)'], 'direct_message', function (bot, message) {
    var matches = message.text.match(/access token (.*)/i);
    var token = matches[1];
      controller.storage.users.get(message.user, function (err, user) {
        if (user) {
            bot.reply(message, "I overwrote your existing token.");
        }
        else{
          user = {
              id: message.user,
          };
        }
        user.access_token = token;
        controller.storage.users.save(user, function (err, id) {
            bot.reply(message, 'Got it.');
        });
    });
  });


/////CHARACTERS
  controller.hears(['characters'], 'direct_message,direct_mention,mention', function (bot, message) {
    controller.storage.users.get(message.user, function (err, user) {
      if (!user) {
          bot.reply(message, "Sorry, I don't have your access token on file. direct message me the phrase \'access token help\' for help.");
      }
      else gw2nodelib.characters(function(jsonList) {
        bot.reply(message,"I found "+Object.keys(jsonList).length+' characters.');
        bot.reply(message,listToString(jsonList));
      },{access_token : user.access_token});
    });
  });
/////NOMENCLATURE
  controller.hears(['prefix (.*)','suffix (.*)'], 'direct_message,direct_mention,mention', function (bot, message) {
    var matches = message.text.match(/(prefix|suffix) (.*)/i);
    var name = matches[2].toLowerCase();
    var prefixes = prefixSearch(name);
    if(!prefixes || (Object.keys(prefixes).length) < 1) bot.reply(message,'No match for \''+name+'\'. Misspell?');
      else{
        var outMessage = "";
        for (var key in prefixes) {
          outMessage += key+": "+listToString(prefixes[key])+"\n"
        }
        bot.reply(message,outMessage);
    }
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

/////GENERIC BOT INFO
  controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function (bot, message) {
          if (message.user && message.user=='U0T3J3J9W') {
              bot.reply(message, 'Farrrrt Pizza');
               addReaction(message,'dash');
               addReaction(message,'pizza');
          } else {
              bot.reply(message, 'Hello.');
              addReaction(message,'robot_face');
          }


      // controller.storage.users.get(message.user, function (err, user) {
      //     if (user && user.name) {
      //         bot.reply(message, 'Hello ' + user.name + '!!');
      //     } else {
      //         bot.reply(message, 'Hello.');
      //     }
      // });
  });

  controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function (bot, message) {

      bot.startConversation(message, function (err, convo) {

          convo.ask('Are you sure you want me to shutdown?', [
              {
                  pattern: bot.utterances.yes,
                  callback: function (response, convo) {
                      convo.say('Bye!');
                      convo.next();
                      setTimeout(function () {
                          process.exit();
                      }, 3000);
                  }
              },
          {
              pattern: bot.utterances.no,
              default: true,
              callback: function (response, convo) {
                  convo.say('*Phew!*');
                  convo.next();
              }
          }
          ]);
      });
  });


  controller.hears(['uptime', 'who are you'], 'direct_message,direct_mention,mention', function (bot, message) {

      var hostname = os.hostname();
      var uptime = formatUptime(process.uptime());

      bot.reply(message, ':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');

  });
}
/////Easter Eggs
  controller.hears(['my love for you is like a truck','my love for you is like a rock','my love for you is ticking clock'], 'direct_message,ambient', function (bot, message) {
    var name = 'berserker';
    var prefixes = prefixSearch(name);
    if(prefixes)
      for (var key in prefixes) {
        bot.reply(message,key+": "+listToString(prefixes[key]));
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

function attachment(bot,message) {

  var attachments = [];
  var attachment = {
    title: 'This is an attachment',
    color: '#FFCC99',
    fields: [],
  };

  attachment.fields.push({
    label: 'Field',
    value: 'A longish value',
    short: false,
  });

  attachment.fields.push({
    label: 'Field',
    value: 'Value',
    short: true,
  });

  attachment.fields.push({
    label: 'Field',
    value: 'Value',
    short: true,
  });

  attachments.push(attachment);

  bot.reply(message,{
    text: 'See below...',
    attachments: attachments,
  },function(err,resp) {
    console.log(err,resp);
  });
}

function debugit(jsonObj){
  console.log('DEBUG JSON Object: '+JSON.stringify(jsonObj));
}

function addReaction(message,emoji){ 
    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: emoji,
    }, function (err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    }); 
}

function listKeys(jsonArray){
  if(debug) console.log("jsonArray: "+JSON.stringify(jsonArray));
  var outstring = "";
  for (var key in jsonArray) {
    outstring += key + ", ";
  }  
  return outstring.substring(0,outstring.length-2);
}

function listToString(jsonList){
      if(debug) console.log("jsonList: "+JSON.stringify(jsonList));
      var outstring = "",
      len = Object.keys(jsonList).length;
      for (var i = 0; i< len; i++) {
        outstring += jsonList[i];
        if(i!==len-1) outstring += ", "
      }
    return outstring;
}

//deprecated. Just store directly for now
function loadNomenclature() {  
  controller.storage.teams.get('prefixes', function (err, prefixes) {
      if(err){ 
        console.log('Error loading prefix data: '+err);
         prefixData = {
          'text' : "there was an error loading Prefix data: "+err ,
          'id' : 'prefixes', 
          'formatsample': ['Power','Precision','Ferocity']
        };
      }
      else{
        console.log("Prefix data loaded successfully");
        prefixData = prefixes;
      }
    }); 
}


function prefixSearch(searchTerm){
  var prefixList = {};
  findPrefixByName(searchTerm, prefixList);
  findPrefixesByStat(searchTerm, prefixList);
  return prefixList;
}

function findPrefixByName (name, prefixList){
  for (var key in prefixData) {
    //skip keywords
    if(prefixData.hasOwnProperty(key) && key.indexOf(name) > -1) {
      if(debug) console.log("added key "+key);
      prefixList[key] = prefixData[key];
    }
  }
}

function findPrefixesByStat (stat, prefixList){
  for (var key in prefixData) {
    //skip keywords
    if(prefixData.hasOwnProperty(key)) {
      for (var subKey in prefixData[key]) {
        if(prefixData[key][subKey].indexOf(stat) > -1)
        {
          if(debug) console.log("added key "+key);
          prefixList[key] = prefixData[key];
        }
      }
    }
  }
}

function getHelpFile(){
  return {
  "hello" : "lessdremoth will say hi back.",
  "hi" : "lessdremoth will say hi back.",
  "shutdown" : "command lessdremoth to shut down",
  "uptime" : "lessdremoth will display some basic uptime information.",
  "who\ are\ you" : "lessdremoth will display some basic uptime information.",
  "quaggans" : "fetch a list of all fetchable quaggan pictures. See help quaggan.",
  "quaggan" : "Takes an argument. Paste a url to a picture of that quaggan for slack to fetch. See help quaggans. Example: \'quaggan box\'",
  "access\ token" : "Set up your guild wars account to allow lessdremoth to read data. Direct Message access token help for more information.",
  "characters" : "Display a list of characters on your account.",
  "prefix" : "Takes an argument. Returns a list of all item prefixes and their stats that contain that string. Note that \'s (as in Zojja\'s) and \'of the\' strings have been removed. \'Healing power\' is called \'healing\' to avoid overlap with \'power\'. Examples: \'prefix berzerker\' \'prefix pow\'",
  "suffix" : "Alias for prefix. Takes an argument. Returns a list of all item prefixes and their stats that contain that string. Examples: \'prefix berzerker\' \'prefix pow\'",
  };
}

function getPrefixData(){
  return {
berserker : ["power","precision","ferocity"],
ruby : ["power","precision","ferocity"],
zojja : ["power","precision ","ferocity"],
zealot : ["power","precision ","healing"],
watchwork : ["power","precision","healing"],
keeper : ["power","precision ","healing"],
soldier : ["power","toughness","vitality"],
ahamid : ["power","toughness","vitality"],
chorben : ["power","toughness","vitality"],
forsaken : ["power","toughness","healing"],
valkyrie : ["power","vitality","ferocity"],
beryl : ["power","vitality","ferocity"],
gobrech : ["power","vitality","ferocity"],
stonecleaver : ["power","vitality","ferocity"],
captain : ["precision ","power","toughness"],
"emerald(gemstone or jewel)" : ["toughness","power","precision"],
"emerald(crafted trinket)" : ["precision ","power","toughness"],
rampager : ["precision ","power","condition damage"],
coral : ["precision ","power","condition damage"],
forgemaster : ["precision ","power","condition damage"],
coalforge : ["precision ","power","condition damage"],
assassin : ["precision ","power","ferocity"],
opal : ["precision ","power","ferocity"],
saphir : ["precision ","power","ferocity"],
soros : ["precision ","power","ferocity"],
knight : ["toughness","power","precision "],
beigarth : ["toughness","power","precision "],
cavalier : ["toughness","power","ferocity"],
angchu : ["toughness","power","ferocity"],
nomad : ["toughness","vitality","healing"],
ambrite : ["toughness","vitality","healing"],
ventari : ["toughness","vitality","healing"],
"giver(armor)" : ["toughness","boon duration","healing"],
winter : ["toughness","boon duration","healing"],
snowflake : ["toughness","boon duration","healing"],
settler : ["toughness","condition damage","healing"],
leftpaw : ["toughness","condition damage","healing"],
sentinel : ["vitality","power","toughness"],
azurite : ["vitality","power","toughness"],
"wei qi" : ["vitality","power","toughness"],
tonn : ["vitality","power","toughness"],
"shaman(universal upgrades)" : ["vitality","power","healing"],
shaman : ["vitality","condition damage","healing"],
zintl : ["vitality","condition damage","healing"],
sinister : ["condition damage","power","precision "],
"charged ambrite" : ["condition damage","power","precision "],
verata : ["condition damage","power","precision "],
carrion : ["condition damage","power","vitality"],
chrysocola : ["condition damage","power","vitality"],
occam : ["condition damage","power","vitality"],
rabid : ["condition damage","precision ","toughness"],
ferratus : ["condition damage","precision ","toughness"],
grizzlemouth : ["condition damage","precision ","toughness"],
sunless : ["condition damage","precision ","toughness"],
dire : ["condition damage","toughness","vitality"],
morbach : ["condition damage","toughness","vitality"],
mathilde : ["condition damage","toughness","vitality"],
apostate : ["condition damage","toughness","healing"],
"giver(weapon)" : ["condition duration","precision ","vitality"],
cleric : ["healing","power","toughness"],
sapphire : ["healing","power","toughness"],
tateos : ["healing","power","toughness"],
theodosus : ["healing","power","toughness"],
magi : ["healing","precision ","vitality"],
hronk : ["healing","precision ","vitality"],
apothecary : ["healing","toughness","condition damage"],
"passiflora(passion flower)" : ["healing","toughness","condition damage"],
veldrunner : ["healing","toughness","condition damage"],
ebonmane : ["healing","toughness","condition damage"],
commander : ["power","precision ","toughness","concentration"],
"maguuma burl" : ["power","precision ","toughness","concentration"],
tizlak : ["power","precision ","toughness","concentration"],
marauder : ["power","precision ","vitality","ferocity"],
"ebony orb" : ["power","precision ","vitality","ferocity"],
svaard : ["power","precision ","vitality","ferocity"],
vigilant : ["power","toughness","concentration","expertise"],
"flax blossom" : ["power","toughness","concentration","expertise"],
laranthir : ["power","toughness","concentration","expertise"],
crusader : ["power","toughness","ferocity","healing"],
"agate orb" : ["power","toughness","ferocity","healing"],
ossa : ["power","toughness","ferocity","healing"],
wanderer : ["power","vitality","toughness","concentration"],
"moonstone orb" : ["power","vitality","toughness","concentration"],
ruka : ["power","vitality","toughness","concentration"],
viper : ["power","condition damage","precision ","expertise"],
"black diamond" : ["power","condition damage","precision ","expertise"],
yassith : ["power","condition damage","precision ","expertise"],
trailblazer : ["toughness","condition damage","vitality","expertise"],
"maguuma lily" : ["toughness","condition damage","vitality","expertise"],
pahua : ["toughness","condition damage","vitality","expertise"],
minstrel : ["toughness","healing","vitality","concentration"],
"freshwater pearl" : ["toughness","healing","vitality","concentration"],
maklain : ["toughness","healing","vitality","concentration"],
celestial : ["power","precision ","toughness","vitality","condition damage","healing","ferocity"],
sky : ["power","precision ","toughness","vitality","condition damage","healing","ferocity"],
"charged quartz" : ["power","precision ","toughness","vitality","condition damage","healing","ferocity"],
wupwup : ["power","precision ","toughness","vitality","condition damage","healing","ferocity"],
  };

}