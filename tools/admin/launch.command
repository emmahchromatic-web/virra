#!/bin/zsh
# Double-clickable launcher for the VIRRA admin console.
#
# Finder runs a .command file in a new Terminal window, which is a real tty —
# so this works where the embedded terminal panel does not. The Desktop
# shortcuts are thin wrappers around this file; this is the one to edit.
#
#   ./launch.command              read/write
#   ./launch.command --readonly   every write disabled

set -e
cd "$(dirname "$0")"

READONLY=0
[[ "$1" == "--readonly" ]] && READONLY=1

print ""
print "  VIRRA admin console"
print "  ------------------------------------------------"

# --- dependencies ----------------------------------------------------------
if [[ ! -x .venv/bin/python ]]; then
  print ""
  print "  The Python environment is missing."
  print "  Run this once, in Terminal:"
  print ""
  print "    cd ~/dev/virra && python3 -m venv tools/admin/.venv &&\\"
  print "      tools/admin/.venv/bin/pip install -r tools/admin/requirements.txt"
  print ""
  print "  Press any key to close."
  read -k 1 -s
  exit 1
fi

# --- key -------------------------------------------------------------------
# An empty value counts as missing, which is the state a fresh .env is in.
if ! grep -qE '^SUPABASE_SERVICE_ROLE_KEY=.+' .env 2>/dev/null; then
  print ""
  print "  No Supabase key saved yet."
  print ""
  print "  Copy the service_role key in the Supabase dashboard"
  print "  (Project Settings -> API -> service_role, the secret one"
  print "  below anon — click to reveal), then press Return."
  print ""
  print "  Or press Ctrl-C to close."
  read -s
  print ""
  if ! .venv/bin/python set_key.py; then
    print ""
    print "  Press any key to close."
    read -k 1 -s
    exit 1
  fi
fi

# --- already running? ------------------------------------------------------
# Double-clicking twice is the obvious thing to do, and without this it gives
# a raw Python traceback about the address being in use.
PORT=${ADMIN_PORT:-$(grep -E '^ADMIN_PORT=' .env 2>/dev/null | cut -d= -f2)}
PORT=${PORT:-8787}
if lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  print ""
  print "  The console is already running."
  print "  Open it at: http://127.0.0.1:$PORT"
  print ""
  open "http://127.0.0.1:$PORT" 2>/dev/null || true
  print "  Press any key to close this window."
  read -k 1 -s
  exit 0
fi

# --- go --------------------------------------------------------------------
print ""
if [[ $READONLY == 1 ]]; then
  print "  Starting READ-ONLY — nothing can be changed."
  print "  Close this window or press Ctrl-C to stop."
  ADMIN_READONLY=1 .venv/bin/python run.py
else
  print "  Starting in read/write mode against production."
  print "  Close this window or press Ctrl-C to stop."
  .venv/bin/python run.py
fi
