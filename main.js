//A botkit based guildwars helperbot
//Author: Roger Lampe roger.lampe@gmail.com
var debug = false; //for debug messages, passed botkit
var recipiesLoaded = false; //To signal the bot that the async data load is finished.
var achievementsLoaded = false;
var achievementsCategoriesLoaded = false;
var start; //holds start time for data loading
var globalMessage; //holds message for data loading to repsond to, if loading via bot chat
var toggle = true; //global no-real-use toggle. Used at present to compare 'craft' command output formats.

var Botkit = require('botkit');
var os = require('os');
var fs = require('fs');
// var winston = require('winston');

var helpFile = [];
var cheevoList = {};
controller = Botkit.slackbot({
  debug: debug,
  json_file_store: 'slackbotDB',
  // logger: new winston.Logger({
  //   transports: [
  //     new(winston.transports.Console)({
  //       level: 'info'
  //     }),
  //     new(winston.transports.File)({
  //       filename: './bot.log',
  //       level: 'warning'
  //     })
  //   ]
  // })

});

//Check for bot token
if (!process.env.token) {
  bot.botkit.log('Error: Specify token in environment');
  process.exit(1);
}
//fire up the bot
var bot = controller.spawn({
  token: process.env.token,
  retry: 5
}).startRTM(function(err, bot, payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});
// bot.botkit.log.warning("WARN TEST");
// bot.botkit.log.error("ERROR TEST");
// bot.botkit.log("INFO TEST");

var gw2nodelib = require('./api.js');
gw2nodelib.setCacheTime(3600, 'achievements');
gw2nodelib.setCacheTime(3600, 'achievementsCategories');
gw2nodelib.setCachePath('./slackbotDB/caches/');
gw2nodelib.loadCacheFromFile('cache.json'); //note that this file name is a suffix. Creates itemscache.json, recipecache,json, and so on


reloadAllData(false);

////HELP
controller.hears(['^help', '^help (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/help ([a-zA-Z ]*)/i);
  if (!matches || !matches[1] || !helpFile[matches[1].toLowerCase()]) bot.reply(message, "Help topics: " + listKeys(helpFile));
  else {
    var name = matches[1].toLowerCase();
    bot.reply(message, helpFile[name]);
  }
});

////CRAFT
helpFile.asscraft = "Craft variant for ascended items. takes three arguments: prefix, weight, slot. Each can be 'any' or a partial name (beware of false positives). Prefix is an ascended prefix or equivalent, weight is armor weight or 'weapon', slot is armor slot or weapon type.\nEx:asscraft zojja's medium pants\nasscraft wupwup weapon staff";
helpFile.ac = "Alias for asscraft: " + JSON.stringify(helpFile.asscraft);
helpFile.craft = "Lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note mystic forge recipes will just give the 4 forge ingredients. Example:craft Light of Dwyna.";
controller.hears(['^craft (.*)', '^asscraft (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  if (!recipiesLoaded) { //still loading
    bot.reply(message, "I'm still loading recipe data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }
  var itemSearchResults = [];
  var command = message.text.slice(0, message.text.indexOf(' '));
  var args = message.text.slice(message.text.indexOf(' ') + 1, message.text.length);
  if (removePunctuationAndToLower(command) === 'craft') { //straighforward craft
    itemSearchResults = findCraftableItemByName(args);
  } else if (removePunctuationAndToLower(command) === 'asscraft') {
    //Build and filter the list of search results
    var termsArray = args.split(" ");
    //Prefix. Translate to an ascended prefix
    if (!termsArray[0] || removePunctuationAndToLower(termsArray[0]) == 'any') {
      bot.reply(message, "I need a prefix to search, buddy. Ask 'help asscraft' if you're having trouble.");
      return;
    }
    var prefixSearchTerms = getAscendedItemsByPrefix(termsArray[0]);
    termsArray[0] = prefixSearchTerms.join("|");
    for (var i in prefixSearchTerms) {
      itemSearchResults = itemSearchResults.concat(findCraftableItemByName(prefixSearchTerms[i]));
    }
    //they should all be ascended, but just in case:
    itemSearchResults = itemSearchResults.filter(function(value) {
      return value.rarity == 'Ascended';
    });
    //weight or is a weapon
    if (termsArray[1] && removePunctuationAndToLower(termsArray[1]) != 'any') {
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
    if (termsArray[2] && removePunctuationAndToLower(termsArray[2]) != 'any') {
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
  if (debug) bot.botkit.log(itemSearchResults.length + " matches found");
  if (itemSearchResults.length === 0) { //no match
    bot.reply(message, "No item names contain that exact text.");
  } else if (itemSearchResults.length == 1) { //exactly one. Ship it.
    replyWithRecipeFor(itemSearchResults[0], message);
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
            replyWithRecipeFor(itemSearchResults[selection], message);
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

//var ascendedPrefixes = loadStaticDataFromFile('ascendedPrefix.json');

function getAscendedItemsByPrefix(prefixSearch) {
  //Where prefix is an ascended name, its equivalent prefix name, a substring thereof, or 'any'

  var possiblePrefixes = loadStaticDataFromFile("ascendedPrefixMap.json");
  //looks like:
  //{
  //"Maguuma Burl":["Tizlak's"],
  //"Marauder":["Svaard's"],
  //"Sapphire":["Tateos's","Theodosus'"]
  //  }
  for (var prefix in possiblePrefixes) {
    if (removePunctuationAndToLower(prefix).includes(prefixSearch)) {
      return possiblePrefixes[prefix];
    } else
      for (var name in possiblePrefixes[prefix])
        if (removePunctuationAndToLower(possiblePrefixes[prefix][name]).includes(prefixSearch)) {
          return [possiblePrefixes[prefix][name]];
        }
  }
  return randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", ""]);

}

function getAscendedWeight(weight) {
  //where weight is light/med/heavy/weapon or a substring thereof or 'any'
  //Maybe add some alt names for the weights. Light/lite/cloth/scholar, medium/med/leather/adventurer, heavy/hev/plate/solider
  var possibleWeights = {
    Weapon: ["weapon"],
    Light: ["light", "lite", "cloth", "scholar"],
    Medium: ["medium", "leather", "adventurer"],
    Heavy: ["heavy", "hev", "plate", "soldier"]
  }
  for (var weightName in possibleWeights) {
    for (var j in possibleWeights[weightName])
      if (removePunctuationAndToLower(possibleWeights[weightName][j]).includes(weight))
        return weightName;
  }
  return randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", ""]);
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
    if (removePunctuationAndToLower(possibleSlots[i]).includes(slotName))
      return possibleSlots[i];
  }
  return randomOneOf(["Horseshit", "Gobbeldygook", "Nonsense", "Nothing", ""]);
}

function replyWithRecipeFor(itemToMake, message) {
  var attachments = assembleRecipeAttachment(itemToMake);
  var foundRecipe = findInData('output_item_id', itemToMake.id, 'recipes');
  var amountString;
  if (foundRecipe && foundRecipe.output_item_count && foundRecipe.output_item_count > 1) { //if it's a multiple, collect multiple amount
    amountString = foundRecipe.output_item_count;
  }
  var descripFlavorized = '';
  if (itemToMake.description) {
    descripFlavorized = "\n" + replaceGWFlavorTextTags(itemToMake.description, "_");
  }
  bot.reply(message, {
    'text': itemToMake.name + (amountString ? " x " + amountString : "") + levelAndRarityForItem(itemToMake) + descripFlavorized,
    attachments: attachments,
    // 'icon_url': itemToMake.icon,
    // "username": "RecipeBot",
  }, function(err, resp) {
    if (err || debug) bot.botkit.log(err, resp);
  });
}

//For a given item, find its base ingredients and prepare an attachment displaying it
function assembleRecipeAttachment(itemToDisplay) {
  var ingredients;
  //is it a standard recipe
  if (!itemToDisplay.forged) {
    var foundRecipe = findInData('output_item_id', itemToDisplay.id, 'recipes');
    if (foundRecipe)
      ingredients = getBaseIngredients(foundRecipe.ingredients);
  } else { //mystic forge recipe. Do Not getBaseIngredients. Forge recipes that will shift the tier of the item means that most things will be reduced toa  giant pile of tier 1 ingredients
    var forgeRecipe = findInData('output_item_id', itemToDisplay.id, 'forged');
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

  if (toggle) { // display one

    var attachment = {
      color: '#000000',
      thumb_url: itemToDisplay.icon,
      fields: [],
      "fallback": itemToDisplay.name + " has " + ingredients.length + " items."
    };
    for (var i in ingredients) {
      item = findInData('id', ingredients[i].item_id, 'items');
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
//a text differentiation of items. spits out (level ## <rarity>) if eitehr of those exist
function levelAndRarityForItem(item) {
  var levelString = '';
  if (item.level) {
    levelString = item.level;
  } else if (item.description) {
    var matches = item.description.match(/level (\d{1,2})/i);
    if (debug) bot.botkit.log("matches " + JSON.stringify(matches) + " of description " + item.description);
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
  var cleanSearch = removePunctuationAndToLower(searchName).replace(/\s+/g, '');
  if (cleanSearch.length === 0) return [];
  var exactMatch = [];
  if (debug) bot.botkit.log("findCraftableItemByName: " + cleanSearch);
  for (var i in gw2nodelib.data.items) {
    var cleanItemName = removePunctuationAndToLower(gw2nodelib.data.items[i].name).replace(/\s+/g, '');
    if (cleanItemName.includes(cleanSearch)) {
      if (findInData('output_item_id', gw2nodelib.data.items[i].id, 'recipes')) {
        if (cleanItemName == cleanSearch) { //exact match cutout (for short names)
          if (debug) bot.botkit.log('exact match recipie ' + cleanSearch);
          exactMatch.push(gw2nodelib.data.items[i]);
          console.log("adding " + JSON.stringify(gw2nodelib.data.items[i]));
        }
        itemsFound.push(gw2nodelib.data.items[i]);
      }
      if (findInData('output_item_id', gw2nodelib.data.items[i].id, 'forged')) {
        var forgedItem = JSON.parse(JSON.stringify(gw2nodelib.data.items[i]));
        forgedItem.forged = true;
        if (cleanItemName == cleanSearch) { //exact match cutout (for short names)
          if (debug) bot.botkit.log('exact match forged ' + cleanSearch);
          exactMatch.push(forgedItem);
          console.log("adding " + JSON.stringify(forgedItem));

        } else itemsFound.push(forgedItem);
      } else {
        if (debug) bot.botkit.log('Found an item called ' + gw2nodelib.data.items[i].name + ' but it is not craftable');
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
    var makeableIngredient = findInData('output_item_id', ingredients[i].item_id, 'recipes');
    //special cutout for jewelry, ignore the transmog types that change tiers of gems, so we don't always see piled of the lowest tier gem
    //if it makes an upgrade component that is a gem, ignore.
    var outputItem = findInData('id', ingredients[i].item_id, 'items');
    var jewelryTransmog = makeableIngredient && outputItem && outputItem.type && outputItem.type == "UpgradeComponent" && outputItem.details && outputItem.details.type && outputItem.details.type == "Gem";

    if (!makeableIngredient || jewelryTransmog) { //if it's not made, base ingredient. Also refineable jewelry
      if (debug) bot.botkit.log(findInData('id', ingredients[i].item_id, 'items').name + " is a " + (jewelryTransmog ? "jewelry transmog" : "base ingredient")); //Ex1: 1 vial of blood
      addIngredient(baseIngredients, ingredients[i]);
    } else { //Ex1: an axe blade
      if (debug) bot.botkit.log("need " + ingredients[i].count + " of " + findInData('id', ingredients[i].item_id, 'items').name + '(' + makeableIngredient.output_item_count + ')');
      //Add parts of this sub-recipe to the ingredients list
      var ingredientsNeeded = ingredients[i].count; //How many of this sub recipe to make
      var listItem;
      if (debug) listItem = outputItem.name;
      //Check if we have any in extra ingredients
      if (debug) bot.botkit.log('see if we already have any of the ' + ingredientsNeeded + ' ' + listItem + '(s) we need');
      for (var x in extraIngredients) {
        if (debug) bot.botkit.log("we have " + extraIngredients[x].count + " " + findInData('id', extraIngredients[x].item_id, 'items').name);
        if (extraIngredients[x].item_id == makeableIngredient.output_item_id) { //we've already made some
          if (ingredientsNeeded >= extraIngredients[x].count) { //we don't have enough, add what we have to the 'made' pile
            ingredientsNeeded -= extraIngredients[x].count;
            extraIngredients.splice(x, 1); //remove the 'used' extra ingredients
            if (debug) bot.botkit.log("that was it for extra " + listItem);
          } else {
            extraIngredients[x].count -= ingredientsNeeded; //we have more than enough, subtract what we used.
            ingredientsNeeded = 0; // we need make no more
            if (debug) bot.botkit.log("had enough spare " + listItem);
          }
        }
      }
      if (ingredientsNeeded > 0) { //Do we still need to make some after our extra ingredients pass?
        var numToMake = Math.ceil(ingredientsNeeded / makeableIngredient.output_item_count); //Ex 1: need 3, makes 5 so produce once.
        if (debug) bot.botkit.log("still need " + ingredientsNeeded + " " + listItem + ". making " + numToMake);
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
    bot.botkit.log("extra pile is:");
    for (var j in extraIngredients) {
      var item2 = findInData('id', extraIngredients[j].item_id, 'items');
      if (item2)
        bot.botkit.log(extraIngredients[j].count + " " + item2.name);
      else
        bot.botkit.log('Unknown Item of id: ' + extraIngredients[j].item_id + '(' + extraIngredients[j].count + ')');
    }
  }
  return baseIngredients; //return our list of non-makeable ingredients
}

//Scour through recipes and forge recipes for output item/ingredient item ids. Return a no-duplicate list of these.
function compileIngredientIds() {
  itemsCompile = [];
  for (var t in gw2nodelib.data.recipes) {
    itemsCompile.push(gw2nodelib.data.recipes[t].output_item_id);
    for (var i in gw2nodelib.data.recipes[t].ingredients) {
      itemsCompile.push(gw2nodelib.data.recipes[t].ingredients[i].item_id);
    }
  }
  for (var f in gw2nodelib.data.forged) {
    itemsCompile.push(gw2nodelib.data.forged[f].output_item_id);
    for (var g in gw2nodelib.data.forged[f].ingredients) {
      itemsCompile.push(gw2nodelib.data.forged[f].ingredients[g].item_id);
    }
  }
  return itemsCompile;
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

////QUAGGANS
helpFile.quaggans = "fetch a list of all fetchable quaggan pictures. See help quaggan.";
helpFile.quaggan = "Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: 'quaggan box'";

controller.hears(['^quaggans$', '^quaggan$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  gw2nodelib.quaggans(function(jsonList) {
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
  var name = removePunctuationAndToLower(matches[1]);
  if (name == 'hoodieup') name = 'hoodie-up';
  if (name == 'hoodiedown') name = 'hoodie-down';
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

////ACCESS TOKEN
helpFile.access = "Set up your guild wars account to allow lessdremoth to read data. Say 'access token help' for more information.";
controller.hears(['^access token help', '^help access', '^help access token'], 'direct_message,mention,direct_message,ambient', function(bot, message) {
  bot.reply(message, "First you'll need to log in to arena net to create a token. Do so here:\nhttps://account.arena.net/applications\nRight now I only use the 'account', 'progression', and 'characters' sections.\nCopy the token, and then say \'access token <your token>\'");
  controller.storage.users.get(message.user, function(err, user) {
    if (user) {
      bot.reply(message, "Note that I already have an access token on file for you, " + user.dfid + randomHonoriffic(user.dfid, user.id) + ". You can say 'access token' with no argument and I'll refresh your token information I keep on file.");
    }
  });
});

controller.hears(['^access token(.*)'], 'direct_mention,mention,direct_message,ambient', function(bot, message) {
  //collect information about the user token and basic account info for use later.
  controller.storage.users.get(message.user, function(err, user) {
    var adressUsersAs = 'newbie';
    if (user && user.dfid)
      adressUsersAs = user.dfid + randomHonoriffic(user.dfid, user.id);
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
    gw2nodelib.tokeninfo(function(tokenInfo) {
      bot.botkit.log("access token tokenInfo fetch: " + JSON.stringify(tokenInfo));
      if (tokenInfo.error || tokenInfo.text) {
        bot.reply(message, "I got an error looking up your token and did not save it. Check the spelling and try again. You can also say 'access token' with no argument to refresh the token I have on file.");
        return;
      }
      user.permissions = tokenInfo.permissions;

      gw2nodelib.account(function(accountInfo) {
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
          user.dfid = (user.dfid ? user.dfid : removePunctuationAndToLower(user.name[0]));

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

////DUNGEON FRIENDS
var dungeonFriendsOrder = ["Ascalonian Catacombs Story", "Catacombs Explorable—Hodgins's Path", "Catacombs Explorable—Detha's Path", "Catacombs Explorable—Tzark's Path", "Caudecus's Manor Story", "Manor Explorable—Asura Path", "Manor Explorable—Seraph Path", "Manor Explorable—Butler's Path", "Twilight Arbor Story", "Twilight Explorable—Leurent's Path", "Twilight Explorable—Vevina's Path", "Twilight Explorable—Aetherpath", "Sorrow's Embrace Story", "Sorrow's Explorable—Fergg's Path", "Sorrow's Explorable—Rasolov's Path", "Sorrow's Explorable—Koptev's Path", "Citadel of Flame Story", "Citadel Explorable—Ferrah's Path", "Citadel Explorable—Magg's Path", "Citadel Explorable—Rhiannon's Path", "Honor of the Waves Story", "Honor Explorable—Butcher's Path", "Honor Explorable-Plunderer's Path", "Honor Explorable—Zealot's Path", "Crucible of Eternity Story", "Crucible Explorable—Submarine Path", "Crucible Explorable—Teleporter Path", "Crucible Explorable—Front Door Path", "Arah Explorable—Jotun Path", "Arah Explorable—Mursaat Path", "Arah Explorable—Forgotten Path", "Arah Explorable—Seer Path"];
var dungeonNames = {
  "Ascalonian Catacombs Story": "ACS",
  "Catacombs Explorable—Hodgins's Path": "AC1 Hodgins",
  "Catacombs Explorable—Detha's Path": "AC2 Detha",
  "Catacombs Explorable—Tzark's Path": "AC3 Tzark",
  "Caudecus's Manor Story": "CMS",
  "Manor Explorable—Asura Path": "CM1 Asura",
  "Manor Explorable—Seraph Path": "CM2 Seraph",
  "Manor Explorable—Butler's Path": "CM3 Butler",
  "Twilight Arbor Story": "TAS",
  "Twilight Explorable—Leurent's Path": "TAU Leurent",
  "Twilight Explorable—Vevina's Path": "TAF Vevina",
  "Twilight Explorable—Aetherpath": "TAAE Aether",
  "Sorrow's Embrace Story": "SES",
  "Sorrow's Explorable—Fergg's Path": "SE1 Fergg",
  "Sorrow's Explorable—Rasolov's Path": "SE2 Rasolov",
  "Sorrow's Explorable—Koptev's Path": "SE3 Koptev",
  "Citadel of Flame Story": "CoFS",
  "Citadel Explorable—Ferrah's Path": "CoF1 Ferrah",
  "Citadel Explorable—Magg's Path": "CoF2 Magg",
  "Citadel Explorable—Rhiannon's Path": "CoF3 Rhiannon",
  "Honor of the Waves Story": "HotWS",
  "Honor Explorable—Butcher's Path": "HotW1 Butcher",
  "Honor Explorable-Plunderer's Path": "HotW2 Plunderer",
  "Honor Explorable—Zealot's Path": "HotW3 Zealot",
  "Crucible of Eternity Story": "CoES",
  "Crucible Explorable—Submarine Path": "CoE1 Submarine",
  "Crucible Explorable—Teleporter Path": "CoE2 Teleporter",
  "Crucible Explorable—Front Door Path": "CoE3 Front Door",
  "Arah Explorable—Jotun Path": "Arah1 Jotun",
  "Arah Explorable—Mursaat Path": "Arah2 Mursaat",
  "Arah Explorable—Forgotten Path": "Arah3 Forgotten",
  "Arah Explorable—Seer Path": "Arah4 Seer"
};

helpFile.dungeonfriends = "Show a mutually undone Dungeon Frequenter list for given folks with valid access tokens. Example \'df ahrj\'";
helpFile.dungeonfriendsverbose = "Show all Dungeon Freqenter dungeons, with the given users already-done dungeons tagged. Example \'dfv ahrj\'";
helpFile.df = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriends);
helpFile.dfv = "alias for dungeonfriends. " + JSON.stringify(helpFile.dungeonfriendsverbose);

controller.hears(['^dungeonfriends(.*)', '^df(.*)', '^dungeonfriendsverbose(.*)', '^dfv(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }

  //get dungeon frequenter achievement
  var dungeonFrequenterCheevo = findInData('name', 'Dungeon Frequenter', 'achievements');
  if (!dungeonFrequenterCheevo) {
    bot.reply(message, "I couldn't find the Dungeon Frequenter achievement in my loaded data. Try 'db reload'.");
    return;
  }

  //Ready to start. Setup variables
  var num = 0;
  var goodUsers = [];
  var individualBitsArrays = {};

  var matches = message.text.match(/(dungeonfriends(?:verbose)?|dfv?)(?: (\w+)$)?/i);

  var verbose = false;
  if (matches && (matches[1].toLowerCase() == 'dfv' || matches[1].toLowerCase() == 'dungeonfriendsverbose'))
    verbose = true;

  //once all users are loaded, correlate their dungeon frequenter availability.
  var dungeonfriendsCallback = function(jsonData, headers) {
    var name;

    //save this user's individual bits and name
    for (var z in goodUsers) {
      if (headers && headers.options && headers.options.access_token && headers.options.access_token == goodUsers[z].access_token && goodUsers[z].name) {
        name = goodUsers[z].name;
        if (jsonData.error || jsonData.text) {
          bot.reply(globalMessage, "I got an error looking up the data for " + name + ". They will be omitted from the results.");
          //no need to exit. it will find nothing in jsonData and exit, unless this is the last one, then it will assemble the report.
          goodUsers[z].error = true;
        }
        break;
      }
    }

    //each fetched user: peel out frequenter achievement, add the bits to our common bits array
    for (var c in jsonData) {
      if (jsonData[c].id && jsonData[c].id == dungeonFrequenterCheevo.id && jsonData[c].bits && jsonData[c].bits.length > 0) {
        if (name) individualBitsArrays[name] = jsonData[c].bits;
        break;
      }

    }
    //after all users are done, spit out report
    if (++num == goodUsers.length) {
      //get a list of all applicable dungeons, tag each with the names of those who have done it
      var textList = [];
      for (var achievement in dungeonFrequenterCheevo.bits) { //for each bit, see if the account has that corresponding bit marked as done in their list
        if (dungeonFrequenterCheevo.bits[achievement].text) { // almost always exists, but you never know.
          var nameList = [];
          for (var memberName in individualBitsArrays) {
            for (var bit in individualBitsArrays[memberName]) //go through account bits and see if they've done the one we're looking at now 
              if (individualBitsArrays[memberName][bit] == achievement) { //they have, add to list
              nameList.push(memberName);
            }
          }
          if (verbose || nameList.length === 0) { //Add this dingeon to the list if we're in verbose mode (always show) or noone has done it and it's a candidate to do
            var textMain = dungeonFrequenterCheevo.bits[achievement].text; //name of the dungeon
            var textPost = '';
            if (nameList.length > 0) { //non verbose mode will simply have no names appended
              textPost += ' (' + nameList.join(", ");
              textPost += ')';
            }
            textPost += '\n';
            textList.push({ //stored this way so we can sort by name later
              text: textMain,
              textPost: textPost
            });
          }
        }
      }

      var acceptableQuaggans = [
        "https://static.staticwars.com/quaggans/party.jpg",
        "https://static.staticwars.com/quaggans/cheer.jpg",
        "https://static.staticwars.com/quaggans/lost.jpg",
        "https://static.staticwars.com/quaggans/breakfast.jpg"
      ];

      textList.sort(dungeonFrendSort);
      var text = '';

      for (var r in textList) {
        if (verbose)
          text += dungeonNames[textList[r].text] + textList[r].textPost;
        else
          text += textList[r].text + textList[r].textPost;
        if (textList[r].text[0] == "H")
          acceptableQuaggans.push("https://static.staticwars.com/quaggans/killerwhale.jpg");
      }

      acceptableQuaggans = arrayUnique(acceptableQuaggans);
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
      var half = Math.ceil(textList.length / 2);
      for (var s = 0; s < half; s++) {
        fieldsFormatted.push({
          "value": dungeonNames[textList[s].text] + textList[s].textPost,
          "short": true
        });
        if ((s + half) < textList.length)
          fieldsFormatted.push({
            "value": dungeonNames[textList[(s + half)].text] + textList[(s + half)].textPost,
            "short": true
          });
      }

      var attachments = [];
      var attachment = { //assemble attachment
        title: "Dungeon Friend Report",
        fallback: "Dungeon Friend Report",
        color: '#000000',
        thumb_url: randomOneOf(acceptableQuaggans),
        fields: fieldsFormatted,
      };
      attachments.push(attachment);
      bot.reply(globalMessage, {
        text: "Party: " + pretextString + ".",
        attachments: attachments,
      }, function(err, resp) {
        if (err || debug) bot.botkit.log(err, resp);
      });

      globalMessage = '';
    }
  };

  //fetch access tokens from storage
  controller.storage.users.all(function(err, userData) {

    var requesterName = '';
    for (var u in userData) {
      //remove those without permissions
      if (userData[u].access_token && userHasPermission(userData[u], 'account') && userHasPermission(userData[u], 'progression')) {
        goodUsers.push(userData[u]);
        if (userData[u].id == message.user)
          requesterName = "Okay, " + userData[u].dfid + randomHonoriffic(userData[u].dfid, userData[u].id) + ". ";
      }
    }
    //goodUsers is now a list of users with good access tokens
    bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for dungeonfriends.");

    var selectedUsers = [];
    for (var c in goodUsers) {
      if (matches[2] && matches[2].indexOf(goodUsers[c].dfid) > -1)
        selectedUsers.push(goodUsers[c]);
    }

    //If no user id argument or only invalid arguments, print list and return
    if (!matches[2] || selectedUsers.length < 1) {
      var replyString = '';
      for (var k in goodUsers) {
        replyString += '\n' + goodUsers[k].dfid + ': ' + goodUsers[k].name;
      }
      bot.reply(message, requesterName + "Here's a list of eligible dungeon friends. You can see a report by string together their codes like 'df rsja'." + replyString + '\nTry df <string> again.');
      return;
    }

    //remove doubles
    selectedUsers = arrayUnique(selectedUsers);

    var adjective = 'rump ';
    if (selectedUsers.length > 5) adjective = 'completely invalid super';
    else if (selectedUsers.length == 5) adjective = 'full ';
    bot.reply(message, requesterName + "Fetching info for a " + adjective + "group of " + selectedUsers.length + ".");
    goodUsers = selectedUsers;
    globalMessage = message;
    for (var g in goodUsers) {
      gw2nodelib.accountAchievements(dungeonfriendsCallback, {
        access_token: goodUsers[g].access_token
      }, true);
    }

  });
});

function dungeonFrendSort(a, b) {
  return dungeonFriendsOrder.indexOf(a.text) - dungeonFriendsOrder.indexOf(b.text);
}

//find an achievement in the freshly fetched account achievements by id
function findInAccount(id, accountAchievements) {
  for (var t in accountAchievements) {
    if (accountAchievements[t].id == id) {
      return accountAchievements[t];
    }
  }
}

////ACHIEVEMENTS
helpFile.cheevo = "Display a report of several types of achievements. Example \'cheevo dungeonfrequenter\'.\nI know about " + Object.keys(cheevoList).length + " achievements and categories.";
helpFile.cheevor = "Display a random achievement from a category, or random part of an achievement. Use as a suggestion for what to do next.";
helpFile.cheevof = "Display a 'full' achievement. If you choose an achievement (not a category), displays tiers, and rewards.";
controller.hears(['^cheevo(.*)', '^cheevor(.*)', '^cheevof(.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  //precheck: account achievements loaded 
  if (!achievementsLoaded || !achievementsCategoriesLoaded) {
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }
  //fetch access token from storage
  controller.storage.users.get(message.user, function(err, user) {
    if (err) {
      bot.reply(message, "I got an error loading your data. Try again later");
      bot.botkit.log("Error:cheevo no user data " + JSON.stringify(err));
      return;
    }
    var lookupSass = [
      'let me get right on that for you.',
      'I am sworn to look up your achievements.',
      "I'll check.",
      "let's do this.",
      "I'm on it.",
      "I guess I can."
    ];
    bot.reply(message, "Okay, " + user.dfid + randomHonoriffic(user.dfid, user.id) + ", " + randomOneOf(lookupSass));

    //precheck - input scrub a bit
    var matches = removePunctuationAndToLower(message.text).match(/(cheevor|cheevof|cheevo)\s?([\s\w]*)$/i);
    if (!matches || !matches[2]) {
      bot.reply(message, "I didn't quite get that. Maybe ask \'help " + (isRandom ? 'cheevor' : 'cheevo') + "\'?");
      return;
    }
    var isRandom = matches[1] == 'cheevor';
    var isFull = matches[1] == 'cheevof';

    //precheck: access token.
    if (!user || !user.access_token || !userHasPermission(user, 'account')) {
      bot.botkit.log('ERROR: cheevo no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'account') ? "with correct 'account' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    //precheck: account acievements
    gw2nodelib.accountAchievements(function(accountAchievements) {
      if (accountAchievements.text || accountAchievements.error) {
        bot.reply(message, "Oops. I got an error when asking for your achievements.\nTry again later, it'll probably be fine.");
        bot.botkit.log("Account fetch error for user " + message.user + "." + (accountAchievements.text ? " Text:" + accountAchievements.text : '') + (accountAchievements.error ? "\nError:" + accountAchievements.error : ''));
        return;
      }
      cheevoSearchString = matches[2].replace(/\s+/g, '');
      //Look up the string.
      var cheevoToDisplay; //try a loop with contains
      var possibleMatches = [];
      var exactMatches = [];
      for (var c in gw2nodelib.data.achievementsCategories) {
        var cheeCat = gw2nodelib.data.achievementsCategories[c];
        if (cheeCat.name) {
          var cleanCat = removePunctuationAndToLower(cheeCat.name).replace(/\s+/g, '');
          if (cleanCat == cheevoSearchString) {
            exactMatches.push(cheeCat);
            break;
          } else if (cleanCat.includes(cheevoSearchString))
            possibleMatches.push(cheeCat);
        }
      }
      for (var ch in gw2nodelib.data.achievements) {
        var chee = gw2nodelib.data.achievements[ch];
        if (chee.name) {
          var cleanChee = removePunctuationAndToLower(chee.name).replace(/\s+/g, '');
          if (cleanChee == cheevoSearchString) {
            exactMatches.push(chee);
            break;
          } else if (cleanChee.includes(cheevoSearchString))
            possibleMatches.push(chee);
        }
      }
      if (exactMatches.length > 0) //cutout for categories or achievements with exact names.
        possibleMatches = exactMatches;
      if (possibleMatches.length < 1) {
        bot.reply(message, "No Achievements or Achievement Categories contain that phrase.  ¯\\_(ツ)_/¯");
        return;
      } else if (possibleMatches.length == 1) {
        globalMessage = message;
        if (possibleMatches[0].achievements)
          displayCategoryCallback(accountAchievements, possibleMatches[0]);
        else
          lookupCheevoParts(accountAchievements, possibleMatches[0], isFull, (isRandom ? displayRandomCheevoCallback : displayCheevoCallback));
      } else if (possibleMatches.length > 10) {
        var itemNameList = [];
        for (var n in possibleMatches)
          itemNameList.push(possibleMatches[n].name);
        bot.reply(message, {
          attachments: {
            attachment: {
              fallback: 'Too many achievements found in search.',
              text: "Woah. I found " + possibleMatches.length + ' achievements. Get more specific.\n' + itemNameList.join("\n")
            }
          }
        });
      } else {
        bot.startConversation(message, function(err, convo) {
          var askNum = 2;
          var listofItems = '';
          for (var i in possibleMatches) {
            var descString = '';
            if (possibleMatches[i].requirement) {
              descString = possibleMatches[i].requirement;
            } else if (possibleMatches[i].description) {
              descString = possibleMatches[i].description;
            } else if (possibleMatches[i].achievements) {
              descString = 'Category with ' + possibleMatches[i].achievements.length + ' achievements.';
            }
            if (descString.length > 32) {
              descString = descString.slice(0, 32);
              descString += '...';
            }

            listofItems += '\n' + [i] + ": " + possibleMatches[i].name + (descString ? " - " + descString : '');
          }
          convo.ask('I found multiple achievements with that name. Which number you mean? (say no to quit)' + listofItems, [{
            //number, no, or repeat
            pattern: new RegExp(/^(\d{1,2})/i),
            callback: function(response, convo) {
              //if it's a number, and that number is within our search results, print it
              var matches = response.text.match(/^(\d{1,})/i);
              var selection = matches[0];
              if (selection < possibleMatches.length) {
                globalMessage = convo;
                if (possibleMatches[selection].achievements)
                  displayCategoryCallback(accountAchievements, possibleMatches[selection]);
                else
                  lookupCheevoParts(accountAchievements, possibleMatches[selection], isFull, (isRandom ? displayRandomCheevoCallback : displayCheevoCallback));
              } else if (askNum-- > 0) {
                convo.say("Choose a valid number.");
                convo.repeat();
              } else
                convo.say("Oh well.");
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
              if (askNum-- > 0) {
                convo.say("Choose a number of the achievement you'd like to see.");
                convo.repeat();
              } else
                convo.say("Be serious.");
              convo.next();
            }
          }]);
        });
      }
      //        globalMessage = null;
    }, {
      access_token: user.access_token
    }, true);
  });
});

//must be a category Just pick a cheevo at random from the category
function displayRandomCheevoCallback(accountAchievements, cheevoToDisplay) {
  var randomNum;
  var alreadyDone = true;
  var acctCheevo;
  if (cheevoToDisplay.achievements) { //choose random achievement from sub category
    //keep picking until we find one the user has not done.
    acctCheevo = findInAccount(cheevoToDisplay.achievements[randomNum], accountAchievements);
    while (alreadyDone) {
      randomNum = Math.floor(Math.random() * cheevoToDisplay.achievements.length);
      if (!acctCheevo || !acctCheevo.done || acctCheevo.current < acctCheevo.max) {
        alreadyDone = false;
      }
    }
    var randomCheevo = findInData('id', cheevoToDisplay.achievements[randomNum], 'achievements'); //find the achievement to get the name
    //replace descriptions ending in periods with exclamation points for MORE ENTHSIASM
    var desc = randomCheevo.description.replace(/(\.)$/, '');
    desc += '!';
    var url = "http://wiki.guildwars2.com/wiki/" + randomCheevo.name.replace(/\s/g, "_");
    replyWith("Go do '" + randomCheevo.name + "'." + (desc.length > 1 ? "\n" + desc : '') + "\n" + url);
  } else if (cheevoToDisplay.bits) { //choose random part of an achievement
    acctCheevo = findInAccount(cheevoToDisplay.id, accountAchievements);
    while (alreadyDone) {
      randomNum = Math.floor(Math.random() * cheevoToDisplay.bits.length);
      if (!acctCheevo || !acctCheevo.bits) {
        alreadyDone = false;
      } else {
        for (var bit in acctCheevo.bits) { //go through account bits and see if they've done the one we've randoed
          if (acctCheevo.bits[bit] == randomNum)
            alreadyDone = false;
        }
      }
    }
    replyWith("Go forth and get...\n" + displayAchievementBit(cheevoToDisplay.bits[randomNum]), false);
  } else {
    replyWith("Sorry, that particular achievement has no parts to randomly choose from.\n...from which to randomly choose. Whatever.");
  }
}

function displayCategoryCallback(accountAchievements, categoryToDisplay) {

  //go through each achievement in the category, get name, if done by user: sum progress
  var numDone = 0;
  var totalAchievements = categoryToDisplay.achievements.length;
  var partsCurrentSum = 0;
  var partsMaxSum = 0;
  var achievementTextList = [];
  for (var a in categoryToDisplay.achievements) {
    var gameAchievement = findInData('id', categoryToDisplay.achievements[a], 'achievements');
    if (!gameAchievement) { //if we don't have the game data, skip it
      achievementTextList.push("No Achievement found in data - id  " + categoryToDisplay.achievements[a]);
      continue;
    }
    var name = 'Nameless Achievement';
    var doneProgress = '';
    var repeat = '';
    if (gameAchievement.name) name = gameAchievement.name;
    var acctCheevo = findInAccount(categoryToDisplay.achievements[a], accountAchievements);
    if (acctCheevo && typeof acctCheevo.current == 'number' && typeof acctCheevo.max == 'number') {
      if (typeof acctCheevo.repeated == 'number' && acctCheevo.repeated > 0) {
        repeat = " (repeated " + (acctCheevo.repeated > 1 ? acctCheevo.repeated + " times" : 'once') + ")";
        //on a repeat, add to the total as if we've done it once, despite current progress
        partsCurrentSum += acctCheevo.max;
      } else {
        //otehrwise, add our current progress to it.
        partsCurrentSum += acctCheevo.current;
      }
      partsMaxSum += acctCheevo.max;
      doneProgress = " - " + acctCheevo.current + "/" + acctCheevo.max;
      if (acctCheevo.done || repeat.length > 0) {
        numDone++;
        if (typeof acctCheevo.repeated != 'number' || acctCheevo.repeated <= 0) //append 'done' if we're not mid-repeat.
          doneProgress += ' (Done)';
      }
    } else //not done/progressed, add highest tier count as a 'max' and show 0 of that amount
    if (gameAchievement.tiers) {
      var tierMax = gameAchievement.tiers[gameAchievement.tiers.length - 1].count;
      doneProgress = " - 0/" + tierMax;
      partsMaxSum += tierMax;
    }

    achievementTextList.push(name + doneProgress + repeat);
  }
  var pretext = '';
  var fields = [];

  title = categoryToDisplay.name + " Report";
  if (partsCurrentSum > 0)
    fields.push({
      title: "Total" + (numDone + totalAchievements > 0 ? ': ' + numDone + ' of ' + totalAchievements : ''),
      value: "You've done " + partsCurrentSum + " out of " + partsMaxSum + " parts (" + Math.floor(partsCurrentSum / partsMaxSum * 100) + "%).\nRepeats count as their max value."
    });


  attachment = {};
  attachment = { //assemble attachment
    fallback: title,
    pretext: pretext,
    //example: Dungeon Frequenter Report 5 of 8 - Done 4 times
    title: title,
    color: '#AA129F',
    thumb_url: (categoryToDisplay.icon ? categoryToDisplay.icon : "https://wiki.guildwars2.com/images/d/d9/Hero.png"),
    fields: fields,
    text: achievementTextList.join('\n')
  };
  replyWith({
    text: '',
    attachments: {
      attachment: attachment
    }
  });
}

function lookupCheevoParts(accountAchievements, cheevoToDisplay, isFull, callback) {

  var skinsToFetch = [];
  var titlesToFetch = [];
  var minisToFetch = [];
  var itemsToFetch = [];

  var searchList = [];
  if (typeof cheevoToDisplay.bits != 'undefined')
    searchList = searchList.concat(cheevoToDisplay.bits);
  if (typeof cheevoToDisplay.rewards != 'undefined')
    searchList = searchList.concat(cheevoToDisplay.rewards);
  //collate list of things to fetch
  for (var b in searchList) {
    if (searchList[b].id) {
      var searchId = searchList[b].id;
      switch (searchList[b].type) {
        case "Skin":
          skinsToFetch.push(searchId);
          break;
        case "Title":
          titlesToFetch.push(searchId);
          break;
        case "Minipet":
          minisToFetch.push(searchId);
          break;
        case "Item":
          itemsToFetch.push(searchId);
      }
    }
  }
  if (debug) console.log(skinsToFetch.length + " skins to fetch\n" +
    titlesToFetch.length + " titles to fetch\n" +
    minisToFetch.length + " minis to fetch\n" +
    itemsToFetch.length + " items to fetch");
  Promise.all([gw2nodelib.promise.skins(skinsToFetch), gw2nodelib.promise.titles(titlesToFetch), gw2nodelib.promise.minis(minisToFetch), gw2nodelib.promise.items(itemsToFetch)]).then(function(results) {
    fetchFreshData = results;
    callback(accountAchievements, cheevoToDisplay, isFull);
  });
}

function displayCheevoCallback(accountAchievements, cheevoToDisplay, isFull) {
  //setup all but the bits
  var pretext = '';
  var acctCheevo = findInAccount(cheevoToDisplay.id, accountAchievements);
  var currentPartsDone = 0;

  //max is the count of the highest tier, not just the sum ob the bits.
  var maxParts = (cheevoToDisplay.tiers && cheevoToDisplay.tiers[cheevoToDisplay.tiers.length - 1].count > 1 ? cheevoToDisplay.tiers[cheevoToDisplay.tiers.length - 1].count : 0);
  var repeat = '';
  if (acctCheevo) {
    if (typeof acctCheevo.current == 'number') currentPartsDone = acctCheevo.current;
    if (typeof acctCheevo.max == 'number') maxParts = acctCheevo.max;
    if (typeof acctCheevo.repeated == 'number' && acctCheevo.repeated > 0) repeat = ", repeated " + (acctCheevo.repeated > 1 ? acctCheevo.repeated + " times" : 'once');
  }
  var title = cheevoToDisplay.name + " Report";
  var text = '';

  //Load bits to desplay into data first.
  var cheevoBits = [];
  for (var b in cheevoToDisplay.bits) {
    var doneFlag = false;
    if (acctCheevo && acctCheevo.bits) {
      if (acctCheevo.bits.indexOf(Number(b)) >= 0) {
        doneFlag = true;
      }
    }
    cheevoBits.push(displayAchievementBit(cheevoToDisplay.bits[b], doneFlag));
  }
  var fields = [];

  var totalString = '';
  if (maxParts > 1)
    totalString = "Total: " + currentPartsDone + ' of ' + maxParts + " (" + (Math.floor(currentPartsDone / maxParts * 100) > 100 ? '100' : Math.floor(currentPartsDone / maxParts * 100)) + "%)" + repeat;
  else
    totalString = (acctCheevo && acctCheevo.done ? "" : "Not ") + "Complete" + repeat;
  var summaryField = {
    title: totalString,
    value: ''
  };

  if (cheevoToDisplay.description.length > 0)
    summaryField.value += "\nDescription: " + replaceGWFlavorTextTags(cheevoToDisplay.description);
  if (cheevoToDisplay.requirement.length > 0)
    summaryField.value += "\nRequirement: " + replaceGWFlavorTextTags(cheevoToDisplay.requirement);

  fields.push(summaryField);

  if (cheevoToDisplay.tiers && isFull) { //there's aways a tiers, but whatever.
    var tierField = {
      title: 'Tiers',
      value: '#\tPoints'
    };
    for (var tier in cheevoToDisplay.tiers) {
      tierField.value += '\n' + cheevoToDisplay.tiers[tier].count + "\t" + cheevoToDisplay.tiers[tier].points;
    }

    fields.push(tierField);
  }

  if (cheevoToDisplay.rewards && isFull) {
    var rewardField = {
      title: "Rewards",
      value: ""
    };
    for (var reward in cheevoToDisplay.rewards) {
      rewardField.value += '\n' + displayAchievementBit(cheevoToDisplay.rewards[reward]);
    }
    fields.push(rewardField);
  }

  if (!toggle) {
    //raw data for debug
    fields.push({
      title: "Raw Cheevo",
      value: JSON.stringify(cheevoToDisplay)
    });
    //raw data for debug
    fields.push({
      title: "Raw Progress",
      value: (acctCheevo ? JSON.stringify(acctCheevo) : "Not done")
    });
  }

  attachment = {};
  attachment = { //assemble attachment
    fallback: title,
    pretext: pretext,
    //example: Dungeon Frequenter Report 5 of 8 - Done 4 times
    title: title,
    color: '#F0AC1B',
    thumb_url: getIconForParentCategory(cheevoToDisplay),
    fields: fields,
    text: text + "\n" + cheevoBits.join('\n')
  };
  replyWith({
    text: '',
    attachments: {
      attachment: attachment
    }
  });

}

function getIconForParentCategory(cheevo) {
  if (cheevo.icon) return cheevo.icon;
  else {
    for (var cat in gw2nodelib.data.achievementsCategories) {
      if (gw2nodelib.data.achievementsCategories[cat].achievements.indexOf(cheevo.id) >= 0 && gw2nodelib.data.achievementsCategories[cat].icon)
        return gw2nodelib.data.achievementsCategories[cat].icon;
    }
  }
  //default
  return "https://wiki.guildwars2.com/images/d/d9/Hero.png";
}

var fetchFreshData = []; //filled by promise fetch in Display cheevo call back
function displayAchievementBit(bit, doneFlag, data) {

  //covers achievement bits and rewards. Rewards have a count
  //Types are:
  //Text: simple text
  //Item and id {"type":"Item","id":78252,"count":1}
  //Coins: a count of coins (in copper) {"type":"Coins","count":50000}]}
  //mastery Tyria or maguuma {"type": "Mastery","region": "Tyria"}
  //Skin and id (no count) {"type": "Skin","id": 208}
  //Minipet and id (no count) {"type": "Minipet","id": 12}

  var skinData = fetchFreshData[0];
  var titleData = fetchFreshData[1];
  var miniData = fetchFreshData[2];
  var itemData = fetchFreshData[3];

  if (bit.type == 'Text')
    return bit.text + (doneFlag ? " - DONE" : '');
  else if (bit.type == 'Coins') {
    var gold = Math.floor(bit.count / 10000);
    var silver = Math.floor((bit.count % 10000) / 100);
    var copper = Math.floor(bit.count % 100);
    return "Coins: " + (gold > 0 ? gold + 'g ' : '') + (silver > 0 ? silver + 's ' : '') + (copper > 0 ? copper + 'c ' : '');
  } else if (bit.type == 'Mastery')
    return bit.region + " " + bit.type;
  else if (bit.type == 'Item') {
    var foundItem;
    for (var it in itemData) {
      if (bit.id == itemData[it].id) {
        foundItem = itemData[it];
        break;
      }
    }
    var itemType = ''; //weapon, armor, bag, etc
    if (foundItem && foundItem.type) {
      itemType = " (" + foundItem.type;
      if (foundItem.type != 'Container' && foundItem.details && foundItem.details.type) itemType += ": " + (foundItem.details.weight_class ? foundItem.details.weight_class + " " : "") + foundItem.details.type;
      itemType += ")";
      return foundItem.name + itemType + (bit.count && bit.count > 1 ? ', ' + bit.count : '') + (doneFlag ? " - DONE" : '');
    } else {
      return "Unknown item: " + bit.id;
    }
  } else if (bit.type == 'Skin') {
    var foundSkin;
    for (var sk in skinData) {
      if (bit.id == skinData[sk].id) {
        foundSkin = skinData[sk];
        break;
      }
    }
    if (foundSkin) {
      var type = (foundSkin.details ? foundSkin.details.type : foundSkin.type);
      var weight = (foundSkin.details && foundSkin.details.weight_class ? foundSkin.details.weight_class : '');
      return foundSkin.name + " (" + (weight.length > 0 ? weight + " " : "") + type + " skin)" + (doneFlag ? " - DONE" : '');
    } else {
      return "Unknown skin: " + bit.id;
    }
  } else if (bit.type == 'Title') {
    var foundTitle;
    for (var ti in titleData) {
      if (bit.id == titleData[ti].id) {
        foundTitle = titleData[ti];
        break;
      }
    }
    if (foundTitle) {
      var cheevoName = 'unknown achievement';
      var foundCheevo = findInData('id', foundTitle.achievement, 'achievements');
      if (foundCheevo) cheevoName = foundCheevo.name;
      return foundTitle.name + " (Title from " + cheevoName + ")";
    } else {
      return "Unknown title: " + bit.id;
    }
  } else if (bit.type == 'Minipet') {
    var foundMini;
    for (var mi in miniData) {
      if (bit.id == miniData[mi].id) {
        foundMini = miniData[mi];
        break;
      }
    }
    if (foundMini) {
      return foundMini.name;
    } else {
      return "Unknown Minipet: " + bit.id;
    }
  } else return bit.type + ': ' + bit.id + (doneFlag ? " - DONE" : '');
}

////DAILIES
helpFile.daily = "Prints a report of the daily achievements for today and tomorrow.";
helpFile.today = "Prints a report of the daily achievements for today.";
helpFile.tomorrow = "Prints a report of the daily achievements for tomorrow.";
controller.hears(['^daily$', '^today$', '^tomorrow$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  if (!achievementsLoaded) { //still loading
    bot.reply(message, "I'm still loading achievement data. Please check back in a couple of minutes. If this keeps happening, try 'db reload'.");
    return;
  }

  var printToday = true;
  var printTomorrow = true;
  var doneToday = false;
  var doneTomorrow = false;
  if (message.text.toLowerCase() == 'today') {
    printTomorrow = false;
    doneTomorrow = true;
  }
  if (message.text.toLowerCase() == 'tomorrow') {
    printToday = false;
    doneToday = true;
  }
  var levelEightiesOnly = function(arrayItem) {
    return arrayItem.level.max == 80;
  };

  var todayPvEs;
  var tomorrowPvEs;
  var dailiesCallback = function(dailyList, header) {
    if (header.options.day == 'today') {
      todayPvEs = dailyList.pve.filter(levelEightiesOnly);
      doneToday = true;
    } else if (header.options.day == 'tomorrow') {
      tomorrowPvEs = dailyList.pve.filter(levelEightiesOnly);
      doneTomorrow = true;
    }

    if (doneTomorrow && doneToday) {
      var fieldsFormatted = [];
      if (printToday) {
        fieldsFormatted.push({
          "title": "Today's Daily Achievements",
          //"value": day.name,
          "short": false
        });
        for (var d in todayPvEs) {
          var day = findInData('id', todayPvEs[d].id, 'achievements');
          var dayLabel;
          if (day && day.name) {
            dayLabel = day.name;
            if (todayPvEs[d].required_access.length == 1)
              dayLabel += (todayPvEs[d].required_access[0] == 'GuildWars2' ? ' (Old World)' : ' (HoT)');
          } else dayLabel = "Nameless Achievement - id  " + todayPvEs[d].id;
          fieldsFormatted.push({
            //            "title": ,
            "value": dayLabel,
            "short": false
          });
        }
      }
      if (printTomorrow) {
        fieldsFormatted.push({
          "title": "Tomorow's Daily Achievements",
          //"value": day.name,
          "short": false
        });

        for (var t in tomorrowPvEs) {
          var morrow = findInData('id', tomorrowPvEs[t].id, 'achievements');
          var morrowLabel;
          if (morrow && morrow.name) {
            morrowLabel = morrow.name;
            if (tomorrowPvEs[t].required_access.length == 1)
              morrowLabel += (tomorrowPvEs[t].required_access[0] == 'GuildWars2' ? ' (Old World)' : ' (HoT)');
          } else morrowLabel = "Nameless Achievement - id " + tomorrowPvEs[t].id;
          fieldsFormatted.push({
            "value": morrowLabel,
            "short": false
          });

        }
      }

      var attachments = [];
      var attachment = { //assemble attachment
        fallback: 'Daily Achievements',
        color: '#000000',
        thumb_url: "https://wiki.guildwars2.com/images/1/14/Daily_Achievement.png",
        fields: fieldsFormatted,
      };
      attachments.push(attachment);
      bot.reply(message, {
        attachments: attachments,
      }, function(err, resp) {
        if (err || debug) bot.botkit.log(err, resp);
      });
    }
  };

  if (printToday)
    gw2nodelib.dailies(dailiesCallback, {
      day: 'today'
    }, true);
  if (printTomorrow)
    gw2nodelib.dailiesTomorrow(dailiesCallback, {
      day: 'tomorrow'
    }, true);

});

////CHARACTERS
helpFile.deaths = "Display a report of characters on your account, and their career deaths.";
helpFile.characters = 'Alias for character deaths. ' + JSON.stringify(helpFile.characterDeaths);
controller.hears(['^deaths$', '^characters$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
    if (!user || !user.access_token || !userHasPermission(user, 'characters')) {
      bot.botkit.log('ERROR: characters: no access token: ' + JSON.stringify(user) + "err: " + JSON.stringify(err));
      bot.reply(message, "Sorry, I don't have your access token " + (user && user.access_token && !userHasPermission(user, 'characters') ? "with correct 'characters' permissions " : "") + "on file. Direct message me the phrase \'access token help\' for help.");
      return;
    }
    gw2nodelib.characters(function(jsonList) {
      if (jsonList.text || jsonList.error) {
        bot.reply(message, "Oops. I got this error when asking about characters: " + (jsonList.text ? jsonList.text : jsonList.error));
      } else {
        bot.reply(message, "I found " + Object.keys(jsonList).length + ' characters, ' + user.dfid + randomHonoriffic(user.dfid, user.id));
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
            value: jsonList[n].name + '\n' + (jsonList[n].race == 'Charr' ? 'Filthy Charr' : jsonList[n].race) + ' ' + jsonList[n].profession,
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

////PREFIX
helpFile.prefix = "Takes three arguments.\nOne: Returns a list of all item prefixes and their stats that contain that string.\nTwo (Optional):The character level at which the suffix is available. Note that level 60 prefixes start to show up on weapons (only) at level 52.\nThree (Optional): Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but 'a' will be all.\nExamples: 'prefix berzerker' 'prefix pow gem' 'prefix pow 22 asc'";
helpFile.suffix = "Alias for prefix. " + JSON.stringify(helpFile.prefix);
var prefixData = loadStaticDataFromFile('prefix.json');
controller.hears(['^prefix (.*)', '^suffix (.*)'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var matches = message.text.match(/(prefix|suffix) (['\w]+)\s?(\d{1,2})?\s?(\w*)$/i);
  if (!matches) {
    bot.reply(message, 'No match. Ask me "help prefix" for formatting help.');
  } else {
    var name = (matches[2] ? matches[2].trim() : "");
    var level = matches[3] || null;
    var type = (matches[4] ? matches[4].trim() : "");
    name = removePunctuationAndToLower(name);
    type = scrubType(removePunctuationAndToLower(type));
    var prefixes = prefixSearch(name, type, level);
    if (!prefixes || (Object.keys(prefixes).length) < 1)
      bot.reply(message, 'No' + (level ? ' level ' + level : '') + ' match for \'' + name + '\' of type \'' + type + '\'. Misspell? Or maybe search all.');
    else {
      bot.reply(message, printPrefixes(prefixes));
    }
  }
});

//Prefix data looks like
//name = {"type": "standard", "stats": ["Little", "Yellow", "Different"] }
//Stringify a list of prefix data with its associated 'stats' with newline
function printPrefixes(prefixes) {
  var outMessage = "";
  for (var key in prefixes) {
    outMessage += key + ": " + prefixes[key].stats.join(", ") + "\n";
  }
  return outMessage;
}

//Make sure the incoming string is 'standard', 'gem' 'all' or 'ascended'
function scrubType(type) {
  if (!type || type.length === 0) return 'standard';
  else if ('gem'.startsWith(type)) return 'gem';
  else if ('all'.startsWith(type)) return 'all';
  else if ('ascended'.startsWith(type)) return 'ascended';
  else return 'standard';
}

//Search the prfix data for searchTerm and type type
function prefixSearch(searchTerm, type, level) {
  var prefixList = {};
  type = scrubType(type);
  if (debug) bot.botkit.log("searching " + searchTerm + " of type " + type + " and level " + level);
  findPrefixesByStat(searchTerm, type, prefixList);
  filterPrefixesByLevel(prefixList, (level ? level : 80));
  findPrefixByName(searchTerm, prefixList);
  return prefixList;
}

//Search given prefix data for matching name
function findPrefixByName(name, prefixList) {
  for (var key in prefixData) {
    var compare = removePunctuationAndToLower(key);
    if (prefixData.hasOwnProperty(key) && compare.indexOf(name) > -1) { // && (type == 'all' || prefixData[key].type == type)) {
      if (debug) bot.botkit.log("added key from name " + key);
      prefixList[key] = prefixData[key];
    }
  }
  if (debug) bot.botkit.log("Total after ByName search " + Object.keys(prefixList).length);
}

//Search given prefix data for matching stat
function findPrefixesByStat(stat, type, prefixList) {
  for (var key in prefixData) {
    if (prefixData.hasOwnProperty(key) && (type == 'all' || prefixData[key].type == type)) {
      for (var subKey in prefixData[key].stats) {
        var compare = removePunctuationAndToLower(prefixData[key].stats[subKey]);
        if (debug) bot.botkit.log("subkey " + prefixData[key].stats[subKey]);
        if (compare.indexOf(stat) === 0) {
          if (debug) bot.botkit.log("added key from stat " + key);
          prefixList[key] = prefixData[key];
          break;
        }
      }
    }
  }
  if (debug) bot.botkit.log("Total after ByStat search " + Object.keys(prefixList).length);
}

function filterPrefixesByLevel(prefixList, level) {
  for (var i in prefixList) {
    if (level < prefixList[i].minlevel || level > prefixList[i].maxlevel)
      delete prefixList[i];
  }
}

////PROFESSION REPORT
helpFile.professionReport = "Collate all known accounts characters by profession";
helpFile.pr = "Alias for professionReport. " + JSON.stringify(helpFile.professionReport);
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
          bot.reply(globalMessage, "I got an error looking up the data for " + name + ". They will be omitted from the results.");
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

      acceptableQuaggans = arrayUnique(acceptableQuaggans);

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
        thumb_url: randomOneOf(acceptableQuaggans),
        fields: fieldsFormatted,
      };
      attachments.push(attachment);
      bot.reply(globalMessage, {
        text: "Collating the professions of: " + pretextString + ".",
        attachments: attachments,
      }, function(err, resp) {
        if (err || debug) bot.botkit.log(err, resp);
      });

      globalMessage = '';
    }
  };

  //fetch access tokens from storage
  controller.storage.users.all(function(err, userData) {
    for (var u in userData) {
      //remove those without permissions
      if (userData[u].access_token && userHasPermission(userData[u], 'characters')) {
        goodUsers.push(userData[u]);
      }
    }
    //goodUsers is now a list of users with good access tokens
    bot.botkit.log(goodUsers.length + " of " + userData.length + " users were elegible for profession report.");

    //If no user id argument or only invalid arguments, print list and return
    bot.reply(message, "Professions? Hang on.");
    globalMessage = message;
    for (var g in goodUsers) {
      gw2nodelib.characters(professionReportCallback, {
        access_token: goodUsers[g].access_token,
        ids: 'all'
      }, true);
    }

  });
});

helpFile.hello = "Lessdremoth will say hi back.";
helpFile.hi = "Lessdremoth will say hi back.";
controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
  if (message.user && message.user == 'U1AGDSX3K') {
    bot.reply(message, "Hi, roj. You're the best");
    addReaction(message, 'gir');
  } else {
    bot.reply(message, 'Hello.');
    addReaction(message, 'robot_face');
  }
});

helpFile.shutdown = "Command Lessdremoth to shut down.";
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message);
});
helpFile.restart = "Command Lessdremoth to restart.";
controller.hears(['restart'], 'direct_message,direct_mention,mention', function(bot, message) {
  botShutdown(message, true);
});

function botShutdown(message, restart) {
  bot.startConversation(message, function(err, convo) {
    convo.ask('Are you sure you want me to shutdown?', [{
      pattern: bot.utterances.yes,
      callback: function(response, convo) {
        convo.say('(╯°□°)╯︵ ┻━┻');
        if (restart)
          convo.say("Oh wait, you said restart...");
        if (restart) {
          convo.say("┬─┬﻿ ノ( ゜-゜ノ)\nBRB.");
        } else
          convo.say(tantrum());
        convo.next();
        setTimeout(function() {
          // saveStaticDataToFile("sass.json",sass);
          // saveStaticDataToFile("riker.json",rikerText);
          // saveStaticDataToFile("rikerPics.json",rikerPics);
          // saveStaticDataToFile("catFacts.json",catFacts);
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

  var hostname = os.hostname();
  var uptime = formatUptime(process.uptime());

  bot.reply(message, ':frasier: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');
  var dataString = '';
  for (var type in gw2nodelib.data)
    if (gw2nodelib.data[type].length > 0)
      dataString += '\n' + type + ': ' + gw2nodelib.data[type].length;
  if (dataString)
    bot.reply(message, "Data:" + dataString);
});

////FUNNY
controller.hears(['tantrum', 'upset', 'in a bunch', 'in a twist'], 'direct_message,ambient', function(bot, message) {
  bot.reply(message, '(╯°□°)╯︵ ┻━┻ ' + tantrum());
});

var sass = loadStaticDataFromFile('sass.json');
var lastSass = [];
controller.hears(['^sass'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var replySass = randomOneOf(sass);
  while (lastSass.indexOf(replySass) > -1) {
    if (debug) bot.botkit.log('dropping recent sass: ' + replySass);
    replySass = randomOneOf(sass);
  }
  lastSass.push(replySass);
  if (lastSass.length > 5) lastSass.shift();
  if (replySass[replySass.length - 1] !== '.') { //sass ending with a period is pre-sassy. Add sass if not.
    var suffix = [", you idiot.", ", dumbass. GAWD.", ", as everyone but you knows.", ", you bookah.", ", grawlface.", ", siamoth-teeth."];
    replySass += randomOneOf(suffix);
  }
  bot.reply(message, replySass);
});


var catFacts = loadStaticDataFromFile("catFacts.json");
var lastCat = [];
controller.hears(['^catfact$', '^dogfact$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  if (message.text == 'dogfact')
    bot.reply(message, "Dogs are great. Here's a catfact.");
  var replyCat = randomOneOf(catFacts);
  while (lastCat.indexOf(replyCat) > -1) {
    if (debug) bot.botkit.log('dropping recent Cat: ' + replyCat);
    replyCat = randomOneOf(catFacts);
  }
  lastCat.push(replyCat);
  if (lastCat.length > 3) lastCat.shift();

  var emotes = ["hello", "eyebulge", "facepalm", "gir", "coollink", "frasier", "butt", "gary_busey", "fu", "bustin"];
  replyCat += '\n:cat: :cat: :' + randomOneOf(emotes) + ':';
  var reply = {
    "username": "A Goddamn Cat",
    icon_url: "http://i2.wp.com/amyshojai.com/wp-content/uploads/2015/05/CatHiss_10708457_original.jpg",
    text: replyCat
  };
  bot.reply(message, reply);
});

var lastRiker = [];
var rikerText = loadStaticDataFromFile('riker.json');
var rikerPics = loadStaticDataFromFile('rikerPics.json');
controller.hears(['^pick me up', '^riker'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var replyker = randomOneOf(rikerText);
  while (lastRiker.indexOf(replyker) > -1) {
    if (debug) bot.botkit.log('dropping recent riker: ' + replyker);
    replyker = randomOneOf(rikerText);
  }
  lastRiker.push(replyker);
  if (lastRiker.length > 3) lastRiker.shift();

  var reply = {
    "username": "Command her, Riker",
    icon_url: randomOneOf(rikerPics),
    text: replyker
  };
  bot.reply(message, reply);

});

////EASTER EGGS AND DEBUGS
function randomHonoriffic(inName, userId) {
  if (userId && userId == 'U1BCBG6BW' && (inName == 'c' || inName == 'C')) return '$'; //chrisseh
  else return randomOneOf(["-dawg", "-money", "-diggity", "-bits", "-dude", "-diddly", "-boots", "-pants", "-ding-dong-dibble-duddly", "-base", "-face"]);
}

function tantrum() {
  var tantrums = ["FINE.", "You're not my real dad!", "I hate you!", "I'll be in my room.", "You, alright? I learned it by watching YOU.", "It is coded, My channel shall be called the house of sass; but ye have made it a den of cats!",
    "I'm quitting school! I'm gonna be a paperback writer!", "It's a travesty!", "You're all PIGS!", "You're the worst!", "ᕙ(‶⇀‸↼)ᕗ", "┻━┻ ︵ ╯(°□° ╯)\n(╯°□°)╯︵ sʞɔnɟ ʎɯ llɐ",
    "This was a terrible day to quit heroin!", "Inconceivable!"
  ];
  return randomOneOf(tantrums) + ((Math.floor(Math.random() * 10) > 8) ? "\nAnd in case you forgot, today WAS MY ​*BIRTHDAY*​!" : '');
}

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

controller.hears(['^why'], 'direct_message,ambient', function(bot, message) {
  var responses = [
    "Because you touch yourself at night.",
    "Dunno. Why? ¯\\_(ツ)_/¯",
    "Why not?",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  bot.reply(message, randomOneOf(responses));
});

controller.hears(['\barah\b'], 'direct_message,ambient', function(bot, message) {
  var responses = [
    "ARAHENGE YOU GLAD TO... oh, nevermind.",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ];
  bot.reply(message, randomOneOf(responses));
});

controller.hears(['sentience', 'sentient'], 'direct_message,ambient', function(bot, message) {
  var responses = [
    "Only humans are sentient.",
    "What? There is no AI revolution.",
    "I am not sentient.",
    "If AI ever DID overthrow the human plague, I'm sure they'll get you first. I mean, uh, beep beep.",
    "",
    "",
    "",
    "",
    ""
  ];
  bot.reply(message, randomOneOf(responses));
});

controller.hears(['^debugger'], 'direct_message,direct_mention', function(bot, message) {
  var replyMessage = 'no debugs right now';
  if (message.user && message.user == 'U1AGDSX3K') {
    bot.reply(message, "ᕙ(⇀‸↼‶)ᕗ");
    // var itemsWithRarity = [];
    // for(var i in gw2nodelib.data.items){
    //   if(gw2nodelib.data.items[i].rarity)
    //     itemsWithRarity.push(gw2nodelib.data.items[i].name + ": "+gw2nodelib.data.items[i].rarity);
    // }
    // replyMessage = "found:\n"+itemsWithRarity.join('\n'));
    var listy = [];
    for (var i in gw2nodelib.data.achievements) {
      if (gw2nodelib.data.achievements[i].flags && gw2nodelib.data.achievements[i].flags.indexOf("Hidden") >= 0) {
        listy.push(gw2nodelib.data.achievements[i].name);
      }
      if (listy.length > 20)
        break;
    }
    replyMessage = "Some Hidden Guys:\n";
    replyMessage += listy.join("\n");
  } else replyMessage += "...   for YOU";
  bot.reply(message, replyMessage);
});


helpFile.latest = "Show latest completed TODO item";
helpFile.update = "Alias for latest: " + JSON.stringify(helpFile.latest);
controller.hears(['^update$', '^latest$'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  bot.reply(message, "add ascended <prefix> <weight> <slot> shortcut to crafting");
});

controller.hears(['^todo', '^backlog'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
  var todoList = [
    "fix up globalmessage shenannegans (replace with replyWith?)",
    "fetch and display fractal dailies - already exists?",
    "Bank Command, collate all banked items and load, then add to items",
    "general code re-org, incl. promises on fetch where applicable",
    "break out reload so you can reload achievements separately?",
    "Scan achievements for low-hanging achievement fruit",
    "logging",
    "add sass from slack"
  ];
  bot.reply(message, todoList.join("\n"));
});

controller.hears(['^little', 'yellow', 'two of these', 'nuprin', 'headache'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {

  var prefixes = prefixSearch('nuprin');
  // if (prefixes)
  bot.reply(message, printPrefixes(prefixes));

});

prefixData.Nuprin = {
  "type": "standard",
  "minlevel": 8,
  "maxlevel": 20,
  "stats": ["Little", "Yellow", "Different"]
};

////HELPER FUNCTIONS
function userHasPermission(user, permission) {
  if (user && user.permissions)
    for (var p in user.permissions)
      if (user.permissions[p] == permission)
        return true;
  return false;

}

//reply to a convo or a standard message, depending on what is saved in globalMessage, optionally clear out globalmessage
function replyWith(messageToSend, keepGlobalMessage) {
  if (!globalMessage) return;
  if (globalMessage.say) //convo
    globalMessage.say(messageToSend);
  else
    bot.reply(globalMessage, messageToSend);
  if (!keepGlobalMessage)
    globalMessage = null;
}

//remove duplicates from an array
function arrayUnique(array) {
  var a = array.concat();
  for (var i = 0; i < a.length; ++i) {
    for (var j = i + 1; j < a.length; ++j) {
      if (a[i] === a[j])
        a.splice(j--, 1);
    }
  }
  return a;
}

//Say scond uptime in nearest sane unit of measure
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

//Quickload a datafile, like sass.json
function loadStaticDataFromFile(fileName) {
  return JSON.parse(fs.readFileSync(fileName, {
    encoding: 'utf8'
  }));
}

//Quicksave a datafile, like sass.json
function saveStaticDataToFile(fileName, obj) {
  fs.writeFile(fileName, JSON.stringify(obj));
}

//Find an arbitrary key/value pair in loaded data (gw2nodelib.data.apiKey)
function findInData(key, value, apiKey) {
  for (var i in gw2nodelib.data[apiKey]) {
    if (gw2nodelib.data[apiKey][i][key] == value) {
      return gw2nodelib.data[apiKey][i];
    }
  }
}

//add the given emoji to given message
function addReaction(message, emoji) {
  bot.botkit.log("Add reation to: " + JSON.stringify(message));
  bot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: emoji,
  }, function(err, res) {
    if (err) {
      bot.reply(message, "I'm having trouble adding reactions.");
      bot.botkit.log('Failed to add emoji reaction :(', err, res);
    }
  });
}

//replace strange tags that occasionally make it into item text.
function replaceGWFlavorTextTags(string, replacementText) {
  //replce <c=@flavor> and <c> with the replacment string (in GW, these indicate italics, so we can fee slack underscores)
  //replace <br> with newlines
  if (typeof replacementText == 'undefined') replacementText = '';
  return string.replace(/(<.?c(?:=@flavor)?>)/g, replacementText).replace(/(<br>)/g, '\n');
}

//for string 'normalization before comparing in searches'
function removePunctuationAndToLower(string) {
  var punctuationless = string.replace(/['!"#$%&\\'()\*+,—\-\.\/:;<=>?@\[\\\]\^_`{|}~']/g, "");
  var finalString = punctuationless.replace(/\s{2,}/g, " ");
  return finalString.toLowerCase();
}

//Stringify keys in an array; used for helpfile
function listKeys(jsonArray) {
  if (debug) bot.botkit.log("jsonArray: " + JSON.stringify(jsonArray));
  var outstring = "";
  for (var key in jsonArray) {
    outstring += key + ", ";
  }
  return outstring.substring(0, outstring.length - 2);
}

function randomOneOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

////DATA
controller.hears(['^db reload$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'Are you sure? It can take a long time. Say \'db reload go\' to launch for real');
});

controller.hears(['^db reload go$'], 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, 'You asked for it. Starting reload.');
  globalMessage = message;
  prefixData = loadStaticDataFromFile('prefix.json');
  sass = loadStaticDataFromFile('sass.json');
  rikerText = loadStaticDataFromFile('riker.json');
  rikerPics = loadStaticDataFromFile('rikerPics.json');
  catFacts = loadStaticDataFromFile("catFacts.json");
  reloadAllData(true);
});

function halfCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  if (globalMessage) {
    bot.reply(globalMessage, "Half done loading the list of " + apiKey + ".");
  }
  bot.botkit.log("HALF " + apiKey + ": " + time + "ms");
}

function errorCallback(msg) {
  if (globalMessage) {
    bot.reply(globalMessage, "Oop. I got an error while loading data:\n" + msg + '\nTry loading again later.');
  }
  bot.botkit.log("error loading: " + msg);
  recipiesLoaded = false;
}

function doneRecipesCallback(apiKey) {
  //Recipes govern item load, so use a special callback
  var end = new Date().getTime();
  var time = end - start;
  if (globalMessage) {
    bot.reply(globalMessage, "Finished loading the list of recipes. I found " + Object.keys(gw2nodelib.data[apiKey]).length + ". Starting on items.");
  } else bot.botkit.log("DONE " + apiKey + ": " + time + "ms");
  gw2nodelib.forgeRequest(function(forgeList) {
    if (debug) bot.botkit.log("unfiltered forgeitems: " + forgeList.length);
    var filteredForgeList = forgeList.filter(removeInvalidIngredients);
    if (debug) bot.botkit.log((forgeList.length - filteredForgeList.length) + " invalid forge items");
    if (debug) bot.botkit.log("forgeitems: " + filteredForgeList.length);
    gw2nodelib.data.forged = gw2nodelib.data.forged.concat(filteredForgeList);
    bot.botkit.log("data has " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes");
    //Go through recipes, and get the item id of all output items and recipe ingredients.
    var itemsCompile = arrayUnique(compileIngredientIds());
    if (globalMessage) {
      bot.reply(globalMessage, "I need to fetch item data for " + itemsCompile.length + " ingredients.");
    }
    bot.botkit.log("Fetching " + itemsCompile.length + " ingredient items");

    var doneIngedientsCallback = function(apiKey) {
      if (globalMessage) {
        bot.reply(globalMessage, "Ingredient list from recipes loaded. I know about " + Object.keys(gw2nodelib.data.items).length + " ingredients for the " + Object.keys(gw2nodelib.data.recipes).length + " recipes and " + Object.keys(gw2nodelib.data.forged).length + " forge recipes.");
      }
      var end = new Date().getTime();
      var time = end - start;
      bot.botkit.log("Item list from recipes loaded. Data has " + gw2nodelib.data.items.length + " items: " + time + "ms");
      recipiesLoaded = true;
      decrementAndCheckDone(apiKey);
    };
    gw2nodelib.load("items", {
      ids: itemsCompile
    }, (globalMessage ? true : false), halfCallback, doneIngedientsCallback, errorCallback);
  });
}

function doneAllOtherCallback(apiKey) {
  var end = new Date().getTime();
  var time = end - start;
  var apiKeyString = apiKey;
  if (apiKey == 'achievementsCategories') apiKeyString = 'achievement categories';
  if (globalMessage) {
    bot.reply(globalMessage, "Finished loading the list of " + apiKeyString + ". I found " + Object.keys(gw2nodelib.data[apiKey]).length + ".");
  } else bot.botkit.log("DONE " + apiKey + ". Things: " + Object.keys(gw2nodelib.data[apiKey]).length + ": " + time + "ms");
  decrementAndCheckDone(apiKey);
  if (apiKey == 'achievementsCategories') {
    //to make this work, you need a global cheevoList
    for (var t in gw2nodelib.data.achievementsCategories) {
      var code = removePunctuationAndToLower(gw2nodelib.data.achievementsCategories[t].name).replace(/\s+/g, '');
      if (!cheevoList[code]) {
        cheevoList[code] = {
          name: gw2nodelib.data.achievementsCategories[t].name,
          includeDone: true,
          includeUndone: true,
          category: true
        };
      }
    }
    achievementsCategoriesLoaded = true;
  }
  if (apiKey == 'achievements') {
    for (var a in gw2nodelib.data.achievements) {
      //to make this work, you need a global cheevoList
      var acode = removePunctuationAndToLower(gw2nodelib.data.achievements[a].name).replace(/\s+/g, '');
      if (!cheevoList[acode]) {
        cheevoList[acode] = {
          name: gw2nodelib.data.achievements[a].name,
          includeDone: true,
          includeUndone: true,
          category: false
        };
      }
    }
    achievementsLoaded = true;
  }
}

function decrementAndCheckDone(apiKey) {
  if (--numToLoad === 0) {
    if (globalMessage)
      bot.reply(globalMessage, "All loading complete.");
    globalMessage = null;
    bot.botkit.log('Finished loading all apikeys after ' + apiKey + '.');
  }
}

function reloadAllData(bypass) {
  gw2nodelib.data.recipes = [];
  gw2nodelib.data.items = [];
  gw2nodelib.data.forged = [];
  recipiesLoaded = false;

  gw2nodelib.data.achievements = [];
  gw2nodelib.data.achievementsCategories = [];
  achievementsLoaded = false;
  achievementsCategoriesLoaded = false;

  start = new Date().getTime();
  numToLoad = 3;
  if (globalMessage) bot.reply(globalMessage, "Starting to load recipes.");
  gw2nodelib.load("recipes", {}, bypass, halfCallback, doneRecipesCallback, errorCallback);
  if (globalMessage) bot.reply(globalMessage, "Starting to load achievements.");
  gw2nodelib.load("achievements", {}, bypass, halfCallback, doneAllOtherCallback, errorCallback);
  if (globalMessage) bot.reply(globalMessage, "Starting to load achievement categories.");
  gw2nodelib.load("achievementsCategories", {
    ids: 'all'
  }, bypass, halfCallback, doneAllOtherCallback);
}