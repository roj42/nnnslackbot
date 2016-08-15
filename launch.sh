#!/bin/bash -x

docker stop lessy
docker rm lessy
sudo rm -rf data/caches/*
docker run -d --name=lessy --restart=on-failure -v $(pwd)/nnnslackbot:/nnnslackbot -v $(pwd)/data:/nnnslackbot/slackbotDB -w /nnnslackbot -e "token=xoxb-44547448102-RshwsSgPuHLWhOzMDE7A1gpA" node:4.4.5 bash run.sh

