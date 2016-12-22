//Craft Command for Lessdremoth
//Author: Roger Lampe roger.lampe@gmail.com
var gw2api = require('./api.js');
var sf = require('./sharedFunctions.js');
var inventories = require('./inventories.js');
var debug = false;
var allInventory = [];
var aliasLists = {};

module.exports = function() {

  var ret = {

    addResponses: function(controller) {

      controller.hears(['^craft (.*)', '^bcraft (.*)', '^bc (.*)', '^asscraft (.*)', '^basscraft (.*)', '^bac (.*)', '^shop (.*)', '^bshop (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
        if (!gw2api.loaded.recipes || !gw2api.loaded.items) { //still loading
          bot.reply(message, "I'm still loading recipe data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
          sf.setGlobalMessage(message); //start spitting out reload updates in response to this message via global message
          return;
        }

        var itemSearchResults = [];
        allInventory = [];
        var command = message.text.slice(0, message.text.indexOf(' '));
        var args = message.text.slice(message.text.indexOf(' ') + 1, message.text.length);
        var isBaseCraft = false;
        if (sf.removePunctuationAndToLower(command)[0] == 'b') {
          isBaseCraft = true;
          command = command.slice(1, command.length);
        }

        return new Promise(function(resolve, reject) {
          if (sf.removePunctuationAndToLower(command) === 'shop') {

            bot.reply(message, "Let's shop 'til we " + sf.randomOneOf(['plop', 'crop', 'bop', 'fop', 'hop', 'cop', 'lop', 'mop', 'pop', 'qwop', 'sop', 'top(less)', 'zip zop']) + "!");
            sf.setGlobalMessage(message);
            //Chceck for permissions needed for shopping

            sf.storageUsersGetSynch([message.user])
              .then(function(users) {
                return sf.userHasPermissionsAndReply(users, "inventories");
              })
              .then(function(validUsers) {
                //should only be one valid guy, use validUsers[0]
                if (!validUsers[0])
                  return Promise.reject("there were no users with correct permissions.");
                else {
                  if (debug) sf.log(validUsers[0].name + " is a valid user");
                  return Promise.resolve(validUsers[0].access_token);
                }
              }).then(function(access_token) {
                return inventories.fetchAllCharacterData(access_token);
              })
              .then(function(inventories) {
                if (debug) sf.log('inventories: ' + inventories.length);
                //fill allIngredients with inventory contents
                //ingredient format is {"item_id":19721,"count":1}
                for (var inv in inventories) {
                  for (var i in inventories[inv].ids) {
                    if (!allInventory[inventories[inv].ids[i]])
                      allInventory[inventories[inv].ids[i]] = {
                        item_id: inventories[inv].ids[i],
                        count: 0
                      };
                    allInventory[inventories[inv].ids[i]].count += inventories[inv].counts[i];
                  }
                }
                allInventory = allInventory.filter(Boolean);
                if (debug) sf.log('Allinv is size: ' + allInventory.length + ". Sample: " + JSON.stringify(allInventory[0]));
                //find item as normal.
                resolve(findCraftableItemByName(args));
              });
          } else { //not shop[]
            bot.reply(message, "Let's get crafty.");
            resolve(findCraftableItemByName(args));
          }
        }).then(function(itemSearchResults) {
          if (itemSearchResults.length === 0) {
            if (debug) sf.log("No craftables found. Trying asscraft.");
            if (!aliasLists || !aliasLists.ascendedPrefixes) {
              aliasLists = sf.loadStaticDataFromFile("itemAliases.json");
            }
            //Build and filter the list of search results
            var termsArray = args.split(" ");
            //Not an ascended search
            if (termsArray.length < 3) return [];

            //Prefix. Translate to an ascended prefix
            var prefixSearchTerms = getValidTermFromAlias(sf.removePunctuationAndToLower(termsArray[0]), aliasLists.ascendedPrefixes, true);
            if (debug) sf.log("Prefix search terms: " + JSON.stringify(prefixSearchTerms));
            if (!termsArray[0] || !prefixSearchTerms || prefixSearchTerms.length === 0) {
              bot.reply(message, "Were you trying to find an ascended item? See 'help asscraft'.");
              return;
            }

            //Build list of possible items based on given prefixes
            for (var i in prefixSearchTerms) {
              itemSearchResults = itemSearchResults.concat(findCraftableItemByName(prefixSearchTerms[i]));
            }
            //they should all be ascended, but just in case:
            itemSearchResults = itemSearchResults.filter(function(value) {
              return value.rarity == 'Ascended';
            });
            //weight or is a weapon
            var weight;
            if (termsArray[1] && sf.removePunctuationAndToLower(termsArray[1]) != 'any') {
              weight = getValidTermFromAlias(sf.removePunctuationAndToLower(termsArray[1]), 'weight');
              if (weight)
                itemSearchResults = itemSearchResults.filter(function(value) {
                  if (weight == 'Weapon')
                    return value.type == weight;
                  else
                    return (value.details && value.details.weight_class == weight);
                });
            }

            //slot or weapon type
            var slot;
            if (termsArray[2] && sf.removePunctuationAndToLower(termsArray[2]) != 'any') {
              slot = getValidTermFromAlias(sf.removePunctuationAndToLower(termsArray[2]), 'slot');
              if (slot) itemSearchResults = itemSearchResults.filter(function(value) {
                return (value.details && value.details.type == slot);
              });
            }
            //Add sass!
            //Sass people who don't know the hero's name directly
            var sassOff = true;
            var saidHeroName;
            var foundHeroName = itemSearchResults[0].name.split("'")[0];
            for (var prefix in prefixSearchTerms) {
              if (sf.removePunctuationAndToLower(prefixSearchTerms[prefix]).includes(sf.removePunctuationAndToLower(termsArray[0]))) {
                sassOff = false;
                saidHeroName = prefixSearchTerms[prefix].split("'")[0];
                break;
              }
            }
            if (sassOff) bot.reply(message, "You meant " + prefixSearchTerms.join(" or ") + ", right? Of course you did.");
            else if (prefixSearchTerms.length > 1 && foundHeroName!=saidHeroName)
                bot.reply(message,"You know "+foundHeroName+" made that, right? Not "+saidHeroName+"?");

            //Extra sass for a nonsense search
            if (!slot || !weight || !itemSearchResults || itemSearchResults.length === 0) {
              var names = [];
              for (var t in prefixSearchTerms) {
                names.push(prefixSearchTerms[t].split("'")[0]);
              }
              var exaspArray = ["By the gods", "Sheesh", "Gawd", "Cripes", "I mean, come ON", "Jeez", "For goodness sake", "For pete's sake"];
              var mockArray = [
                "Oh, why doesn't this computer program know what I mean when I type random characters? Whine whine whine.",
                "Lessy will know what I mean. All bots really exist and are psychic!",
                "I can just type whatever! The world is my oyster!",
                "Close enough! <return>.",
                "This must be star trek. I'll shout my questions at the ceiling!",
                "Everything is exactly as intuative as my butler!"
              ];
              bot.reply(message, "I looked carefully, and it turns out " + (names.length > 1 ? "neither " + names.join(" nor ") + " has ever" : names[0] + " never") + " made \"" + (weight ? weight : sf.randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", "Garbage", termsArray[1]])) + " " + (slot ? slot : sf.randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", "Garbage", termsArray[2]])) + "\"\n" + sf.randomOneOf(exaspArray) + ". " +
                ((Math.floor(Math.random() * 10) > 8) ? "\"" + sf.randomOneOf(mockArray) + "\" That's you. That's what you sound like." : "This is you: \"" + sf.randomOneOf(mockArray) + "\"")
              );
              return;
            } else bot.reply(message, "Your final search was for: " + itemSearchResults[0].name.split("'")[0] + " " + weight + " " + slot);
            if (debug) sf.log(itemSearchResults.length + " matches found for asscraft");
          }
          return itemSearchResults;
        }).then(function(itemSearchResults) {
          if (debug) sf.log(itemSearchResults.length + " matches found for search string");
          if (itemSearchResults.length === 0) { //no match
            bot.reply(message, "No item names contain that exact text.");
          } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
            if (itemSearchResults[0] == 'error')
              return;
            else
              bot.reply(message, getMessageWithRecipeAttachment(itemSearchResults[0], isBaseCraft));
          } else if (itemSearchResults.length > 10) { //too many matches in our 'contains' search, notify and give examples.
            var itemNameList = [];
            for (var n in itemSearchResults) {
              itemNameList.push(itemSearchResults[n].name + sf.levelAndRarityForItem(itemSearchResults[n]));
            }
            bot.reply(message, {
              attachments: {
                attachment: {
                  fallback: 'Too many items found in search.',
                  text: "Dude. I found " + itemSearchResults.length + ' items. Get more specific.\n' + itemNameList.join("\n")
                }
              }
            });
          } else { //10 items or less, allow user to choose
            bot.startConversation(message, function(err, convo) {
              var listofItems = '';
              itemSearchResults.sort(function(a, b) {
                if (!a.level || !b.level) return -1;
                return a.level - b.level;
              });
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
                    convo.say("Got it. Let me just get the list here...");
                    convo.say(getMessageWithRecipeAttachment(itemSearchResults[selection], isBaseCraft));
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
                  convo.say("Hum, that doesn't look right. Next time choose a number of the recipe you'd like to see.");
                  convo.next();
                }
              }]);
            });
          }
        });
      });
    },
    addHelp: function(helpFile) {
      helpFile.craft = "Lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note mystic forge recipes will just give the 4 forge ingredients. Example:craft Light of Dwyna.\nAlso available is special arguments for ascended items. See 'help asscraft'";
      helpFile.bcraft = "'base' craft. Same output as craft, but will not recursively fetch sub-recipes for the recipe's ingredients.";
      helpFile.bc = "Alias for bcraft: " + JSON.stringify(helpFile.bcraft);
      helpFile.asscraft = "Craft can also take three arguments: prefix, weight, slot. Weight and slot can be 'any' or a partial name (beware of false positives). Prefix is an ascended prefix or equivalent, weight is armor weight or 'weapon', slot is armor slot or weapon type.\nEx:craft zojja's medium pants\ncraft wupwup weapon staff";
      helpFile.basscraft = "Alias for bcraft: " + JSON.stringify(helpFile.asscraft);
      helpFile.ac = "Alias for craft: " + JSON.stringify(helpFile.asscraft);
      helpFile.bac = "Alias for bcraft: " + JSON.stringify(helpFile.asscraft);
      helpFile.shop = "Same as craft, but Lessy looks up your inventory and removes items you already own from the list.";
      helpFile.bshop = "'base' shop. Same output as shop, but will not recursively fetch sub-recipes for the recipe's ingredients.";
    }
  };
  return ret;
}();

//Generic function for mapping valid search terms to aliases
function getValidTermFromAlias(searchTerm, source, returnArray) {
  if (debug) sf.log("getValidTermFromAlias with term: " + searchTerm);
  if (typeof source == 'string') {
    if (debug) sf.log("source is " + source);
    if (source == 'weight')
      source = aliasLists.weightAliases;
    else if (source == 'slot')
      source = aliasLists.slotAliases;
    else {
      sf.log("Invalid source for getValidTermFromAlias: " + source);
      source = [];
    }
  } else {
    if (debug) sf.log("Search term is an object with " + Object.keys(source).length + " keys");
  }
  var searchTermsList = [];
  for (var validName in source) {
    for (var j in source[validName])
      if (sf.removePunctuationAndToLower(source[validName][j]).includes(searchTerm)) {
        if (debug) sf.log("Found vaild search term: " + validName);
        searchTermsList.push(validName);
      }
  }
  if (returnArray || !searchTermsList) return searchTermsList;
  else return searchTermsList[0];
}

function getMessageWithRecipeAttachment(itemToMake, isBaseCraft) {
  var attachments = assembleRecipeAttachment(itemToMake, isBaseCraft);
  var foundRecipe = gw2api.findInData('output_item_id', itemToMake.id, 'recipes');
  var amountString;
  if (foundRecipe && foundRecipe.output_item_count && foundRecipe.output_item_count > 1) { //if it's a multiple, collect multiple amount
    amountString = foundRecipe.output_item_count;
  }
  var descripFlavorized = '';
  if (itemToMake.description) {
    descripFlavorized = "\n" + sf.replaceGWFlavorTextTags(itemToMake.description, "_");
  }
  if (debug) sf.log("Done crafting message for " + itemToMake.name);

  return {
    'text': itemToMake.name + (amountString ? " x " + amountString : "") + sf.levelAndRarityForItem(itemToMake) + descripFlavorized,
    attachments: attachments,
    // 'icon_url': itemToMake.icon,
    // "username": "RecipeBot",
  };
}

//For a given item, find its base ingredients and prepare an attachment displaying it
function assembleRecipeAttachment(itemToDisplay, isBaseCraft) {
  var ingredients;
  var foundRecipe;
  var usedIngredients = [];
  //is it a standard recipe
  if (itemToDisplay.forged)
  //mystic forge recipe. Do Not getBaseIngredients. Forge recipes that will shift the tier of the item means that most things will be reduced toa  giant pile of tier 1 ingredients
    foundRecipe = gw2api.findInData('output_item_id', itemToDisplay.id, 'forged');
  else
    foundRecipe = gw2api.findInData('output_item_id', itemToDisplay.id, 'recipes');
  if (typeof foundRecipe !== 'undefined') {
    // for(var i in foundRecipe.ingredients){
    //   foundRecipe.ingredients[i].count = i.count * 5;
    // }
    ingredients = getBaseIngredients(foundRecipe.ingredients, allInventory, (isBaseCraft || itemToDisplay.forged), usedIngredients);
  } else //Recipe not found.
    return [];
  //chat limitations in game means that pasted chatlinks AFTER EXPANSION are limited to 155 charachters
  //[&AgEOTQAA] is not 10 characters long, but rather 13 (Soft Wood Log)
  //gwPasteString is the actual series of chatlinks for pasting
  var gwPasteString = '';
  //gwlenght records the length of the names of the items
  var gwLength = 0;
  var attachments = [];

  //if we'd go above 255 chars after expansion, put in a newline before adding on.
  var gwPasteStringMaxInt = function(addString) {
    if (gwLength > 254) {
      gwPasteString += '\n';
      gwLength = 0;
    }
    gwPasteString += addString;
  };

  var addIngredientsAsFields = function(ingredients, useValue) {
    var item;
    var fields = [];
    var keyToUse = (useValue ? 'value' : 'title');
    var field;
    for (var i in ingredients) {
      item = gw2api.findInData('id', ingredients[i].item_id, 'items');
      field = {};
      if (item) {
        gwLength += (" " + ingredients[i].count + "x[" + item.name + "]").length;
        gwPasteStringMaxInt(" " + ingredients[i].count + "x" + item.chat_link);
        field[keyToUse] = ingredients[i].count + " " + item.name + (item.level ? " (level " + item.level + ")" : "");
        field.short = false;
        fields.push(field);
      } else {
        gwLength += (" " + ingredients[i].count + " of unknown item id " + ingredients[i].item_id).length;
        gwPasteStringMaxInt(" " + ingredients[i].count + " of unknown item id " + ingredients[i].item_id);
        field[keyToUse] = ingredients[i].count + " of unknown item id " + ingredients[i].item_id;
        field.short = false;
        fields.push(field);
      }
    }
    if (debug) sf.log('fields: ' + JSON.stringify(fields));
    return fields;
  };

  var attachment = {
    color: '#EA9810',
    thumb_url: itemToDisplay.icon,
    fields: [],
    "fallback": itemToDisplay.name + " has " + ingredients.length + " items."
  };
  if (debug) sf.log("Item has an ingredient list of length " + ingredients.length);
  attachment.fields = attachment.fields.concat(addIngredientsAsFields(ingredients));
  if (attachment.fields.length === 0) { //This is a shopped item for which no ingredients need to be bought.
    attachment.fields.push({
      title: "0 Items of any kind",
      value: "Just go make it.",
      short: false
    });

  }
  attachments.push(attachment);
  // attachments[0].pretext = gwPasteString;
  if (gwPasteString.length > 0)
    attachments.push({
      color: '#253034',
      fields: [{
        value: gwPasteString
      }]
    });
  if (usedIngredients.length > 0) {
    var usedAttachment = {
      color: '#E7E0A9',
      fields: [],
      "fallback": "There are " + usedIngredients.length + " items in the used ingredients list."
    };
    usedAttachment.fields.push({
      title: "Used own ingredients:",
      short: false
    });
    usedAttachment.fields = usedAttachment.fields.concat(addIngredientsAsFields(usedIngredients, true));
    attachments.push(usedAttachment);

  }
  return attachments;
}

//normalizes input string and searches regular and forge recipes for an item match. Matches if search term shows up anywhere in the item name
function findCraftableItemByName(searchName) {
  if (searchName.length === 0) return [];
  var itemsFound = [];
  var cleanSearch = sf.removePunctuationAndToLower(searchName).replace(/\s+/g, '');
  if (cleanSearch.length === 0) return [];
  var exactMatch = [];
  if (debug) sf.log("findCraftableItemByName: " + cleanSearch);
  for (var i in gw2api.data.items) {
    var cleanItemName = sf.removePunctuationAndToLower(gw2api.data.items[i].name).replace(/\s+/g, '');
    if (cleanItemName.includes(cleanSearch)) {
      if (gw2api.findInData('output_item_id', gw2api.data.items[i].id, 'recipes')) {
        if (cleanItemName == cleanSearch) { //exact match cutout (for short names)
          if (debug) sf.log('exact match recipie ' + cleanSearch);
          exactMatch.push(gw2api.data.items[i]);
        }
        itemsFound.push(gw2api.data.items[i]);
      }
      if (gw2api.findInData('output_item_id', gw2api.data.items[i].id, 'forged')) {
        var forgedItem = JSON.parse(JSON.stringify(gw2api.data.items[i]));
        forgedItem.forged = true;
        if (cleanItemName == cleanSearch) { //exact match cutout (for short names)
          if (debug) sf.log('exact match forged ' + cleanSearch);
          exactMatch.push(forgedItem);
        } else itemsFound.push(forgedItem);
      }
    }
  }
  if (exactMatch.length > 0) return exactMatch;
  else return itemsFound;
}

function getBaseIngredients(ingredients, inventoryIngredients, doNotRecurse, usedIngredients) {

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

  var useExtra = function(numberNeeded, ingredientNeededId) {
    for (var x in extraIngredients) {
      //if (debug) sf.log("we have " + extraIngredients[x].count + " " + (gw2api.findInData('id', extraIngredients[x].item_id, 'items')?gw2api.findInData('id', extraIngredients[x].item_id, 'items').name:"id: "+extraIngredients[x].item_id));
      if (extraIngredients[x].item_id == ingredientNeededId) { //we've already made some
        if (numberNeeded >= extraIngredients[x].count) { //we don't have enough, add what we have to the 'made' pile
          addIngredient(usedIngredients, extraIngredients[x]);
          numberNeeded -= extraIngredients[x].count;
          extraIngredients.splice(x, 1); //remove the 'used' extra ingredients
          if (debug) sf.log("Used " + numberNeeded + " extra " + listItem);
        } else {
          extraIngredients[x].count -= numberNeeded; //we have more than enough, subtract what we used.
          addIngredient(usedIngredients, {
            item_id: ingredientNeededId,
            count: numberNeeded
          });
          numberNeeded = 0; // we need make no more
          if (debug) sf.log("had enough spare " + listItem);
          break;
        }
      }
    }
    return numberNeeded;
  };
  //ingredient format is {"item_id":19721,"count":1}
  var baseIngredients = []; //ingredients to send back
  var extraIngredients = inventoryIngredients || []; //extra items left over after producing (a refinement, or character inventory.)
  if (debug) sf.log("Starting with a pile of extra ingredients of size: " + inventoryIngredients.length);
  //Ex1: mighty bronze axe (simple) 1 weak blood, 1 blade (3 bars (10 copper, 1 tin)), one haft (two planks(6 logs))
  var dnrLimit;
  if (doNotRecurse) dnrLimit = ingredients.length;
  for (var i = 0; i < (dnrLimit || ingredients.length); i++) { //Length changes. Careful, friend
    if (debug) sf.log('processing ' + i + "/" + ((dnrLimit || ingredients.length) - 1));
    var makeableIngredient = gw2api.findInData('output_item_id', ingredients[i].item_id, 'recipes');
    var ingredientsNeeded = ingredients[i].count; //How many of this sub recipe to make

    //special cutout for jewelry, ignore the transmog types that change tiers of gems, so we don't always see piled of the lowest tier gem
    //if it makes an upgrade component that is a gem, ignore.
    var outputItem = gw2api.findInData('id', ingredients[i].item_id, 'items');
    var jewelryTransmog = makeableIngredient && outputItem && outputItem.type && outputItem.type == "UpgradeComponent" && outputItem.details && outputItem.details.type && outputItem.details.type == "Gem";

    if (!makeableIngredient || jewelryTransmog) { //if it's not made, base ingredient. Also refineable jewelry
      if (debug) sf.log(gw2api.findInData('id', ingredients[i].item_id, 'items').name + " is a " + (jewelryTransmog ? "jewelry transmog" : "base ingredient")); //Ex1: 1 vial of blood
      ingredientsNeeded = useExtra(ingredientsNeeded, ingredients[i].item_id);
      if (ingredientsNeeded > 0)
        addIngredient(baseIngredients, {
          item_id: ingredients[i].item_id,
          count: ingredientsNeeded
        });
    } else { //Ex1: an axe blade
      if (debug) sf.log("need " + ingredients[i].count + " of " + gw2api.findInData('id', ingredients[i].item_id, 'items').name + '(' + makeableIngredient.output_item_count + ')');
      //Add parts of this sub-recipe to the ingredients list
      var listItem;
      if (debug) listItem = outputItem.name;
      //Check if we have any in extra ingredients
      if (debug) sf.log('see if we already have any of the ' + ingredientsNeeded + ' ' + listItem + '(s) we need');
      ingredientsNeeded = useExtra(ingredientsNeeded, makeableIngredient.output_item_id);
      if (ingredientsNeeded > 0) { //Do we still need to make some after our extra ingredients pass?
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) sf.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
        //Calculate number of times to make the recipe to reach ingredientsNeeded
        //add all its parts times the number-to-make to the ingredient list for processing
        if (doNotRecurse)
          addIngredient(baseIngredients, {
            item_id: makeableIngredient.output_item_id,
            count: ingredientsNeeded
          });
        else {
          for (var n in makeableIngredient.ingredients) { //Ex1: add 10 copper and 1 tin to ingredients
            var singleComponent = {
              item_id: makeableIngredient.ingredients[n].item_id,
              count: (makeableIngredient.ingredients[n].count * numToMake) //Unqualified multiplication. Hope we're not a float
            };
            ingredients = ingredients.concat([singleComponent]); //add this to the end of the list of ingredients, if it has sub components, we'll get to them there
          }
        }
        var excessCount = (makeableIngredient.output_item_count * numToMake) - ingredientsNeeded; //Ex1: made 5 bars, need 3
        if (excessCount > 0) { //add extra to a pile
          addIngredient(extraIngredients, { //EX1: add two here
            item_id: makeableIngredient.output_item_id,
            count: excessCount,
            justMade: true
          });
        }
      }
    }
  }
  //The extra pile can be the characters entire inventory.
  if (debug && false) {
    sf.log("extra pile is:");
    for (var j in extraIngredients) {
      var item2 = gw2api.findInData('id', extraIngredients[j].item_id, 'items');
      if (item2 && item2.name)
        sf.log(extraIngredients[j].count + " " + item2.name);
      else
        sf.log(extraIngredients[j].count + ' unknown item (id: ' + extraIngredients[j].item_id + ')');
    }
  }
  if (debug) sf.log("used ingredients size: " + usedIngredients.length);
  return baseIngredients; //return our list of non-makeable ingredients
}