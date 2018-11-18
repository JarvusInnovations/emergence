#!/bin/bash

DEFAULT_PRECACHE_TREES='dwoo-plugins,event-handlers,html-templates,php-classes,php-config,php-migrations,site-root,site-tasks'
DEFAULT_GENERATE_TABLES='UserSession,User'

for i in "$@"
do
case $i in
    --kernel-socket=*)
        KERNEL_SOCKET="${i#*=}"
        shift
        ;;
    --handle=*)
        HANDLE="${i#*=}"
        shift
        ;;
    --primary-hostname=*)
        PRIMARY_HOSTNAME="${i#*=}"
        shift
        ;;
    --secondary-hostnames=*)
        SECONDARY_HOSTNAMES="${i#*=}"
        shift
        ;;
    --label=*)
        LABEL="${i#*=}"
        shift
        ;;
    --parent-hostname=*)
        PARENT_HOSTNAME="${i#*=}"
        shift
        ;;
    --parent-key=*)
        PARENT_KEY="${i#*=}"
        shift
        ;;
    --no-parent)
        NO_PARENT=YES
        shift
        ;;
    --precache-trees)
        PRECACHE_TREES="$DEFAULT_PRECACHE_TREES"
        shift
        ;;
    --precache-trees+=*)
        PRECACHE_TREES="$DEFAULT_PRECACHE_TREES,${i#*=}"
        shift
        ;;
    --precache-trees=*)
        PRECACHE_TREES="${i#*=}"
        shift
        ;;
    --generate-tables)
        GENERATE_TABLES="$DEFAULT_GENERATE_TABLES"
        shift
        ;;
    --generate-tables+=*)
        GENERATE_TABLES="$DEFAULT_GENERATE_TABLES,${i#*=}"
        shift
        ;;
    --generate-tables=*)
        GENERATE_TABLES="${i#*=}"
        shift
        ;;
    --shell)
        ENTER_SHELL=YES
        shift
        ;;
    --verbose)
        VERBOSE=YES
        shift
        ;;
    *)
        echo "Unknown option: $i"
        exit 1
    ;;
esac
done

if [ -z "$KERNEL_SOCKET" ]; then
    KERNEL_SOCKET="/emergence/kernel.sock"
fi

if [ ! -S "$KERNEL_SOCKET" ]; then
    echo "kernel socket not available at ${KERNEL_SOCKET}"
    exit 1
fi

if [ -z "$HANDLE" ]; then
    if [ ! -f /usr/share/dict/words ]; then
        echo "Handle not provided and words list unavailable. Specify --handle or install the wamerican package"
        exit 1
    fi

    HANDLE=`echo "$(shuf -n1 /usr/share/dict/words)-$(shuf -n1 /usr/share/dict/words)" | tr '[:upper:]' '[:lower:]'`
    HANDLE="${HANDLE//[!a-z-]/}"
    HANDLE="${HANDLE:0:16}"
fi

if [ -z "$PRIMARY_HOSTNAME" ]; then
    PRIMARY_HOSTNAME="${HANDLE}.local"
fi

if [ -z "$PARENT_HOSTNAME" ] && [ -z "$NO_PARENT" ]; then
    PARENT_HOSTNAME="skeleton-v1.emr.ge"
    PARENT_KEY="8U6kydil36bl3vlJ"
fi

if [ "$VERBOSE" ]; then
    echo >&2 "HANDLE                = ${HANDLE}"
    echo >&2 "LABEL                 = ${LABEL}"
    echo >&2 "PRIMARY_HOSTNAME      = ${PRIMARY_HOSTNAME}"
    echo >&2 "SECONDARY_HOSTNAMES   = ${SECONDARY_HOSTNAMES}"
    echo >&2 "PARENT_HOSTNAME       = ${PARENT_HOSTNAME}"
    echo >&2 "PARENT_KEY            = ${PARENT_KEY}"
fi

read -d '' REQUEST_BODY << END_OF_BODY
{
    "handle": "$HANDLE",
    "label": "$LABEL",
    "primary_hostname": "$PRIMARY_HOSTNAME",
    "hostnames": "$SECONDARY_HOSTNAMES",
    "parent_hostname": "$PARENT_HOSTNAME",
    "parent_key": "$PARENT_KEY"
}
END_OF_BODY

RESPONSE=$(
  curl -s \
    -X POST \
    --unix-socket "${KERNEL_SOCKET}" \
    -H "Content-Type: application/json" \
    -d "${REQUEST_BODY}" \
    "http:/sites"
)

echo "$RESPONSE"

if [ -z "$PRECACHE_TREES" ] && [ -z "$GENERATE_TABLES" ] && [ -z "$ENTER_SHELL" ]; then
    exit 0
fi

# determine location of this script
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

# determine path to underscore
UNDERSCORE="$DIR/../node_modules/.bin/underscore"

# extract site handle from response
SITE_HANDLE=$(echo "${RESPONSE}" | $UNDERSCORE --outfmt=text extract data.handle)

if [ "$PRECACHE_TREES" ]; then
    emergence-shell $SITE_HANDLE 1>&2 << END_OF_PHP
        foreach (preg_split('/[\s,]/', "$PRECACHE_TREES") AS \$tree) {
            echo "Caching \$tree...".str_repeat(" ",25-strlen(\$tree));
            echo Emergence_FS::cacheTree(\$tree)." files downloaded\n";
        }
END_OF_PHP
fi

if [ "$GENERATE_TABLES" ]; then
    emergence-shell $SITE_HANDLE 1>&2 << END_OF_PHP
        foreach (preg_split('/[\s,]/', "$GENERATE_TABLES") AS \$className) {
            echo "Generating table for \$className...".str_repeat(" ",40-strlen(\$className));
            echo \$className::\$tableName."\n";
            DB::multiQuery(SQL::getCreateTable(\$className));
        }
END_OF_PHP
fi

if [ "$ENTER_SHELL" ]; then
    exec emergence-shell $SITE_HANDLE
fi
