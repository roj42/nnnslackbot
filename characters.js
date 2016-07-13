//Characters replated functions for lessdremoth
//Author: Roger Lampe roger.lampe@gmail.com
var gw2api = require('./api.js');
var sf = require('./sharedFunctions.js');
var debug = false;
module.exports = function() {

  var ret = {
    addResponses: function(controller) {
      controller.hears(['^deaths$', '^characters$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
        controller.storage.users.get(message.user, function(err, user) {
          if (!user || !user.access_token || !sf.userHasPermission(user, 'characters')) {
            bot.botkit.log('ERROR: characters: no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
            bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !sf.userHasPermission(user, 'characters') ? "with correct 'characters' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
            return;
          }
          gw2api.characters(function(jsonList) {
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
                  value: jsonList[n].name + '\n' + (jsonList[n].race == 'Charr' ? 'Filthy Charr' : jsonList[n].race) + ' ' + jsonList[n].profession + ' ' + jsonList[n].level,
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

      ////PROFESSION REPORT
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
                sf.replyWith("I got an error looking up the data for " + name + ". They will be omitted from the results.", true);
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
            sf.replyWith({
              text: "Collating the professions of: " + pretextString + ".",
              attachments: attachments,
            }, false);
          }
        };

        //fetch access tokens from storage
        controller.storage.users.all(function(err, userData) {
          for (var u in userData) {
            //remove those without permissions
            if (userData[u].access_token && sf.userHasPermission(userData[u], 'characters')) {
              goodUsers.push(userData[u]);
            }
          }
          //goodUsers is now a list of users with good access tokens
          bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for profession report.");

          //If no user id argument or only invalid arguments, print list and return
          bot.reply(message, "Professions? Hang on.");
          sf.setGlobalMessage(message);
          for (var g in goodUsers) {
            gw2api.characters(professionReportCallback, {
              access_token: goodUsers[g].access_token,
              ids: 'all'
            }, true);
          }

        });
      });

    },
    addHelp: function(helpFile) {
      helpFile.professionReport = "Collate all known accounts characters by profession";
      helpFile.pr = "Alias for professionReport. " + JSON.stringify(helpFile.professionReport);
      helpFile.deaths = "Display a report of characters on your account, and their career deaths.";
      helpFile.characters = 'Alias for character deaths. ' + JSON.stringify(helpFile.characterDeaths);
    }
  };
  return ret;
}();