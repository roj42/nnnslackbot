// Scroll down a bit to see public API

var config = {
	baseUrl: 'https://api.guildwars2.com/v2/',
	cacheTime: 604800,
	cacheFile: null,
	cachePath: '',
	debug: false,
	dataLoadRetry: 3,
	dataLoadPageSize: 200,
	api: {
		quaggans: 'quaggans',
		build: 'build',
		characters: 'characters',
		achievements: 'achievements',
		achievementsCategories: 'achievements/categories',
		accountAchievements: 'account/achievements',
		items: 'items',
		recipes: 'recipes',
		account: 'account',
		tokeninfo: 'tokeninfo',
		dailies: 'achievements/daily',
		dailiesTomorrow: 'achievements/daily/tomorrow',
		skins: 'skins',
		titles: 'titles',
		minis: 'minis'
	},
	dao: { //roj42 - define useful parts of each return JSON item
		items: ["rarity", "text", "error", "name", "id", "description", "level", "chat_link", "icon", "details", "type"],
		recipes: ["text", "error", "output_item_id", "output_item_count", "id", "ingredients", "chat_link"],
		achievements: ["text", "error", "id", "name", "description", "requirement", "icon", "bits", "tiers", "flags", "rewards"],
		achievementsCategories: ["text", "error", "id", "name", "icon", "achievements"]
	},
};

// Fully load api into config; allows for per-uri cache times
for (var apiKey in config.api) {
	config.api[apiKey] = {
		uri: config.api[apiKey],
		cacheTime: config.cacheTime,
	};
}

//roj42 - we're storing cache in memory, so strip out unused items
var daoLoad = function(apiKey, rawJsonItem) {
	var daoAppliedItem = {};
	for (var i in config.dao[apiKey]) {
		if (typeof rawJsonItem[config.dao[apiKey][i]] !== undefined)
			daoAppliedItem[config.dao[apiKey][i]] = rawJsonItem[config.dao[apiKey][i]];
	}
	return daoAppliedItem;
};


// Set up the cache to work with or without a file; defaults to without
var fs = null;
var cache = function() {
	var container = {};

	return {
		get: function(apiKey, key) {
			if (!container[apiKey]) return;
			return container[apiKey][key];
		},

		set: function(apiKey, key, value) {
			if(config.debug) console.log("Writing cache to file: " + config.cachePath + apiKey + config.cacheFile);
			if (!container[apiKey]) container[apiKey] = {};
			container[apiKey][key] = value;
			if (config.cacheFile !== null) {
				fs.writeFile(config.cachePath + apiKey + config.cacheFile, JSON.stringify(container[apiKey]), function(err) {
					if (err) throw err;
				});
			}
		},

		load: function(apiKey, obj) {
			if (!container[apiKey]) container[apiKey] = {};
			container[apiKey] = obj;
		},
	};
}();

var Gw2ApiLibException = function(message) {
	this.message = message;
	this.name = 'Gw2ApiLibException';
};

// For easily making HTTP request to API
var request = require('request');

// For converting JS object to URI params
var querystring = require('querystring');

// Invokes callback on requested JSON after it is retrieved via GET/cache; throws Gw2ApiLibException if there are bad arguments or an error accessing API
var apiRequest = function(apiKey, options, callback, bypassCache) {
	// Using argument structure [apiKey, callback]
	if ((typeof callback === 'undefined' || typeof callback === 'boolean') && typeof options === 'function') {
		// Using argument structure [apiKey, callback, bypassCache]
		if (typeof callback === 'boolean' && typeof bypassCache === 'undefined') {
			bypassCache = callback;
		}
		callback = options;
		options = null;
	}
	if (typeof apiKey === 'undefined' || typeof callback === 'undefined' || (typeof options !== 'undefined' && typeof options !== 'object')) {
		throw new Gw2ApiLibException('Bad arguments for apiRequest. Make sure all arguments are valid. Arguments: ' + JSON.stringify(arguments));
	}

	// Time to update and recache
	var cacheKey = apiKey + ((options !== undefined) ? '?' + decodeURIComponent(querystring.stringify(options)) : '');
	if (config.debug && typeof cache.get(apiKey, cacheKey) === 'undefined') console.log("cacheKey for " + apiKey + " undefined: " + cacheKey);
	if (bypassCache || typeof cache.get(apiKey, cacheKey) === 'undefined' || (new Date()) > cache.get(apiKey, cacheKey).updateAt) {
		if (config.debug && options) console.log("options are " + decodeURIComponent(querystring.stringify(options)));
		var url = config.baseUrl + config.api[apiKey].uri + ((options !== undefined) ? '?' + decodeURIComponent(querystring.stringify(options)) : '');

		if (config.debug) console.log((bypassCache ? 'Fetching' : 'Updating cache for') + ' API Key: ' + cacheKey + ' from URL: ' + url);
		else console.log((bypassCache ? 'Fetching' : 'Updating cache for') + ' API Key: ' + cacheKey);

		request(url, function(error, response, body) {
			//we're okay with
			//200 - success 
			//404 - no info returned, there will be a json object with 'text' we'll handle later
			//206 - partial info, some invalid ids or whatnot. Let the good stuff through

			if (error || !(response.statusCode == 200 || response.statusCode == 404 || response.statusCode == 206)) {
				var msg = ((typeof response !== 'undefined') ? '[Status Code ' + response.statusCode + '] ' : '') + 'There was an error requesting the API (URL ' + url + ')' + ((error !== null) ? ': ' + error : '');
				callback({
					'error': msg
				}, {
					options: options
				});
				return; //roj42 - A thrown exception strangles the bot upstream, catching it doesn't stop a full halt.
				// throw new Gw2ApiLibException(msg);
			}
			if (response.statusCode == 206) console.log("Received a 206 error, not all ids fetched.");
			var headerSet = { //add header data for auto loading, if it came back
				options: options,
				pageSize: response.headers['x-page-size'],
				pageTotal: response.headers['x-page-total'],
				resultCount: response.headers['x-result-count'],
				resultTotal: response.headers['x-result-total']
			};
			cache.set(apiKey, cacheKey, {
				headers: headerSet,
				json: JSON.parse(body),
				updateAt: (new Date()).setSeconds((new Date()).getSeconds() + config.api[apiKey].cacheTime),
			});

			callback(cache.get(apiKey, cacheKey).json, cache.get(apiKey, cacheKey).headers);
		});
		return;
	}
	// Only runs if already found in cache
	callback(cache.get(apiKey, cacheKey).json, cache.get(apiKey, cacheKey).headers);
};

// Return the public API
module.exports = function() {
	var ret = {
		// Returns true if successfully set, false if bad arguments (i.e. file doesn't exist)
		// roj42 - Now loads if file exists already, and just sets if files exists
		loadCacheFromFile: function(fileSuffix) {
			if (typeof fileSuffix === 'undefined' || fileSuffix === false) {
				config.cacheFile = null;
			} else {
				if (typeof fileSuffix !== 'string') {
					return false;
				}
				fs = require('fs');
				config.cacheFile = fileSuffix;

				for (var apiKey in config.api) {
					if (fs.existsSync(config.cachePath + apiKey + config.cacheFile) && (fs.statSync(config.cachePath + apiKey + config.cacheFile).size > 0)) {
						cache.load(apiKey, JSON.parse(fs.readFileSync(config.cachePath + apiKey + config.cacheFile, {
							encoding: 'utf8'
						})));
					} else if (config.debug) console.log("File " + config.cachePath + apiKey + config.cacheFile + " does not exist, will create on first cache save");
				}
			}
			return true;
		},
		setCachePath: function(path) {
			if (typeof path !== 'string') {
				config.cachePath = '';
				return false;
			}
			fs = require('fs');
			try {
				fs.statSync(path);
			} catch (e) {
				fs.mkdirSync(path);
			}
			config.cachePath = path;
			return true;
		},
		// Returns true if successful, false if bad arguments
		setCacheTime: function(seconds, apiKey) {
			// Using argument structure [seconds]
			if (typeof seconds === 'undefined') {
				seconds = apiKey;
				apiKey = null;
			}
			if (typeof seconds !== 'number') {
				return false;
			}

			// Update default cache time and all api keys using default cache time
			if (apiKey === null) {
				var oldCacheTime = config.cacheTime;
				config.cacheTime = seconds;
				for (var aKey in config.api) {
					// Only updates cache time if using (old) default cache time
					if (config.api[aKey].cacheTime === oldCacheTime) {
						config.api[aKey].cacheTime = config.cacheTime;
					}
				}
				if (config.debug) console.log('setCacheTime successful; config.api: ' + JSON.stringify(config.api));
			} else if (!(apiKey in config.api)) {
				return false;
			} else {
				config.api[apiKey].cacheTime = seconds;
				if (config.debug) console.log('setCacheTime successful; config.api.' + apiKey + ': ' + JSON.stringify(config.api[apiKey]));
			}

			return true;
		},

		// Returns true if successful, false if apiKey not found
		resetCacheTime: function(apiKey) {
			if (typeof apiKey === 'undefined') {
				for (var aKey in config.api) {
					config.api[aKey].cacheTime = config.cacheTime;
				}
			} else if (!(apiKey in config.api)) {
				return false;
			} else {
				config.api[apiKey].cacheTime = config.cacheTime;
			}
			return true;
		},
	};

	// Allows public access to apiRequest for each apiKey, i.e. this.apiKey(function, [optional] object, [optional] boolean)
	var entryPointFunction = function(apiKey) {
		return function(callback, params, bypassCache) {
			if (typeof callback !== 'function' || (typeof params !== 'undefined' && typeof params !== 'object')) {
				return false;
			}

			apiRequest(apiKey, params, callback, bypassCache);
			return true;
		};
	};
	//roj42 - grab non-API forge recipes from the kind people at gw2profits
	var forgeOptions = {
		method: 'GET',
		url: 'http://www.gw2profits.com/json/forge?include=name',
		headers: {
			'postman-token': '558fed07-854b-6b03-e7c8-a776d87adfb4',
			'cache-control': 'no-cache'
		}
	};
	ret.forgeRequest = function(callback) {
		if (typeof cache.get('recipes', 'forgeRecipes') === 'undefined' || (new Date()) > cache.get('recipes', 'forgeRecipes').updateAt) {

			request(forgeOptions, function(error, response, body) {
				if (error) return new Error(error);
				cache.set('recipes', 'forgeRecipes', {
					json: JSON.parse(body),
					updateAt: (new Date()).setSeconds((new Date()).getSeconds() + config.api[apiKey].cacheTime),
				});
				callback(cache.get('recipes', 'forgeRecipes').json);
			});
		} else callback(cache.get('recipes', 'forgeRecipes').json);
	};
	//roj42 - methods to load ALL of a specific endpoint
	ret.daoLoad = daoLoad;
	ret.data = [];
	ret.data.forged = [];

	for (var apiKey in config.api) {
		// Returns true if successful, false if bad arguments
		ret[apiKey] = entryPointFunction(apiKey);
		ret.data[apiKey] = [];
	}
	//Loader helper function; if there is a list of IDs, paginate manually, otherwise fetch all ids by page.
	ret.load = function(apiKey, fetchParams, bypass, halfCallback, doneCallback, errorCallback) {
		if (!ret[apiKey]) {
			if (errorCallback) errorCallback("no apiKey for " + apiKey);
			else console.log("no apiKey for " + apiKey);
			return;
		} //check apiKey
		var total = 0; //hold total page size
		var half_length = 0; //variable to identify half of max pages
		var retry = config.dataLoadRetry; //hold number of retries.
		// fetch params for inital call. Max page size is 200
		fetchParams.page = 0;
		fetchParams.page_size = config.dataLoadPageSize;
		var saveList = [];
		if (fetchParams.ids && fetchParams.ids != 'all') { //Fetching a subset, unless 'all', which indicates paging
			saveList = fetchParams.ids.slice(0);
			fetchParams.ids = saveList.slice(fetchParams.page, fetchParams.page + fetchParams.page_size).join(",");
		}
		var loopCallback = function(jsonList, headers) { //single fetch at a time up, iterate on self
			if (jsonList.text || jsonList.error) { //hopefully this is a network hiccup, try again
				console.log("error: " + JSON.stringify(jsonList));
				if (retry-- <= 0) { //we're going to retry, do not increment page, increment retry
					if (errorCallback) errorCallback("too many retries fetching " + apiKey + ": " + JSON.stringify(jsonList));
					console.log("too many retries " + JSON.stringify(jsonList));
					return;
				} else if (config.debug) {
					console.log("Retrying: " + retry);
				}
			} else { //fetched a page. Load it into data
				if (apiKey in config.dao) {
					for (var item in jsonList) {
						if (config.debug && fetchParams.page === 0 && item == '0') console.log("sample dao:\n" + JSON.stringify(jsonList[item]) + "\nbecomes\n" + JSON.stringify(daoLoad(apiKey, jsonList[item])));
						ret.data[apiKey] = ret.data[apiKey].concat(daoLoad(apiKey, jsonList[item]));
					}
				} else {
					ret.data[apiKey] = ret.data[apiKey].concat(jsonList);
				} //append fetch results to data.apiKey
				if (fetchParams.page === 0) {
					//up by page chunk
					if (fetchParams.ids && fetchParams.ids != 'all') {
						var len = Object.keys(saveList).length;
						total = Math.ceil(len / fetchParams.page_size) - 1;
						half_length = Math.ceil(total / 2);

					} // up by single pages 
					else {
						if (!headers.pageTotal) headers.pageTotal = 0;
						total = headers.pageTotal - 1;
						half_length = Math.ceil(total / 2);
					}
					console.log(apiKey + " half is " + half_length + ". Total is " + total);
				}
				retry = config.dataLoadRetry;
				// track progress
				if (fetchParams.ids && fetchParams.ids != 'all') {
					fetchParams.page += fetchParams.page_size;
					fetchParams.ids = saveList.slice(fetchParams.page, fetchParams.page + fetchParams.page_size).join(",");
					if (!fetchParams.ids && fetchParams.ids != 'all') { //cover the hopefully-impossible case that the slice left this empty. Make sure by-ids path is still triggered
						fetchParams.ids = '0';
					}
				} else {
					fetchParams.page++;
				}
			}
			var progress;
			if (fetchParams.ids && fetchParams.ids != 'all') {
				progress = fetchParams.page / fetchParams.page_size;
			} else {
				progress = fetchParams.page;
			}
			if (config.debug) console.log('Progress: ' + progress);

			if (progress == half_length && retry == config.dataLoadRetry) { //call half callback at half
				if (halfCallback)
					halfCallback(apiKey);
			}
			if (progress > total && retry == config.dataLoadRetry) { //call done callback when done successfully
				if (doneCallback)
					doneCallback(apiKey);
			} else {
				ret[apiKey](loopCallback, fetchParams, bypass);
			}

		};
		ret[apiKey](loopCallback, fetchParams, bypass);
	};
	return ret;
}();