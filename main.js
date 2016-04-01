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

  var name = 'power';
  var prefixes = prefixSearch(name, type);
  if(!prefixes || (Object.keys(prefixes).length) < 1) console.log('Misspell?');
  else{
    console.log(printPrefixes(prefixes));
  }

  var name = 'power';
  var type = 'asc';
  var prefixes = prefixSearch(name, type);
  if(!prefixes || (Object.keys(prefixes).length) < 1) console.log('Misspell?');
  else{
    console.log(printPrefixes(prefixes));
  }
  var name = 'power';
  var type = 'ascended';
  var prefixes = prefixSearch(name, type);
  if(!prefixes || (Object.keys(prefixes).length) < 1) console.log('Misspell?');
  else{
    console.log(printPrefixes(prefixes));
  }
    var name = 'power';
  var type = 'all';
  var prefixes = prefixSearch(name, type);
  if(!prefixes || (Object.keys(prefixes).length) < 1) console.log('Misspell?');
  else{
    console.log(printPrefixes(prefixes));
  }


//  console.log(helpFile['prefix']);
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
      var matches = message.text.match(/help ([a-zA-Z]*)/i);
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
    var matches = message.text.match(/(prefix|suffix) ([a-zA-Z]*)\s?([a-zA-Z]*)?/i);
    var name = matches[2];
    var type = matches[3];
    var prefixes = prefixSearch(name, type);
      if(!prefixes || (Object.keys(prefixes).length) < 1)
        bot.reply(message,'No match for \''+name+'\' of type\''+scrubType(type)+'\'. Misspell?');
      else{
        bot.reply(message,printPrefixes(prefixes));
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

function printPrefixes(prefixes){
 var outMessage = "";
  for (var key in prefixes) {
    outMessage += key+": "+listToString(prefixes[key].stats)+"\n"
  }
  return outMessage
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

function scrubType(type){
  if(!type || type.length == 0) return 'standard';
  else if('gem'.startsWith(type)) return 'gem';
  else if('all'.startsWith(type)) return 'all';
  else if('ascended'.startsWith(type)) return 'ascended';
  else return;
}

function prefixSearch(searchTerm, type){
  var prefixList = {};
  type = scrubType(type);
  if(debug) console.log("searching "+searchTerm+" of type "+type);
  findPrefixByName(searchTerm, type, prefixList);
  findPrefixesByStat(searchTerm, type, prefixList);
  return prefixList;
}

function findPrefixByName (name, type, prefixList){
  for (var key in prefixData) {
    //skip keywords
    if(prefixData.hasOwnProperty(key) && key.indexOf(name) > -1 && (type=='all' || prefixData[key].type==type)) {
      if(debug) console.log("added key from name "+key);
      prefixList[key] = prefixData[key];
    }
  }
  if(debug)console.log("Total after ByName search "+Object.keys(prefixList).length);
}

function findPrefixesByStat (stat, type, prefixList){
  for (var key in prefixData) {
    //skip keywords
    if(prefixData.hasOwnProperty(key)) {
      if(type == 'all' || prefixData[key].type==type){
        for (var subKey in prefixData[key].stats) {
          if(debug) console.log("subkey "+prefixData[key].stats[subKey]);
          if(prefixData[key].stats[subKey].indexOf(stat) > -1)
          {
            if(debug) console.log("added key from stat "+key);
            prefixList[key] = prefixData[key];
            break;
          }
        }
      }
    }
  }
  if(debug)console.log("Total after ByStat search "+Object.keys(prefixList).length);

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
  "prefix" : "Takes two arguments.\n One:Returns a list of all item prefixes and their stats that contain that string.\nTwo:filters results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but \'a\'' will be all.\nNotes:\n\'s-es (as in Zojja\'s) and \'of the\' strings have been removed.\n\'Healing power\' is called \'healing\'.\n\'Condition Damage\' is called \'condition\'\nExamples: \'prefix berzerker all\' \'prefix pow gem\' \'prefix pow asc\'",
  "suffix" : "Alias for prefix. ",
  };
}

function getPrefixData(){
  return {
"berserker" :{type:"standard",stats: ["power","precision","ferocity"]},
"ruby" :{type:"gem",stats: ["power","precision","ferocity"]},
"zojja" :{type:"ascended",stats: ["power","precision ","ferocity"]},
"zealot" :{type:"standard",stats: ["power","precision ","healing"]},
"watchwork" :{type:"gem",stats: ["power","precision","healing"]},
"keeper" :{type:"ascended",stats: ["power","precision ","healing"]},
"soldier" :{type:"standard",stats: ["power","toughness","vitality"]},
"ahamid" :{type:"ascended",stats: ["power","toughness","vitality"]},
"chorben" :{type:"ascended",stats: ["power","toughness","vitality"]},
"forsaken" :{type:"standard",stats: ["power","toughness","healing"]},
"valkyrie" :{type:"standard",stats: ["power","vitality","ferocity"]},
"beryl" :{type:"gem",stats: ["power","vitality","ferocity"]},
"gobrech" :{type:"ascended",stats: ["power","vitality","ferocity"]},
"stonecleaver" :{type:"ascended",stats: ["power","vitality","ferocity"]},
"captain" :{type:"standard",stats: ["precision ","power","toughness"]},
"emerald(gemstone or jewel)" :{type:"gem",stats: ["toughness","power","precision"]},
"emerald(crafted trinket)" :{type:"gem",stats: ["precision ","power","toughness"]},
"rampager" :{type:"standard",stats: ["precision ","power","condition"]},
"coral" :{type:"gem",stats: ["precision ","power","condition"]},
"forgemaster" :{type:"ascended",stats: ["precision ","power","condition"]},
"coalforge" :{type:"ascended",stats: ["precision ","power","condition"]},
"assassin" :{type:"standard",stats: ["precision ","power","ferocity"]},
"opal" :{type:"gem",stats: ["precision ","power","ferocity"]},
"saphir" :{type:"ascended",stats: ["precision ","power","ferocity"]},
"soros" :{type:"ascended",stats: ["precision ","power","ferocity"]},
"knight" :{type:"standard",stats: ["toughness","power","precision "]},
"beigarth" :{type:"ascended",stats: ["toughness","power","precision "]},
"cavalier" :{type:"standard",stats: ["toughness","power","ferocity"]},
"angchu" :{type:"ascended",stats: ["toughness","power","ferocity"]},
"nomad" :{type:"standard",stats: ["toughness","vitality","healing"]},
"ambrite" :{type:"gem",stats: ["toughness","vitality","healing"]},
"ventari" :{type:"ascended",stats: ["toughness","vitality","healing"]},
"giver(armor)" :{type:"standard",stats: ["toughness","boon duration","healing"]},
"winter" :{type:"standard",stats: ["toughness","boon duration","healing"]},
"snowflake" :{type:"gem",stats: ["toughness","boon duration","healing"]},
"settler" :{type:"standard",stats: ["toughness","condition","healing"]},
"leftpaw" :{type:"ascended",stats: ["toughness","condition","healing"]},
"sentinel" :{type:"standard",stats: ["vitality","power","toughness"]},
"azurite" :{type:"gem",stats: ["vitality","power","toughness"]},
"wei qi" :{type:"ascended",stats: ["vitality","power","toughness"]},
"tonn" :{type:"ascended",stats: ["vitality","power","toughness"]},
"shaman(universal upgrades)" :{type:"standard",stats: ["vitality","power","healing"]},
"shaman" :{type:"standard",stats: ["vitality","condition","healing"]},
"zintl" :{type:"ascended",stats: ["vitality","condition","healing"]},
"sinister" :{type:"standard",stats: ["condition","power","precision "]},
"charged ambrite" :{type:"gem",stats: ["condition","power","precision "]},
"verata" :{type:"ascended",stats: ["condition","power","precision "]},
"carrion" :{type:"standard",stats: ["condition","power","vitality"]},
"chrysocola" :{type:"gem",stats: ["condition","power","vitality"]},
"occam" :{type:"ascended",stats: ["condition","power","vitality"]},
"rabid" :{type:"standard",stats: ["condition","precision ","toughness"]},
"ferratus" :{type:"ascended",stats: ["condition","precision ","toughness"]},
"grizzlemouth" :{type:"ascended",stats: ["condition","precision ","toughness"]},
"sunless" :{type:"ascended",stats: ["condition","precision ","toughness"]},
"dire" :{type:"standard",stats: ["condition","toughness","vitality"]},
"morbach" :{type:"ascended",stats: ["condition","toughness","vitality"]},
"mathilde" :{type:"ascended",stats: ["condition","toughness","vitality"]},
"apostate" :{type:"standard",stats: ["condition","toughness","healing"]},
"giver(weapon)" :{type:"standard",stats: ["condition duration","precision ","vitality"]},
"cleric" :{type:"standard",stats: ["healing","power","toughness"]},
"sapphire" :{type:"gem",stats: ["healing","power","toughness"]},
"tateos" :{type:"ascended",stats: ["healing","power","toughness"]},
"theodosus" :{type:"ascended",stats: ["healing","power","toughness"]},
"magi" :{type:"standard",stats: ["healing","precision ","vitality"]},
"hronk" :{type:"ascended",stats: ["healing","precision ","vitality"]},
"apothecary" :{type:"standard",stats: ["healing","toughness","condition"]},
"passiflora(passion flower)" :{type:"gem",stats: ["healing","toughness","condition"]},
"veldrunner" :{type:"ascended",stats: ["healing","toughness","condition"]},
"ebonmane" :{type:"ascended",stats: ["healing","toughness","condition"]},
"commander" :{type:"standard",stats: ["power","precision ","toughness","concentration"]},
"maguuma burl" :{type:"gem",stats: ["power","precision ","toughness","concentration"]},
"tizlak" :{type:"ascended",stats: ["power","precision ","toughness","concentration"]},
"marauder" :{type:"standard",stats: ["power","precision ","vitality","ferocity"]},
"ebony orb" :{type:"gem",stats: ["power","precision ","vitality","ferocity"]},
"svaard" :{type:"ascended",stats: ["power","precision ","vitality","ferocity"]},
"vigilant" :{type:"standard",stats: ["power","toughness","concentration","expertise"]},
"flax blossom" :{type:"gem",stats: ["power","toughness","concentration","expertise"]},
"laranthir" :{type:"ascended",stats: ["power","toughness","concentration","expertise"]},
"crusader" :{type:"standard",stats: ["power","toughness","ferocity","healing"]},
"agate orb" :{type:"gem",stats: ["power","toughness","ferocity","healing"]},
"ossa" :{type:"ascended",stats: ["power","toughness","ferocity","healing"]},
"wanderer" :{type:"standard",stats: ["power","vitality","toughness","concentration"]},
"moonstone orb" :{type:"gem",stats: ["power","vitality","toughness","concentration"]},
"ruka" :{type:"ascended",stats: ["power","vitality","toughness","concentration"]},
"viper" :{type:"standard",stats: ["power","condition","precision ","expertise"]},
"black diamond" :{type:"gem",stats: ["power","condition","precision ","expertise"]},
"yassith" :{type:"ascended",stats: ["power","condition","precision ","expertise"]},
"trailblazer" :{type:"standard",stats: ["toughness","condition","vitality","expertise"]},
"maguuma lily" :{type:"gem",stats: ["toughness","condition","vitality","expertise"]},
"pahua" :{type:"ascended",stats: ["toughness","condition","vitality","expertise"]},
"minstrel" :{type:"standard",stats: ["toughness","healing","vitality","concentration"]},
"freshwater pearl" :{type:"gem",stats: ["toughness","healing","vitality","concentration"]},
"maklain" :{type:"ascended",stats: ["toughness","healing","vitality","concentration"]},
"celestial" :{type:"standard",stats: ["power","precision ","toughness","vitality"]},
"sky" :{type:"standard",stats: ["power","precision ","toughness","vitality"]},
"charged quartz" :{type:"gem",stats: ["power","precision ","toughness","vitality"]},
"wupwup" :{type:"ascended",stats: ["power","precision ","toughness","vitality"]},
 };
}