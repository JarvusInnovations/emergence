**Note:** _this is an experimental branch_, for the current stable release see https://github.com/JarvusInnovations/Emergence-preview

Emergence
=========

Emergence is a NodeJS-powered server that provides a web interface for configuring and launching the services that power your website or application. It provides virtualized storage containers for your code and assets that are accessible via WebDAV and API. Each storage container maintains complete version history for all files and can be linked over the web to a parent container that files will be inherited from just-in-time.


Features
---------
* Rich web interface provides for all setup and management
* Plugin-based support for system services to be configured and run
	* Plugins included for nginx and mysql
* Versioned storage containers
	* Inherit remote containers over http
	* Copy-on-write
	* Accessible remotely via WebDAV and locally via API
* PHP development framework
	* Classes automatically loaded from storage container
	* Lightweight MVC classes optimized for serial inheritance across sites
	* Extendable templating system powered by Dwoo


Requirements
-------------
* NodeJS
* npm
	* underscore
	* node-static
* mysql
* nginx
* php-fpm


Installation
--------------
	mkdir /emergence
	cd /emergence
	git clone git@github.com:JarvusInnovations/Emergence.git
	cd kernel
	npm install underscore node-static mysql
	cp kernel.config.json.SAMPLE kernel.config.json
	
Edit kernel.config.json, insert MySQL manageUser & managePassword and optionally set IPs for management and web servers. MySQL manage user must have global privileges to SELECT, INSERT, UPDATE, DELETE, CREATE, RELOAD, SHOW DATABASES, CREATE USER, and GRANT;


Getting Started
------------------
	cd /emergence/kernel
	sudo node kernel


Visit http://serverhost:1337 in your browser
