#!/bin/bash

./clean-runtime.sh

export NODE_PATH="`hab pkg path emergence/emergence-kernel`/app/node_modules/"

exec hab pkg exec core/node node bin/kernel