pkg_name=emergence-kernel
pkg_origin=emergence
pkg_version="1.0.0"
pkg_upstream_url="https://github.com/JarvusInnovations/emergence"
pkg_scaffolding=core/scaffolding-node
pkg_svc_user="root"

pkg_build_deps=(
  core/make
  core/gcc
  core/python2
)

pkg_deps=(
  emergence/nginx
  emergence/mariadb
  emergence/php
)