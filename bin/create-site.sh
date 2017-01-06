#!/bin/bash


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
    echo "HANDLE                = ${HANDLE}"
    echo "LABEL                 = ${LABEL}"
    echo "PRIMARY_HOSTNAME      = ${PRIMARY_HOSTNAME}"
    echo "SECONDARY_HOSTNAMES   = ${SECONDARY_HOSTNAMES}"
    echo "PARENT_HOSTNAME       = ${PARENT_HOSTNAME}"
    echo "PARENT_KEY            = ${PARENT_KEY}"
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