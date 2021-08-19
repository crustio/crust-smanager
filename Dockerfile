FROM debian:10

RUN apt-get update \
  && apt-get install -y \
  curl \
  ca-certificates \
  --no-install-recommends

SHELL ["/bin/bash", "-c"]
ENV BASH_ENV ~/.bashrc

ENV VOLTA_HOME /root/.volta

ENV PATH $VOLTA_HOME/bin:$PATH

RUN curl https://get.volta.sh | bash

RUN volta install node@14.16.1

COPY ./ /opt/crust-smanager/
WORKDIR /opt/crust-smanager

RUN npm install
RUN npm run build

CMD ["npm", "start"]
