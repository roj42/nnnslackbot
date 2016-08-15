#!/bin/bash -x

if [ -z $SLACKTOKEN ]; then
  echo "No token."
  exit 1
fi

docker inspect lessy >/dev/null 2>/dev/null
if [ $? -eq 0 ]; then
  docker stop lessy
  docker rm lessy
fi

if [ -d data/caches ]; then
  sudo rm -rf data/caches/*
fi

docker run -d --name=lessy --restart=on-failure -v $(pwd)/nnnslackbot:/nnnslackbot -v $(pwd)/data:/nnnslackbot/slackbotDB -w /nnnslackbot -e "token=$SLACKTOKEN" node:4.4.5 bash run.sh

exit $?

