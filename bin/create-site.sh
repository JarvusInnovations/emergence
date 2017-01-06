#!/bin/bash

DEFAULT_PRECACHE_TREES='dwoo-plugins,event-handlers,html-templates,php-classes,php-config,php-migrations,site-root,site-tasks'
DEFAULT_GENERATE_TABLES='UserSession,User'

for i in "$@"
do
case $i in
    --kernel-host=*)
        KERNEL_HOST="${i#*=}"
        shift
        ;;
    --kernel-user=*)
        KERNEL_USER="${i#*=}"
        shift
        ;;
    --kernel-password=*)
        KERNEL_PASSWORD="${i#*=}"
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

if [ "$GENERATE_TABLES" ] || [ "$PRECACHE_TREES" ] || [ "$ENTER_SHELL" ]; then
    command -v underscore >/dev/null 2>&1 || { echo >&2 "underscore must be installed to use --precache-trees or --generate-tables"; exit 1; }
fi

if [ -z "$KERNEL_HOST" ]; then
    KERNEL_HOST="localhost"
fi

if [ -z "$KERNEL_USER" ]; then
    KERNEL_USER="admin"
fi

if [ -z "$KERNEL_PASSWORD" ]; then
    KERNEL_PASSWORD="admin"
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

if [ -z "$PARENT_HOSTNAME" ]; then
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
    -H "Content-Type: application/json" \
    --user "${KERNEL_USER}:${KERNEL_PASSWORD}" \
    -d "${REQUEST_BODY}" \
    "http://${KERNEL_HOST}:9083/sites"
)

echo "$RESPONSE"

if [ -z "$PRECACHE_TREES" ] && [ -z "$GENERATE_TABLES" ] && [ -z "$ENTER_SHELL" ]; then
    exit 0
fi

SITE_HANDLE=$(echo "${RESPONSE}" | underscore --outfmt=text extract data.handle)

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
