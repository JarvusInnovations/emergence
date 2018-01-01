pkg_name=mariadb
pkg_origin=emergence
pkg_version=10.2.6
pkg_description="An open source monitoring software for networks and applications"
pkg_maintainer="The Habitat Maintainers <humans@habitat.sh>"
pkg_license=('GPL-2.0')
pkg_source=https://github.com/MariaDB/server/archive/${pkg_name}-${pkg_version}.tar.gz
pkg_shasum=64dc9152daee2b396828963298edc55f36ad1add65a1f19d3db5ff0962d46842
pkg_dirname="server-${pkg_name}-${pkg_version}"
pkg_deps=(core/ncurses core/gcc-libs core/zlib core/sed)
pkg_build_deps=(core/gcc core/make core/coreutils core/cmake)
pkg_bin_dirs=(bin)
pkg_include_dirs=(include)
pkg_lib_dirs=(lib)
pkg_exports=(
  [port]=port
)
pkg_exposes=(port)
pkg_svc_user="hab"

do_prepare() {
    if [ -f CMakeCache.txt ]; then
      rm CMakeCache.txt
    fi

    sed -i 's/^.*abi_check.*$/#/' CMakeLists.txt
    sed -i "s@data/test@\${INSTALL_MYSQLTESTDIR}@g" sql/CMakeLists.txt
    export CXXFLAGS="$CFLAGS"
}

do_build() {
    cmake . -DCMAKE_INSTALL_PREFIX="${pkg_prefix}" \
            -DCMAKE_PREFIX_PATH="$(pkg_path_for core/ncurses)" \
            -DCMAKE_BUILD_TYPE=Release \
            -DWITH_READLINE=OFF

    make

    return $?
}

do_install() {
    attach
    make install
    attach
    rm -rf "${pkg_prefix}/mysql-test"
    rm -rf "${pkg_prefix}/bin/mysql_client_test"
    rm -rf "${pkg_prefix}/bin/mysql_test"
}
