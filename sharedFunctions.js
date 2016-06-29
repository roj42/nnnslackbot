var fs = require('fs');

module.exports = function() {

	var ret = {
		//retrun a random member of a given list
		randomOneOf : function(list) {
			return list[Math.floor(Math.random() * list.length)];
		},

		//Quickload a datafile, like sass.json
		loadStaticDataFromFile : function(fileName) {
			return JSON.parse(fs.readFileSync(fileName, {
				encoding: 'utf8'
			}));
		},

		//Quicksave a datafile, like sass.json
		saveStaticDataToFile : function(fileName, obj) {
			fs.writeFile(fileName, JSON.stringify(obj));
		},

		//return given userid appended with HI-LARIOUS appelation
		randomHonoriffic : function(inName, userId) {
			if (userId && userId == 'U1BCBG6BW' && (inName == 'c' || inName == 'C')) return '$'; //chrisseh
			else return this.randomOneOf(["-dawg", "-money", "-diggity", "-bits", "-dude", "-diddly", "-boots", "-pants", "-ding-dong-dibble-duddly", "-base", "-face"]);
		},

		//return a random tantrum from the list
		tantrum : function() {
			var tantrums = ["FINE.", "You're not my real dad!", "I hate you!", "I'll be in my room.", "You, alright? I learned it by watching YOU.", "It is coded, My channel shall be called the house of sass; but ye have made it a den of cats!",
				"I'm quitting school! I'm gonna be a paperback writer!", "It's a travesty!", "You're all PIGS!", "You're the worst!", "ᕙ(‶⇀‸↼)ᕗ", "┻━┻ ︵ ╯(°□° ╯)\n(╯°□°)╯︵ sʞɔnɟ ʎɯ llɐ",
				"This was a terrible day to quit heroin!", "Inconceivable!", "You miserable piece of... dick-brained... horseshit... slime-sucking son of a whore, bitch!",
				"Oh, it's on now!", "You're wrong, wrong, absolutely brimming over with wrong-ability."
			];
			return randomOneOf(tantrums) + ((Math.floor(Math.random() * 10) > 8) ? "\nAnd in case you forgot, today WAS MY ​*BIRTHDAY*​!" : '');
		},
		//for string 'normalization before comparing in searches'
		removePunctuationAndToLower : function(string) {
			var punctuationless = string.replace(/['!"#$%&\\'()\*+,—\-\.\/:;<=>?@\[\\\]\^_`{|}~']/g, "");
			var finalString = punctuationless.replace(/\s{2,}/g, " ");
			return finalString.toLowerCase();
		},

		//remove duplicates from an array
		arrayUnique : function(array) {
			var a = array.concat();
			for (var i = 0; i < a.length; ++i) {
				for (var j = i + 1; j < a.length; ++j) {
					if (a[i] === a[j])
						a.splice(j--, 1);
				}
			}
			return a;
		}
	};
	return ret;
}();