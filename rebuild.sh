#!/bin/bash

# reset runtime env
./clean-runtime.sh

rm -R /hab/svc/*/

exec build