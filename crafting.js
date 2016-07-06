//Craft Command for Lessdremoth
//Author: Roger Lampe roger.lampe@gmail.com
var gw2api = require('./api.js');
var sf = require('./sharedFunctions.js');
var debug = true;
module.exports = function() {

  var ret = {

    addResponses: function(controller) {

      controller.hears(['^craft (.*)', '^asscraft (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
        if (!gw2api.loaded.recipes || !gw2api.loaded.items) { //still loading
          bot.reply(message, "I'm still loading recipe data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
          globalMessage = message;
          return;
        }
        var itemSearchResults = [];
        var command = message.text.slice(0, message.text.indexOf(' '));
        var args = message.text.slice(message.text.indexOf(' ') + 1, message.text.length);
        if (sf.removePunctuationAndToLower(command) === 'craft') { //straighforward craft
          itemSearchResults = findCraftableItemByName(args);
        } else if (sf.removePunctuationAndToLower(command) === 'asscraft' || sf.removePunctuationAndToLower(command) === 'ac') {
          //Build and filter the list of search results
          var termsArray = args.split(" ");
          //Prefix. Translate to an ascended prefix
          var prefixSearchTerms = getAscendedItemsByPrefix(termsArray[0]);
          if (!termsArray[0] || sf.removePunctuationAndToLower(termsArray[0]) == 'any' || prefixSearchTerms.length < 1) {
            bot.reply(message, "I need an actual prefix to search, buddy. Ask 'help asscraft' if you're having trouble.");
            return;
          }
          termsArray[0] = prefixSearchTerms.join("|");
          for (var i in prefixSearchTerms) {
            itemSearchResults = itemSearchResults.concat(findCraftableItemByName(prefixSearchTerms[i]));
          }
          //they should all be ascended, but just in case:
          itemSearchResults = itemSearchResults.filter(function(value) {
            return value.rarity == 'Ascended';
          });
          //weight or is a weapon
          if (termsArray[1] && sf.removePunctuationAndToLower(termsArray[1]) != 'any') {
            var weight = getAscendedWeight(termsArray[1]);
            termsArray[1] = weight;
            itemSearchResults = itemSearchResults.filter(function(value) {
              if (weight == 'Weapon')
                return value.type == weight;
              else
                return (value.details && value.details.weight_class == weight);
            });
          }
          //slot or weapon type
          if (termsArray[2] && sf.removePunctuationAndToLower(termsArray[2]) != 'any') {
            var slot = getItemSlot(termsArray[2]);
            termsArray[2] = slot;
            itemSearchResults = itemSearchResults.filter(function(value) {
              return (value.details && value.details.type == slot);
            });
          }
          bot.reply(message, "Your final search was for: " + termsArray.join(" "));
        } else {
          bot.reply(message, "I didn't quite get that. Maybe ask \'help " + matches[0] + "\'?");
          return;
        }
        if (debug) sf.log(itemSearchResults.length + " matches found for search string");
        if (itemSearchResults.length === 0) { //no match
          bot.reply(message, "No item names contain that exact text.");
        } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
          bot.reply(message, getMessageWithRecipeAttachment(itemSearchResults[0]));
        } else if (itemSearchResults.length > 10) { //too many matches in our 'contains' search, notify and give examples.
          var itemNameList = [];
          for (var n in itemSearchResults) {
            itemNameList.push(itemSearchResults[n].name + levelAndRarityForItem(itemSearchResults[n]));
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
                  convo.say(getMessageWithRecipeAttachment(itemSearchResults[selection]));
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
    },
    addHelp: function(helpFile) {
      helpFile.asscraft = "Craft variant for ascended items. takes three arguments: prefix, weight, slot. Each can be 'any' or a partial name (beware of false positives). Prefix is an ascended prefix or equivalent, weight is armor weight or 'weapon', slot is armor slot or weapon type.\nEx:asscraft zojja's medium pants\nasscraft wupwup weapon staff";
      helpFile.ac = "Alias for asscraft: " + JSON.stringify(helpFile.asscraft);
      helpFile.craft = "Lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note mystic forge recipes will just give the 4 forge ingredients. Example:craft Light of Dwyna.";
    }
  };
  return ret;
}();

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
    if (sf.removePunctuationAndToLower(prefix).includes(prefixSearch)) {
      return possiblePrefixes[prefix];
    } else
      for (var name in possiblePrefixes[prefix])
        if (sf.removePunctuationAndToLower(possiblePrefixes[prefix][name]).includes(prefixSearch)) {
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
      if (sf.removePunctuationAndToLower(possibleWeights[weightName][j]).includes(weight))
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
    if (sf.removePunctuationAndToLower(possibleSlots[i]).includes(slotName))
      return possibleSlots[i];
  }
  return sf.randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", "Garbage"]);
}

function getMessageWithRecipeAttachment(itemToMake) {
  var attachments = assembleRecipeAttachment(itemToMake);
  var foundRecipe = gw2api.findInData('output_item_id', itemToMake.id, 'recipes');
  var amountString;
  if (foundRecipe && foundRecipe.output_item_count && foundRecipe.output_item_count > 1) { //if it's a multiple, collect multiple amount
    amountString = foundRecipe.output_item_count;
  }
  var descripFlavorized = '';
  if (itemToMake.description) {
    descripFlavorized = "\n" + sf.replaceGWFlavorTextTags(itemToMake.description, "_");
  }
  if(debug) sf.log("Done crafting message for "+itemToMake.name);

  return {
    'text': itemToMake.name + (amountString ? " x " + amountString : "") + levelAndRarityForItem(itemToMake) + descripFlavorized,
    attachments: attachments,
    // 'icon_url': itemToMake.icon,
    // "username": "RecipeBot",
  };
}

//For a given item, find its base ingredients and prepare an attachment displaying it
function assembleRecipeAttachment(itemToDisplay) {
  var ingredients;
  //is it a standard recipe
  if (!itemToDisplay.forged) {
    var foundRecipe = gw2api.findInData('output_item_id', itemToDisplay.id, 'recipes');
    if (foundRecipe)
      ingredients = getBaseIngredients(foundRecipe.ingredients);
  } else { //mystic forge recipe. Do Not getBaseIngredients. Forge recipes that will shift the tier of the item means that most things will be reduced toa  giant pile of tier 1 ingredients
    var forgeRecipe = gw2api.findInData('output_item_id', itemToDisplay.id, 'forged');
    if (forgeRecipe)
      ingredients = forgeRecipe.ingredients;
  }
  //Recipe not found.
  if (!ingredients) return [];
  //chat limitations in game means that pasted chatlinks AFTER EXPANSION are limited to 155 charachters
  //[&AgEOTQAA] is not 10 characters long, but rather 13 (Soft Wood Log)
  //gwPasteString is the actual series of chatlinks for pasting
  var gwPasteString = '';
  //gwlenght records the length of the names of the items
  var gwLength = 0;
  var attachments = [];
  var item;

  //if we'd go above 255 chars after expansion, put in a newline before adding on.
  var gwPasteStringMaxInt = function(addString) {
    if (gwLength > 254) {
      gwPasteString += '\n';
      gwLength = 0;
    }
    gwPasteString += addString;
  };

  var attachment = {
    color: '#000000',
    thumb_url: itemToDisplay.icon,
    fields: [],
    "fallback": itemToDisplay.name + " has " + ingredients.length + " items."
  };
  if(debug) sf.log("Item has an ingredient list of length "+ingredients.length);
  for (var i in ingredients) {
    item = gw2api.findInData('id', ingredients[i].item_id, 'items');
    if (item) {
      gwLength += (" " + ingredients[i].count + "x[" + item.name + "]").length;
      gwPasteStringMaxInt(" " + ingredients[i].count + "x" + item.chat_link);
      attachment.fields.push({
        title: ingredients[i].count + " " + item.name + (item.level ? " (level " + item.level + ")" : ""),
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
  // attachments[0].pretext = gwPasteString;
  attachments.push({
    color: '#2200EE',
    fields: [{
      value: gwPasteString
    }]
  });
  return attachments;
}
//a text differentiation of items. spits out (level ## <rarity>) if eitehr of those exist
function levelAndRarityForItem(item) {
  var levelString = '';
  if (item.level) {
    levelString = item.level;
  } else if (item.description) {
    var matches = item.description.match(/level (\d{1,2})/i);
    if (debug) sf.log("matches " + JSON.stringify(matches) + " of description " + item.description);
    if (matches && matches[1]) {
      levelString = Number(matches[1]);
    }
  }
  var rarityString = '';
  if (item.rarity) rarityString = item.rarity;
  var infoTag = '';
  if (levelString > 0 || rarityString.length > 0)
    infoTag = " (" + (levelString ? "level " + levelString : "") + (rarityString ? (levelString ? " " : "") + rarityString : '') + ")";
  return infoTag;
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

function getBaseIngredients(ingredients) {

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
  //ingredient format is {"item_id":19721,"count":1}
  var baseIngredients = []; //ingredients to send back, unmakeable atoms
  var extraIngredients = []; //extra items left over after producing (usually a refinement)
  //Ex1: mighty bronze axe (simple) 1 weak blood, 1 blade (3 bars (10 copper, 1 tin)), one haft (two planks(6 logs))
  for (var i = 0; i < ingredients.length; i++) { //Length changes. Careful, friend
    var makeableIngredient = gw2api.findInData('output_item_id', ingredients[i].item_id, 'recipes');
    //special cutout for jewelry, ignore the transmog types that change tiers of gems, so we don't always see piled of the lowest tier gem
    //if it makes an upgrade component that is a gem, ignore.
    var outputItem = gw2api.findInData('id', ingredients[i].item_id, 'items');
    var jewelryTransmog = makeableIngredient && outputItem && outputItem.type && outputItem.type == "UpgradeComponent" && outputItem.details && outputItem.details.type && outputItem.details.type == "Gem";

    if (!makeableIngredient || jewelryTransmog) { //if it's not made, base ingredient. Also refineable jewelry
      if (debug) sf.log(gw2api.findInData('id', ingredients[i].item_id, 'items').name + " is a " + (jewelryTransmog ? "jewelry transmog" : "base ingredient")); //Ex1: 1 vial of blood
      addIngredient(baseIngredients, ingredients[i]);
    } else { //Ex1: an axe blade
      if (debug) sf.log("need " + ingredients[i].count + " of " + gw2api.findInData('id', ingredients[i].item_id, 'items').name + '(' + makeableIngredient.output_item_count + ')');
      //Add parts of this sub-recipe to the ingredients list
      var ingredientsNeeded = ingredients[i].count; //How many of this sub recipe to make
      var listItem;
      if (debug) listItem = outputItem.name;
      //Check if we have any in extra ingredients
      if (debug) sf.log('see if we already have any of the ' + ingredientsNeeded + ' ' + listItem + '(s) we need');
      for (var x in extraIngredients) {
        if (debug) sf.log("we have " + extraIngredients[x].count + " " + gw2api.findInData('id', extraIngredients[x].item_id, 'items').name);
        if (extraIngredients[x].item_id == makeableIngredient.output_item_id) { //we've already made some
          if (ingredientsNeeded >= extraIngredients[x].count) { //we don't have enough, add what we have to the 'made' pile
            ingredientsNeeded -= extraIngredients[x].count;
            extraIngredients.splice(x, 1); //remove the 'used' extra ingredients
            if (debug) sf.log("that was it for extra " + listItem);
          } else {
            extraIngredients[x].count -= ingredientsNeeded; //we have more than enough, subtract what we used.
            ingredientsNeeded = 0; // we need make no more
            if (debug) sf.log("had enough spare " + listItem);
          }
        }
      }
      if (ingredientsNeeded > 0) { //Do we still need to make some after our extra ingredients pass?
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) sf.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
        //Calculate number of times to make the recipe to reach ingredientsNeeded
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
    sf.log("extra pile is:");
    for (var j in extraIngredients) {
      var item2 = gw2api.findInData('id', extraIngredients[j].item_id, 'items');
      if (item2)
        sf.log(extraIngredients[j].count + " " + item2.name);
      else
        sf.log('Unknown Item of id: ' + extraIngredients[j].item_id + '(' + extraIngredients[j].count + ')');
    }
  }
  return baseIngredients; //return our list of non-makeable ingredients
}