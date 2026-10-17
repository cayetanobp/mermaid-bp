#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
desktop="$root/desktop-app"
bundle="$desktop/src-tauri/target/release/bundle/deb"
out="${MERMAID_BP_LINUX_UPDATER_OUT:-$root/linux-updater-artifacts}"
diagnostics="${MERMAID_BP_LINUX_UPDATER_DIAGNOSTICS:-$root/linux-updater-diagnostics}"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/mermaid-bp-linux-updater.XXXXXX")"
mkdir -p "$scratch/tmp"
export TMPDIR="$scratch/tmp"
server_port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"

mkdir -p "$out" "$diagnostics"
chmod 700 "$scratch"
cleanup() { if [[ -n "${driver_pid:-}" ]]; then kill "$driver_pid" 2>/dev/null || true; fi; rm -rf "$scratch"; }
trap cleanup EXIT

command -v npm >/dev/null
command -v dpkg-deb >/dev/null
command -v dpkg-query >/dev/null
command -v sudo >/dev/null
command -v tauri-driver >/dev/null
command -v WebKitWebDriver >/dev/null || command -v webkit2gtk-driver >/dev/null
python3 -c 'import selenium' >/dev/null
test -n "${TAURI_SIGNING_PRIVATE_KEY:-}" || { echo 'TAURI_SIGNING_PRIVATE_KEY is required to build a signed Linux updater.' >&2; exit 1; }

candidate_version="$(node -p "require('$desktop/src-tauri/tauri.conf.json').version")"
if [[ "$candidate_version" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$ ]]; then
  beta_index="${BASH_REMATCH[2]}"
  if (( beta_index > 0 )); then
    base_version="${BASH_REMATCH[1]}-beta.$((beta_index - 1))"
  else
    base_version="${BASH_REMATCH[1]}-alpha.1"
  fi
else
  echo "Expected a beta SemVer candidate version, found $candidate_version." >&2
  exit 1
fi
find_deb_for_version() {
  local wanted_version="$1" path package version
  local -a matches=()
  while IFS= read -r -d '' path; do
    package="$(dpkg-deb -f "$path" Package)"
    version="$(dpkg-deb -f "$path" Version)"
    if [[ "$package" == "mermaid-bp" && "$version" == "$wanted_version" ]]; then
      matches+=("$path")
    fi
  done < <(find "$bundle" -maxdepth 1 -type f -name '*.deb' -print0)
  if [[ "${#matches[@]}" -ne 1 ]]; then
    echo "Expected exactly one mermaid-bp .deb for version $wanted_version; found ${#matches[@]}." >&2
    return 1
  fi
  printf '%s\n' "${matches[0]}"
}

candidate="$(find_deb_for_version "$candidate_version")"
candidate_signature="$candidate.sig"
test -s "$candidate" || { echo "Missing candidate Debian package: $candidate" >&2; exit 1; }
test -s "$candidate_signature" || { echo "Missing non-empty updater signature: $candidate_signature" >&2; exit 1; }
cp "$candidate" "$out/$(basename "$candidate")"
cp "$candidate_signature" "$out/$(basename "$candidate_signature")"
test -s "$out/$(basename "$candidate_signature")" || { echo 'Exported updater signature is empty.' >&2; exit 1; }
app_bin="${MERMAID_BP_BIN:-$(dpkg-query -L mermaid-bp | awk '/^\/usr\/bin\// { print; exit }')}"
test -x "$app_bin" || { echo "Installed app executable not found: $app_bin" >&2; exit 1; }

python3 - "$scratch/base-overlay.json" "$base_version" "$server_port" <<'PY'
import json, pathlib, sys
path, version, port = sys.argv[1:]
pathlib.Path(path).write_text(json.dumps({"version":version,"plugins":{"updater":{"endpoints":[f"http://127.0.0.1:{port}/latest.json"],"dangerousInsecureTransportProtocol":True}}}), encoding="utf-8")
PY

if ! (cd "$desktop" && npm exec -- tauri build --config "$scratch/base-overlay.json" -- --locked) >"$diagnostics/base-build.log" 2>&1; then
  python3 - "$diagnostics/base-build.log" <<'PY'
import os, pathlib, sys
path=pathlib.Path(sys.argv[1]); key=os.environ.get("TAURI_SIGNING_PRIVATE_KEY","")
if key: path.write_text(path.read_text(encoding="utf-8",errors="replace").replace(key,"[redacted signing key]"),encoding="utf-8")
PY
  cat "$diagnostics/base-build.log"
  exit 1
fi
base_deb="$(find_deb_for_version "$base_version")"
test -s "$base_deb" || { cat "$diagnostics/base-build.log"; echo 'Base .deb was not produced.' >&2; exit 1; }
test -s "$base_deb.sig" || { cat "$diagnostics/base-build.log"; echo 'Base updater signature was not produced.' >&2; exit 1; }
test "$(dpkg-deb -f "$base_deb" Package)" = mermaid-bp
test "$(dpkg-deb -f "$base_deb" Version)" = "$base_version"
sudo -n apt-get install -y --allow-downgrades "$base_deb"

# Debian updater installs use pkexec. Route that test-only request through the
# runner's passwordless sudo policy so the native package update remains real.
mkdir -p "$scratch/bin"
cat >"$scratch/bin/pkexec" <<'SH'
#!/usr/bin/env bash
[[ $# -eq 3 && "$1" == "dpkg" && "$2" == "-i" ]] || exit 64
case "$3" in
  "$TMPDIR"/tauri_deb_update*/package.deb) ;;
  *) exit 64 ;;
esac
exec sudo -n "$@"
SH
chmod 700 "$scratch/bin/pkexec"
export PATH="$scratch/bin:$PATH"

tauri-driver --port 4444 >"$diagnostics/tauri-driver.log" 2>&1 &
driver_pid=$!
for _ in $(seq 1 60); do if curl --silent --fail http://127.0.0.1:4444/status >/dev/null; then break; fi; sleep 1; done
curl --silent --fail http://127.0.0.1:4444/status >/dev/null || { cat "$diagnostics/tauri-driver.log"; exit 1; }

python3 - "$candidate" "$candidate_signature" "$candidate_version" "$base_version" "$diagnostics" "$server_port" "$app_bin" <<'PY'
import base64, http.server, json, pathlib, subprocess, sys, threading, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

candidate, signature_path, target, base, diagnostics, port, app_bin = sys.argv[1:]
candidate, out = pathlib.Path(candidate), pathlib.Path(diagnostics)
signature = pathlib.Path(signature_path).read_text(encoding="utf-8").strip()
mode = {"value":"offline"}
class Feed(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        with (out/"updater-feed.log").open("a",encoding="utf-8") as stream: stream.write((fmt%args)+"\n")
    def do_GET(self):
        if self.path == "/latest.json":
            if mode["value"] == "offline": self.send_response(503); self.end_headers(); self.wfile.write(b"unavailable"); return
            if mode["value"] == "none": self.send_response(204); self.end_headers(); return
            data=json.dumps({"version":target,"notes":"Validacion E2E del updater Debian.","pub_date":"2026-10-17T00:00:00Z","url":f"http://127.0.0.1:{port}/candidate.deb","signature":"invalid updater signature" if mode["value"]=="bad-signature" else signature}).encode()
            self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data); return
        if self.path == "/candidate.deb":
            data=candidate.read_bytes(); self.send_response(200); self.send_header("Content-Type","application/vnd.debian.binary-package"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data); return
        self.send_response(404); self.end_headers()
server=http.server.ThreadingHTTPServer(("127.0.0.1",int(port)),Feed)
threading.Thread(target=server.serve_forever,daemon=True).start()

def installed_version():
    p=subprocess.run(["dpkg-query","-W","-f=${Version}","mermaid-bp"],capture_output=True,text=True)
    return p.stdout.strip() if p.returncode==0 else ""
def connect():
    opts=webdriver.FirefoxOptions(); opts.set_capability("browserName","wry"); opts.set_capability("tauri:options",{"application":app_bin})
    return webdriver.Remote(command_executor="http://127.0.0.1:4444",options=opts)
def wait(d,fn,timeout=45): return WebDriverWait(d,timeout).until(fn)
def open_settings(d,section="General"):
    if not d.find_element(By.ID,"settings-dialog").get_attribute("open"):
        d.find_element(By.ID,"menu-configuracion").click(); wait(d,lambda x:x.find_element(By.ID,"settings-button").is_displayed()); d.find_element(By.ID,"settings-button").click()
    tabs=d.find_elements(By.CSS_SELECTOR,"#settings-dialog [role=tab]"); next(t for t in tabs if t.text.strip()==section).click()
def open_updater(d): open_settings(d,"General"); wait(d,lambda x:x.find_element(By.ID,"desktop-updates").is_displayed())
def check(d):
    d.find_element(By.ID,"check-updates").click(); wait(d,lambda x:x.find_element(By.ID,"check-updates").is_enabled()); return d.find_element(By.ID,"update-status").text
def install_plugin(d):
    manifest=base64.b64encode(json.dumps({"id":"updater-persistence-test","name":"Plugin persistente","description":"Comprueba persistencia tras actualizar.","version":"1.0.0","apiVersion":1,"enabledByDefault":True,"entry":"index.js"}).encode()).decode()
    module="export default {setup(context){context.ui.addAction({id:'alive',label:'Plugin persistente activo',run(){}});}};"
    module=base64.b64encode(module.encode()).decode()
    result=d.execute_async_script("const done=arguments[arguments.length-1];window.__TAURI__.core.invoke('install_plugin',{id:'updater-persistence-test',paths:['plugin.json','index.js'],contents:[arguments[0],arguments[1]]}).then(()=>done('ok'),e=>done(String(e)));",manifest,module)
    assert result=="ok",f"Plugin install bridge failed: {result}"
    d.refresh(); wait(d,lambda x:x.find_element(By.CSS_SELECTOR,"#editor .cm-content").is_displayed())
def verify_persistence(d):
    open_settings(d,"Editor"); assert d.find_element(By.ID,"setting-editorFontSize").get_attribute("value")=="18","Editor preference did not persist"
    open_settings(d,"Extensiones"); wait(d,lambda x:"Plugin persistente" in x.find_element(By.ID,"plugin-list").text)
    assert "Activo · 1.0.0" in d.find_element(By.CSS_SELECTOR,"[data-plugin-status='updater-persistence-test']").text
    assert d.find_element(By.ID,"plugin-updater-persistence-test-alive").text=="Plugin persistente activo"
    d.find_element(By.ID,"plugins-close").click()
def import_document(d, document):
    before=subprocess.run(["xdotool","getactivewindow","getwindowname"],capture_output=True,text=True)
    before_title=before.stdout.strip() if before.returncode==0 else ""
    d.find_element(By.ID,"open").click()
    deadline=time.time()+15
    while time.time()<deadline:
        active=subprocess.run(["xdotool","getactivewindow","getwindowname"],capture_output=True,text=True)
        if active.returncode==0 and active.stdout.strip() and active.stdout.strip()!=before_title: break
        time.sleep(.1)
    else: raise AssertionError("Native document chooser did not take focus")
    subprocess.run(["xdotool","key","ctrl+l"],check=True)
    time.sleep(.3)
    subprocess.run(["xdotool","type","--clearmodifiers","--delay","1",str(document)],check=True)
    subprocess.run(["xdotool","key","Return"],check=True)
    deadline=time.time()+30
    while time.time()<deadline:
        confirm=d.find_element(By.ID,"confirm-dialog")
        if confirm.get_attribute("open"):
            next(button for button in confirm.find_elements(By.TAG_NAME,"button") if button.text.strip()=="Continuar sin descargar").click()
            break
        if "updater-persistence-document.mmd" in d.find_element(By.ID,"message").text: break
        time.sleep(.2)
    wait(d,lambda x:"updater-persistence-document.mmd" in x.find_element(By.ID,"message").text,30)
    assert "Documento disponible tras actualizar" in d.find_element(By.CSS_SELECTOR,"#editor .cm-content").text

driver=None
try:
    driver=connect(); wait(driver,lambda d:d.find_element(By.CSS_SELECTOR,"#editor .cm-content").is_displayed())
    open_updater(driver); mode["value"]="offline"; assert "No se pudo buscar" in check(driver),"Network error was not reported"
    mode["value"]="none"; assert check(driver)=="No hay actualizaciones disponibles.","No-update response was not reported"
    open_settings(driver,"Editor"); Select(driver.find_element(By.ID,"setting-editorFontSize")).select_by_value("18")
    wait(driver,lambda d:"Cambios guardados" in d.find_element(By.ID,"settings-status").text); install_plugin(driver)
    document=out/"updater-persistence-document.mmd"
    document.write_text("flowchart LR\nA[Documento disponible tras actualizar] --> B[Se puede reabrir]\n",encoding="utf-8")
    import_document(driver,document)
    mode["value"]="bad-signature"; open_updater(driver); driver.find_element(By.ID,"check-updates").click()
    wait(driver,lambda d:f"Nueva versión: {target}" in d.find_element(By.ID,"update-version").text)
    driver.find_element(By.ID,"install-update").click(); wait(driver,lambda d:"No se pudo instalar" in d.find_element(By.ID,"update-status").text,120)
    assert installed_version()==base,"Invalid signature changed the installed package"
    assert "Documento disponible tras actualizar" in driver.find_element(By.CSS_SELECTOR,"#editor .cm-content").text,"Signature rejection damaged the open document"
    verify_persistence(driver)
    open_updater(driver); mode["value"]="candidate"; driver.find_element(By.ID,"check-updates").click()
    wait(driver,lambda d:f"Nueva versión: {target}" in d.find_element(By.ID,"update-version").text)
    driver.find_element(By.ID,"install-update").click()
    deadline=time.time()+180
    while time.time()<deadline and installed_version()!=target: time.sleep(1)
    assert installed_version()==target,f"Signed update did not install; version={installed_version()!r}"
    try: driver.quit()
    except Exception: pass
    driver=None; time.sleep(3); driver=connect()
    wait(driver,lambda d:d.find_element(By.CSS_SELECTOR,"#editor .cm-content").is_displayed(),120)
    open_updater(driver); mode["value"]="none"; assert check(driver)=="No hay actualizaciones disponibles."
    assert f"Versión instalada: {target}" in driver.find_element(By.ID,"update-current-version").text
    verify_persistence(driver)
    import_document(driver,document)
    driver.save_screenshot(str(out/"linux-updater-after-install.png"))
    print(f"Linux updater E2E passed: {base} -> {target}; network error, no update, bad signature, signed install/restart, preference/plugin persistence and document reopen verified.")
except Exception:
    if driver is not None:
        try:
            driver.save_screenshot(str(out/"linux-updater-failure.png"))
            (out/"linux-updater-failure.txt").write_text(driver.find_element(By.TAG_NAME,"body").text[:12000],encoding="utf-8")
        except Exception: pass
    raise
finally:
    if driver is not None:
        try: driver.quit()
        except Exception: pass
    server.shutdown()
PY
