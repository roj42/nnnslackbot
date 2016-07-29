# nnnslackbot - A slackbot for the neuralnexus slack team

[![npm](https://img.shields.io/npm/v/nnnslackbot.svg)](https://www.npmjs.com/package/nnnslackbot)
[![npm](https://img.shields.io/npm/l/nnnslackbot.svg)](https://spdx.org/licenses/MIT)

A slackbot that uses the guildwars 2 API to provide some functionality to the neuralnexus slack team. Provides base ingredients, item nomenclature, and sass

## Installation

nnnslackbot is available via NPM.


Check out nnnslackbot directly from Git.

```bash
git clone git@github.com/roj42/nnnslackbot.git
```

Then in the checkout directory, install nnnslackbot's dependencies

```
bash
npm install
```


## Usage

Expects a slackbot token as an environment variable called 'token'. In the example below, our token bot is called 'lessdremoth'.
The bot will automatically connect and be invited into channels.

Has several functions that tie into the Guild Wars API.
Say 'help' in a chamnnel with lessdremoth for a list of commands, and help <command> for specific command help.

Lessdremoth can save access tokens to fetch account-specific data. Tell Lessdremoth access token help for steps.