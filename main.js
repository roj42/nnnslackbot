/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit is has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/




var Botkit = require('botkit');
var os = require('os');
gw2nodelib = require('gw2nodelib');
var debug = true;

if(debug) console.log("file set successfully: " + gw2nodelib.loadCacheFromFile('cache.json'));

  gw2nodelib.quaggans(function(jsonArray) {
     console.log("I found "+Object.keys(jsonArray).length+' quaggans.');
      console.log(JSON.stringify(jsonArray));
    });


  // gw2nodelib.quaggans(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' quaggans.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{id : 'box'});


  // gw2nodelib.items(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' items.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{ids : "1,2"});

  // gw2nodelib.characters(function(jsonArray) {
  //    console.log("I found "+Object.keys(jsonArray).length+' characters.');
  //     console.log(JSON.stringify(jsonArray));
  //   },{access_token : "2EC0A376-57F0-3E41-8ED3-C2AAD7C05378DBC4702E-E83A-45BD-A51A-32A9DD3B3764", page : '0'});

/*
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var controller = Botkit.slackbot({
    debug: false,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM(function(err,bot,payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});



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

controller.hears(['quaggans'],'direct_message,direct_mention,mention', function (bot, message) {
  gw2nodelib.quaggans(function(jsonArray) {
     bot.reply(message,"I found "+Object.keys(jsonArray).length+' quaggans.');
      bot.reply(message,"say quaggan <quaggan name> to preview!");
      bot.reply(message,JSON.stringify(jsonArray));
  });
});

controller.hears(['quaggan (.*)'], 'direct_message,direct_mention,mention', function (bot, message) {
    var matches = message.text.match(/quaggan (.*)/i);
    var name = matches[1];
    console.log('Quaggan of type '+name);
    gw2nodelib.quaggans(function(jsonArray) {
      bot.reply(message,JSON.stringify(jsonArray.url));
  },{option: name},true);
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


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'], 'direct_message,direct_mention,mention', function (bot, message) {

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message, ':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');

});

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
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
*/