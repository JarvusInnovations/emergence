#!/bin/bash

hab sup term
hab pkg exec core/busybox-static killall php-fpm
hab pkg exec core/busybox-static killall nginx
hab pkg exec core/busybox-static killall mysqld
rm /hab/svc/emergence-kernel/var/run/kernel.sock
find /hab/svc/emergence-kernel/var/run/ -type f -delete