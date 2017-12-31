#!/bin/bash

export HAB_DOCKER_OPTS="-p 9080:80 -p 9083:9083"
export HAB_ORIGIN=emergence

exec hab studio enter
