#!/usr/bin/env bash
# Installs the optional offline speech engine for Still Notes.
#
# Adds Vosk to a private virtualenv (the companion's normal dependencies stay
# zero), downloads a small English model, and leaves a wrapper you can use to
# start the connector with speech enabled.
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$HOME/.still-notes"
VENV="$ROOT/venv"
MODEL="$ROOT/vosk-model"

say() { printf "\033[1m%s\033[0m\n" "$*"; }

PY=$(command -v python3 || true)
if [ -z "$PY" ]; then
  echo "python3 not found. Install Python 3.9 or newer first."
  exit 1
fi

mkdir -p "$ROOT"

if [ ! -x "$VENV/bin/python" ]; then
  say "Creating a private Python environment in $VENV"
  "$PY" -m venv "$VENV"
fi

say "Installing vosk"
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet vosk

if [ ! -d "$MODEL" ]; then
  say "Downloading the English model (~70 MB)"
  tmp="$ROOT/model.zip"
  curl -# -L -o "$tmp" https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
  unzip -q -o "$tmp" -d "$ROOT"
  rm -f "$tmp"
  mv "$ROOT/vosk-model-small-en-us-0.15" "$MODEL"
else
  say "Model already installed: $MODEL"
fi

say "Checking the engine loads"
VOSK_MODEL="$MODEL" "$VENV/bin/python" - <<'PY'
import json, os, wave, io
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
model = Model(os.environ["VOSK_MODEL"])
buf = io.BytesIO()
with wave.open(buf, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(b"\x00\x00" * 16000)
KaldiRecognizer(model, 16000).FinalResult()
print(json.dumps({"ok": True, "model": os.path.basename(os.environ["VOSK_MODEL"])}))
PY

# The connector must run inside this venv so it can import vosk.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cat > "$ROOT/run-companion.sh" <<EOF
#!/usr/bin/env bash
export VOSK_MODEL="$MODEL"
export OMLX_BASE_URL="\${OMLX_BASE_URL:-http://127.0.0.1:8000/v1}"
cd "$REPO"
exec "$VENV/bin/python" "$REPO/scripts/local-companion.py" "\$@"
EOF
chmod +x "$ROOT/run-companion.sh"

cat <<EOF

Done. Offline speech is installed.

Start the connector with speech support:
  $ROOT/run-companion.sh

(or: VOSK_MODEL="$MODEL" $VENV/bin/python scripts/local-companion.py)

Then reload Still Notes and start a recording — the live-speech checkbox now
says "offline, on this computer". Your audio never leaves the machine.
EOF
