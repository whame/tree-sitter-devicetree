#!/usr/bin/env bash

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage:" $(basename "$0") "PATH"
    exit 22
fi

FILES=($(find "$1" -iregex ".+\.dts[io]?$"))
nrfiles=${#FILES[@]}
if [ $nrfiles -eq 0 ]; then
    echo "ERROR: No devicetree files found in \"$1\""
    exit 2
fi

failed=()
count=0
for file in "${FILES[@]}"; do
    count=$(($count + 1))
    echo -n -e "\rParsing... $count / $nrfiles"

    tree-sitter parse $file > /dev/null
    if [ $? -ne 0 ]; then
        failed+=("$file")
    fi
done

echo ""

nrfailed=${#failed[@]}
if [ $nrfailed -gt 0 ]; then
    for file in "${failed[@]}"; do
        echo "FAIL: $file"
    done
fi

nrparsed=$(($nrfiles - $nrfailed))

echo "Parsed: $nrparsed / $nrfiles ($(($nrparsed / $nrfiles * 100)) %)"

exit $([ $nrfailed -eq 0 ])
