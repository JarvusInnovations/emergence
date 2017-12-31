# Emergence

[![Join the chat at https://gitter.im/JarvusInnovations/Emergence](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/JarvusInnovations/Emergence?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Emergence is a NodeJS-powered server that provides a web interface for configuring and launching the services that power your website or application. It provides virtualized storage containers for your code and assets that are accessible via WebDAV and API. Each storage container maintains complete version history for all files and can be linked over the web to a parent container that files will be inherited from just-in-time.


## Features

- Rich web interface provides for all setup and management
- Plugin-based support for system services to be configured and run
  - Plugins included for nginx and mysql
- Versioned storage containers
  - Inherit remote containers over http
  -  Copy-on-write
  -  Accessible remotely via WebDAV and locally via API
-  PHP development framework
  - Classes automatically loaded from storage container
  - Lightweight MVC classes optimized for serial inheritance across sites
  - Extendable templating system powered by Dwoo


## Installation

See http://emr.ge/docs


## Building with Habitat

- `cd ~/Repositories/emergence`
- `hab studio enter`
- `build`
- Optionally export a docker container image: `hab pkg export docker emergence/emergence-kernel`


## Debugging with Habitat

From within studio: `hab sup start emergence/emergence-kernel`


## Running with Docker

- Start a container from new image: `docker run -it -p 9080:80 -p 9083:9083 --name myemergence emergence/emergence-kernel`


## Habitat Migration Todo

- [X] Use habitat config system to generate base service configs, add `include .../var/nginx.sites` to nginx, stick dynamic ish there
- [ ] Compare stock services configs with hab-provided configs
- [ ] Pull Request mariadb fix
- [ ] Get nginx running with configured external config
- [X] Move stock nginx config bodies to .include files (e.g. http.include)
- [X] Add default static nginx site to nginx.conf before sites include
- [ ] Review all initialized permissions
- [ ] Remove shelljs
- [ ] Upgrade dwoo and see if php7 works

- Get docker container working
  - [X] Run new docker container
  - [X] Check that Zend is loaded now
  - [X] get shell wrapper working
  - [X] Figure out why cookies dont work -- set from console for now
  - [X] Commit changes

- [ ] PR readline into core-plans php and php5
