#!/bin/bash

VERSION=$(grep '"version"' package.json | awk -F'"' '{print $4}')

sudo docker build -t crustio/crust-smanager:$VERSION .