#!/bin/sh

set -eu

escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

MIP_VERSION_ESCAPED=$(escape_js "${MIP_VERSION:-}")
NOTEBOOK_ENABLED_ESCAPED=$(escape_js "${NOTEBOOK_ENABLED:-0}")
JUPYTER_CONTEXT_ESCAPED=$(escape_js "${JUPYTER_CONTEXT:-notebook}")
GUIDE_COVARIATE_ESCAPED=$(escape_js "${GUIDE_COVARIATE:-Sex}")
GUIDE_VARIABLE_ESCAPED=$(escape_js "${GUIDE_VARIABLE:-Age}")

envsubst '$PLATFORM_BACKEND_SERVER $PLATFORM_BACKEND_CONTEXT $NOTEBOOK_ENABLED $JUPYTER_SERVER $JUPYTER_CONTEXT' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

mkdir -p /usr/share/nginx/html/assets

cat > /usr/share/nginx/html/assets/env.js <<EOF
(function (window) {
    window.__env = window.__env || {};

    // Environment variables
    window.__env.MIP_VERSION = "${MIP_VERSION_ESCAPED}";
    window.__env.NOTEBOOK_ENABLED = "${NOTEBOOK_ENABLED_ESCAPED}";
    window.__env.JUPYTER_CONTEXT_PATH = "/${JUPYTER_CONTEXT_ESCAPED}";
    window.__env.GUIDE_COVARIATE = "${GUIDE_COVARIATE_ESCAPED}";
    window.__env.GUIDE_VARIABLE = "${GUIDE_VARIABLE_ESCAPED}";
}(this));
EOF

exec nginx -g 'daemon off;'