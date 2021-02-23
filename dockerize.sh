#!/bin/bash

PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')
IMAGEID="crustio/crust-smanager:$PACKAGE_VERSION"
DOCKER_RUN_OPTS="-d --rm --network=host --restart=always -e TZ=Asia/Shanghai --name=crust-smanager"

case $1 in
  build )
    echo "Building $IMAGEID ..."
    docker build --network=host -t $IMAGEID .
    ;;
  run )
    echo "Starting $IMAGEID ..."
    docker run $DOCKER_RUN_OPTS $IMAGEID
    ;;
  stop )
    docker stop crust-smanager
    ;;
  restart )
    docker stop crust-smanager
    docker run $DOCKER_RUN_OPTS $IMAGEID
    ;;
  * )
    echo "USAGE:"
    echo "$0 build      build the '$IMAGEID' image"
    echo "$0 run        start the 'crust-smanager' container"
    echo "$0 stop       stop and remove the 'crust-smanager' container"
    echo "$0 restart    restart the 'crust-smanager' container"
esac
