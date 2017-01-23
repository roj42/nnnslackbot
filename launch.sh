#!/bin/bash -x

if [ -z $SLACKTOKEN ]; then
  echo "No token."
  exit 1
fi

if [ -z $INSTALL_DIR ]; then
  echo "No install dir specified."
  exit 1
fi

docker inspect lessy >/dev/null 2>/dev/null
if [ $? -eq 0 ]; then
  docker stop lessy
  docker rm lessy
fi

if [ -d $INSTALL_DIR/data/caches ]; then
  sudo rm -rf $INSTALL_DIR/data/caches/*
fi

docker run -d --name=lessy --restart=on-failure -v $INSTALL_DIR/nnnslackbot:/nnnslackbot -v $INSTALL_DIR/data:/nnnslackbot/slackbotDB -w /nnnslackbot -e "token=$SLACKTOKEN" node:4.4.5 bash run.sh

exit $?

