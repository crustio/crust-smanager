FROM node:current-alpine3.10

# Create crust-smanager directory
WORKDIR /usr/src/crust-smanager

# Move source files to docker image
COPY . .

# Install dependencies
RUN yarn && yarn build

# Run
ENTRYPOINT yarn start $ARGS
