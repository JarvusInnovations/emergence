FROM ubuntu:16.04

RUN mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y sudo apt-utils openssh-server vim tmux screen git curl software-properties-common language-pack-en-base


EXPOSE 22 80 3306 9083
VOLUME ["/emergence"]
RUN mkdir -p /emergence
RUN LC_ALL=en_US.UTF-8 add-apt-repository -y ppa:ondrej/php
RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get upgrade -y --allow-unauthenticated
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-unauthenticated git python-software-properties python g++ make ruby-dev nodejs nodejs-legacy npm nginx php5.6-fpm php5.6-cli php5.6-mysql php5.6-gd php5.6-json php5.6-curl php5.6-intl php5.6-mbstring php5.6-imagick php5.6-xml mysql-server mysql-client gettext imagemagick postfix ruby-compass
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-unauthenticated --no-install-recommends php-apcu
RUN service nginx stop && update-rc.d -f nginx disable
RUN service php5.6-fpm stop && update-rc.d -f php5.6-fpm disable
RUN service mysql stop && update-rc.d -f mysql disable

RUN service apparmor stop && update-rc.d -f apparmor disable

RUN npm install -g emergence

RUN curl -s https://raw.githubusercontent.com/habitat-sh/habitat/master/components/hab/install.sh | sudo bash
RUN hab pkg install jarvus/sencha-cmd/5.1.3.61/20170606195324 jarvus/underscore
RUN hab pkg binlink jarvus/sencha-cmd sencha
RUN hab pkg binlink jarvus/underscore underscore


# overwrite this with 'CMD []' in a dependent Dockerfile
CMD ["/bin/bash"]
