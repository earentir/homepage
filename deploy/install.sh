#!/usr/bin/env bash
# Run from the directory that contains this script (e.g. copy homepage, homepage.service,
# this script, and optionally homepage.config to the server, then: sudo ./install.sh).
set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
	exec sudo "$0" "$@"
fi

warn() {
	echo "install: $*" >&2
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${ROOT}/homepage"
UNIT_SRC="${ROOT}/homepage.service"
CFG_SRC="${ROOT}/homepage.config"
DEST="/opt/homepage"
UNIT_DST="/etc/systemd/system/homepage.service"

BIN_OK=0
UNIT_OK=0

if [ -f "$BIN" ] && [ -x "$BIN" ]; then
	BIN_OK=1
else
	warn "missing or non-executable ${BIN} — skipping binary install"
fi

if [ -f "$UNIT_SRC" ]; then
	UNIT_OK=1
else
	warn "missing ${UNIT_SRC} — skipping systemd unit install"
fi

if [ "$BIN_OK" -eq 0 ] && [ "$UNIT_OK" -eq 0 ]; then
	warn "nothing to copy from ${ROOT}; exiting"
	exit 0
fi

if ! getent passwd homepage >/dev/null; then
	useradd -r -d "$DEST" -s /usr/sbin/nologin homepage
fi

install -d -m755 "$DEST"

if [ "$BIN_OK" -eq 1 ]; then
	install -m755 "$BIN" "${DEST}/homepage"
fi

if [ "$UNIT_OK" -eq 1 ]; then
	install -m644 "$UNIT_SRC" "$UNIT_DST"
fi

if [ -f "$CFG_SRC" ]; then
	install -m640 "$CFG_SRC" "${DEST}/homepage.config"
elif [ -f "${DEST}/homepage.config" ]; then
	warn "note: no homepage.config beside script — keeping ${DEST}/homepage.config"
else
	warn "note: no homepage.config beside script — writing default ${DEST}/homepage.config"
	cat >"${DEST}/homepage.config" <<'EOF'
{
  "port": "8080",
  "ip": "0.0.0.0",
  "id": "homepage",
  "debug": false,
  "log": ""
}
EOF
fi

chown -R homepage:homepage "$DEST"

if [ "$UNIT_OK" -eq 1 ]; then
	systemctl daemon-reload || warn "systemctl daemon-reload failed"
	systemctl enable --now homepage.service || warn "systemctl enable --now homepage.service failed"
elif [ -f "$UNIT_DST" ]; then
	systemctl daemon-reload || warn "systemctl daemon-reload failed"
	systemctl try-restart homepage.service || warn "systemctl try-restart homepage.service failed (service may be inactive)"
fi

if [ "$BIN_OK" -eq 1 ]; then
	echo "Binary at ${DEST}/homepage (listens on 127.0.0.1:8080 per unit; use nginx in front)."
fi
if [ "${1:-}" = "--smbios" ] && [ -f "${DEST}/homepage" ]; then
	setcap cap_sys_rawio,cap_dac_read_search=ep "${DEST}/homepage" || warn "setcap failed or unsupported for ${DEST}/homepage"
	echo "SMBIOS caps applied (if setcap succeeded)."
fi

echo "Done."

