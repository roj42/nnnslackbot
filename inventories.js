var gw2api = require('./api.js');
var sf = require('./sharedFunctions.js');
module.exports = function() {
  var ret = {

    addResponses: function(controller) {

      ////wallet
      controller.hears(['^wallet(.*)', '^dungeonwallet(.*)', '^dw(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
        controller.storage.users.get(message.user, function(err, user) {
          if (err) {
            bot.reply(message, "I got an error loading your data (or you have no access token set up). Try again later");
            bot.botkit.log("Error: wallet no user data " + err);
            return;
          }
          //precheck - input scrub a bit
          var matches = sf.removePunctuationAndToLower(message.text).match(/(dw|dungeonwallet|wallet)([\s\w]*)$/i);
          if (!matches) {
            bot.reply(message, "I didn't quite get that. Maybe ask \'help wallet\'?");
            return;
          }
          //precheck: access token.
          if (!user || !user.access_token || !sf.userHasPermission(user, 'wallet')) {
            bot.botkit.log('ERROR: bank no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
            bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !sf.userHasPermission(user, 'wallet') ? "with correct 'wallet' 'permissions' " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
            return;
          }
          var searchTerm = (matches[2] ? matches[2].replace(/\s+/g, '') : null);
          var isDungeonOnly = (matches[1] == "dungeonwallet" || matches[1] == 'dw');
          if (searchTerm) bot.reply(message, "Okay, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ", rifling through your wallet for " + searchTerm + ".");

          gw2api.accountWallet(function(walletList, headers) {
            if (isDungeonOnly) {
              //['Ascalonian Tear', 'Seal of Beetletun', 'Deadly Bloom', 'Manifesto of the Moletariate', 'Flame Legion Charr Carving', 'Symbol of Koda', 'Knowledge Crystal', 'Shard of Zhaitan', 'Fractal Relic', 'Pristine Fractal Relic'];
              //Hard coded ID instead of title, since both are subject to the same change
              var dungeonCurrencyList = [5, 9, 11, 10, 13, 12, 14, 6, 7, 24];
              walletList = walletList.filter(function(value) {
                return (dungeonCurrencyList.indexOf(value.id) >= 0);
              });
              walletList.sort(function(a, b) {
                return dungeonCurrencyList.indexOf(a.id) - dungeonCurrencyList.indexOf(b.id);
              });
            }
            var text = [];
            var goldIcon = 'https://render.guildwars2.com/file/98457F504BA2FAC8457F532C4B30EDC23929ACF9/619316.png';
            var lastIcon;
            for (var i in walletList) {
              var currency = gw2api.findInData('id', walletList[i].id, 'currencies');
              if (currency &&
                (!searchTerm || (searchTerm && sf.removePunctuationAndToLower(currency.name).replace(/\s+/g, '').includes(searchTerm)))
              ) {
                if (currency.name == 'Coin') {
                  text.push("Coin: " + sf.coinToString(walletList[i].value));
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
          if (!user || !user.access_token || !sf.userHasPermission(user, 'inventories')) {
            bot.botkit.log('ERROR: bank no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
            bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !sf.userHasPermission(user, 'inventories') ? "with correct 'inventories' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
            return;
          }
          var searchTerm = matches[2].replace(/\s+/g, '');
          var bankAll = false;
          if (searchTerm == 'all')
            bankAll = true;
          bot.reply(message, "Okay, " + user.dfid + sf.randomHonoriffic(user.dfid, user.id) + ", rifling through your pockets" + (!bankAll ? " for spare " + matches[2] : '') + ".");

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
              //Reset, add worn items
              idList = [];
              countList = [];
              for (var slot in jsonList[ch].equipment) {
                if (jsonList[ch].equipment[slot] !== null) {
                  idList.push(jsonList[ch].equipment[slot].id);
                  countList.push(1);
                }
              }
              inventories.push({
                source: jsonList[ch].name + " (worn)",
                ids: idList,
                counts: countList
              });
            }
            //setup: promise fetch shared inventory, bank, and material storage.
            Promise.all([
                gw2api.promise.accountBank(['all'], user.access_token),
                gw2api.promise.accountInventory(['all'], user.access_token),
                gw2api.promise.accountMaterials(['all'], user.access_token)
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
                  itemPagePromises.push(gw2api.promise.items(ownedItemIds.slice(i, i + 200)));
                }
                return Promise.all(itemPagePromises);
              }).then(function(results) { //find items with our original search string
                var itemList = [];
                for (var list in results)
                  itemList = itemList.concat(results[list]);
                if (debug) bot.botkit.log("results has " + itemList.length + " items");
                if (debug)
                  analyzeForMissingItems(inventories, itemList);
                if (bankAll)
                  tallyAndDisplay(null, itemList);
                else {
                  var itemSearchResults = [];
                  for (var i in itemList) {
                    if (sf.removePunctuationAndToLower(itemList[i].name).replace(/\s+/g, '').includes(searchTerm))
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
                      itemNameList.push(itemSearchResults[n].name + sf.levelAndRarityForItem(itemSearchResults[n]));
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
                        listofItems += '\n' + [i] + ": " + itemSearchResults[i].name + sf.levelAndRarityForItem(itemSearchResults[i]) + (itemSearchResults[i].forged ? " (Mystic Forge)" : "");
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
                }
              }).catch(function(error) {
                bot.reply(message, "I got an error on my way to promise land from the bank. Send help!\nTell them " + error);
                if (convo) convo.next();
              });
          };

          var tallyAndDisplay = function(itemToDisplay, itemList) {
            var total = 0;
            var totalStrings = [];
            if (itemToDisplay) { //find and count this item
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
            } else { //bank all command. List ALL items
              itemToDisplay = {
                name: 'Everything'
              };
              var tallyAllItemsArray = []; //index is id, object is like {total:total,sources:[{source: 'source', count:count}]}
              for (var i in inventories) {
                var begin = 0;
                var uniqueIds = sf.arrayUnique(inventories[i].ids);
                console.log(uniqueIds.length +" vs "+ inventories[i].ids.length);
                for (var uid in uniqueIds) {
                  var foundIndex = inventories[i].ids.indexOf(uniqueIds[uid], begin);
                  var subCount = 0;
                  while (foundIndex >= 0) {
                    subCount += inventories[i].counts[foundIndex];
                    total += inventories[i].counts[foundIndex];
                    begin = foundIndex + 1;
                    foundIndex = inventories[i].ids.indexOf(uniqueIds[uid], begin);
                  }
                  if (subCount > 0) {
                    if (!tallyAllItemsArray[uniqueIds[uid]]) { //new item
                      tallyAllItemsArray[uniqueIds[uid]] = {
                        total: 0,
                        sources: []
                      };
                    }
                    tallyAllItemsArray[uniqueIds[uid]].total += subCount;
                    tallyAllItemsArray[uniqueIds[uid]].sources.push({
                      source: inventories[i].source,
                      count: subCount
                    });
                  }
                }
              }
              itemList.sort(function(a, b) {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
              });
              for (var il in itemList) {
                if (tallyAllItemsArray[itemList[il].id]) {
                  var pushString = itemList[il].name + ": " + tallyAllItemsArray[itemList[il].id].total
                  for (var n in tallyAllItemsArray[itemList[il].id].sources)
                    pushString += ", " + tallyAllItemsArray[itemList[il].id].sources[n].source + " has " + tallyAllItemsArray[itemList[il].id].sources[n].count;
                  totalStrings.push(pushString)
                }

              }
              bot.reply(message, {
                attachments: {
                  attachment: {
                    fallback: 'ALL THE ITEMS',
                    text: "==" + itemToDisplay.name + " Report: " + total + " owned==\n" + totalStrings.join('\n')
                  }
                }
              });

            }
          };

          //setup: fetch character list and callback
          gw2api.characters(charactersCallback, {
            access_token: user.access_token,
            ids: 'all'
          });
        });
      });
    },
    addHelp: function(helpFile) {
      helpFile.wallet = "List the contents of your wallet. Optionally add a search string to filter the list. Useage:wallet <name>";
      helpFile.dungeonWallet = "Lists only your dungeon currencies.";
      helpFile.dw = 'Alias for dungeon wallet: ' + JSON.stringify(helpFile.dungeonwallet);
      helpFile.bank = "Search your possessions for an item. Looks in character inventories, shared inventory, bank and material storage. Usage: bank <item name>";

    }
  };
  return ret;
}();