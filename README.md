# nnnslackbot - A slackbot for the neuralnexus slack team

[![npm](https://img.shields.io/npm/v/nnnslackbot.svg)](https://www.npmjs.com/package/nnnslackbot)
[![npm](https://img.shields.io/npm/l/nnnslackbot.svg)](https://spdx.org/licenses/MIT)

A slackbot that uses the guildwars 2 API to provide some functionality to the neuralnexus slack team. Provides base ingredients, item nomenclature, and sass

## Installation

nnnslackbot is available via NPM.

```
bash
npm install --save nnnslackbot
```

You can also check out nnnslackbot directly from Git.

```bash
git clone git@github.com/roj42/nnnslackbot.git
```

## Usage

Expects a slackbot token as an environment variable called 'token'. In the example below, our token bot is called 'lessdremoth'.
The bot will automatically connect and be invited into channels.

Has several functions that tie into the Guild Wars API
craft : lessdremoth will try to get you a list of base ingredients. Takes one argument that can contain spaces. Note that mystic forge recipes just list simple ingredients. Example:craft Light of Dwyna
hello : lessdremoth will say hi back.
hi : lessdremoth will say hi back.
shutdown : command lessdremoth to shut down
uptime : lessdremoth will display some basic uptime information.
who are you : lessdremoth will display some basic uptime information.
quaggans : fetch a list of all fetchable quaggan pictures. See help quaggan.
quaggan : Takes an argument. Lessdremoth pastes a url to a picture of that quaggan for slack to fetch. Also see help quaggans. Example: 'quaggan box'
access : Set up your guild wars account to allow lessdremoth to read data. Direct Message 'access token help'' for more information.
characters : Display a list of characters on your account.
prefix : Takes two arguments. One: Returns a list of all item prefixes and their stats that contain that string. Two: Filter results by that type. Valid types are: standard, gem, ascended, all. Defaults to standard. You can use abbreviations, but 'a' will be all. Notes: 's-es (as in Zojja's) and 'of the' strings have been removed. 'Healing power' is called 'healing'. 'Condition Damage' is called 'condition' Examples: 'prefix berzerker all' 'prefix pow gem' 'prefix pow asc'
suffix : Alias for prefix. 