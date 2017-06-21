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
  core/coreutils
  core/bash
  core/git
  core/curl
  core/openssh
  emergence/nginx
  emergence/mariadb
  emergence/php5
)

do_install() {
  do_default_install
  fix_interpreter "$scaffolding_app_prefix/bin/*" core/bash bin/bash
}
