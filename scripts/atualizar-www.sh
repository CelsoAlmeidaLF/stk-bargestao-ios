#!/usr/bin/env bash
# Atualiza www/ com a edição móvel montada no projeto Capacitor (../capacitor: PWA + patch + local/, SQLite).
# O www/ fica versionado aqui porque o build iOS roda num Mac do GitHub, sem o PWA ao lado.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd ../capacitor && npm run web)
rm -rf www && cp -r ../capacitor/www ./www
echo "www/ atualizado: $(cat www/ORIGEM.txt | head -1)"
