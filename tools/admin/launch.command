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
RUNNING_PID=$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
if [[ -n "$RUNNING_PID" ]]; then
  # Which mode is the running one in? Checking the port alone is not enough:
  # opening the browser at a read-only instance when read/write was asked for
  # looks like the launcher ignoring the choice.
  RUNNING_READONLY=0
  ps eww -p "$RUNNING_PID" 2>/dev/null | tr ' ' '\n' | grep -q '^ADMIN_READONLY=1' && RUNNING_READONLY=1

  if [[ "$RUNNING_READONLY" == "$READONLY" ]]; then
    print ""
    print "  Already running in this mode."
    print "  Open it at: http://127.0.0.1:$PORT"
    open "http://127.0.0.1:$PORT" 2>/dev/null || true
    print ""
    print "  Press any key to close this window."
    read -k 1 -s
    exit 0
  fi

  [[ "$RUNNING_READONLY" == 1 ]] && HAVE="read-only" || HAVE="read/write"
  [[ "$READONLY" == 1 ]] && WANT="read-only" || WANT="read/write"
  print ""
  print "  The console is already running in $HAVE mode,"
  print "  but you asked for $WANT."
  print ""
  if [[ ! -t 0 ]]; then
    print "  Stop the other one first (close its window, or Ctrl-C in it)."
    exit 1
  fi
  print -n "  Stop it and restart in $WANT mode? [Y/n] "
  read -r ANSWER
  if [[ -n "$ANSWER" && "$ANSWER" != [Yy]* ]]; then
    print "  Left it alone. Opening the $HAVE one."
    open "http://127.0.0.1:$PORT" 2>/dev/null || true
    exit 0
  fi
  kill "$RUNNING_PID" 2>/dev/null
  for i in {1..20}; do
    lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.25
  done
  print "  Stopped."
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
