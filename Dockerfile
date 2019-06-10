FROM ubuntu:16.04


# initialize .ssh directory
RUN mkdir -p ~/.ssh \
    && chmod 700 ~/.ssh \
    && touch ~/.ssh/authorized_keys \
    && chmod 600 ~/.ssh/authorized_keys


# intsall Ubuntu packages
RUN export DEBIAN_FRONTEND=noninteractive \
    && export LC_ALL=en_US.UTF-8 \
    && apt-get update \
    && apt-get install -y --allow-unauthenticated \
        apt-utils \
        curl \
        g++ \
        gettext \
        git \
        imagemagick \
        language-pack-en-base \
        make \
        mysql-client \
        mysql-server \
        nginx \
        openssh-server \
        postfix \
        python \
        python-software-properties \
        ruby-compass \
        ruby-dev \
        screen \
        software-properties-common \
        sudo \
        tmux \
        vim \
    && add-apt-repository -y ppa:ondrej/php \
    && add-apt-repository ppa:certbot/certbot \
    && curl -sL https://deb.nodesource.com/setup_10.x | bash \
    # && apt-get update \ # above calls apt-get update
    && apt-get install -y --allow-unauthenticated --no-install-recommends \
        certbot python3-pyasn1 \
        nodejs \
        php-apcu \
        php5.6-cli \
        php5.6-curl \
        php5.6-fpm \
        php5.6-gd \
        php5.6-imagick \
        php5.6-intl \
        php5.6-json \
        php5.6-mbstring \
        php5.6-mysql \
        php5.6-xml \
    && rm -rf /var/lib/apt/lists/*


# disable built-in services for emergence
RUN service nginx stop \
    && service php5.6-fpm stop \
    && service mysql stop \
    && service apparmor stop \
    && update-rc.d -f nginx disable \
    && update-rc.d -f php5.6-fpm disable \
    && update-rc.d -f mysql disable \
    && update-rc.d -f apparmor disable


# install Habitat client and packages for emergence
RUN curl -s https://raw.githubusercontent.com/habitat-sh/habitat/master/components/hab/install.sh | bash -s -- -v 0.79.0
RUN hab pkg install jarvus/sencha-cmd/6.5.2.15 jarvus/underscore \
    && hab pkg binlink jarvus/sencha-cmd sencha \
    && hab pkg binlink jarvus/underscore underscore


# install helpful administrative commands
RUN npm install -g htpasswd


# install emergence
COPY . /src
RUN npm install -g /src


# setup and expose emergence
RUN mkdir -p /emergence
EXPOSE 22 80 3306 9083
ENV MYSQL_HOME=/emergence/services/etc
VOLUME ["/emergence"]


# setup entrypoint
RUN echo '#!/bin/bash\nrm /emergence/kernel.sock /emergence/services/run/*/*\nexec emergence-kernel' > /entrypoint.sh \
    && chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
