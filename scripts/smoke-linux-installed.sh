#!/usr/bin/env bash
set -euo pipefail

app_bin="${MERMAID_BP_BIN:-$(dpkg-query -L mermaid-bp | awk '/^\/usr\/bin\// { print; exit }')}"
output_dir="${MERMAID_BP_SMOKE_DIR:-$PWD/linux-smoke-artifacts}"
mkdir -p "$output_dir"
command -v xdotool >/dev/null
command -v tauri-driver >/dev/null
command -v WebKitWebDriver >/dev/null || command -v webkit2gtk-driver >/dev/null
[ -x "$app_bin" ] || { echo "Installed app not found: $app_bin" >&2; exit 1; }

# Tauri Driver launches the installed executable through WebKitGTK WebDriver.
tauri-driver --port 4444 >"$output_dir/tauri-driver.log" 2>&1 &
driver_pid=$!
cleanup() { kill "$driver_pid" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  if curl --silent --fail http://127.0.0.1:4444/status >/dev/null; then break; fi
  sleep 1
done
curl --silent --fail http://127.0.0.1:4444/status >/dev/null || { cat "$output_dir/tauri-driver.log"; exit 1; }

python3 - "$app_bin" "$output_dir" <<'PY'
import pathlib, sys, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

app, out = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
options = webdriver.FirefoxOptions()
options.set_capability("browserName", "wry")
options.set_capability("tauri:options", {"application": app})
driver = webdriver.Remote(command_executor="http://127.0.0.1:4444", options=options)
wait = WebDriverWait(driver, 60)

def start_driver():
    return webdriver.Remote(command_executor="http://127.0.0.1:4444", options=options)

def open_file_menu():
    driver.find_element(By.ID, "menu-archivo").click()
    wait.until(lambda d: d.find_element(By.ID, "menu-archivo-panel").is_displayed())

try:
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "#editor .cm-content"))
    editor = driver.find_element(By.CSS_SELECTOR, "#editor .cm-content")
    editor.click()
    editor.send_keys(Keys.CONTROL, "a")
    source = "flowchart TD\n  Linux[Ubuntu instalado] --> SVG[Exportado]"
    editor.send_keys(source)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#diagram svg")))
    driver.save_screenshot(str(out / "editor.png"))

    open_file_menu()
    driver.find_element(By.ID, "save").click()
    time.sleep(1)
    mmd = out / "installed-smoke.mmd"
    import subprocess
    subprocess.run(["xdotool", "key", "ctrl+l"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", str(mmd)], check=True)
    subprocess.run(["xdotool", "key", "Return"], check=True)
    deadline = time.time() + 20
    while time.time() < deadline and not mmd.exists(): time.sleep(.25)
    assert mmd.exists() and source in mmd.read_text(encoding="utf-8"), "Saved .mmd is missing or incorrect"

    open_file_menu()
    driver.find_element(By.ID, "svg").click()
    time.sleep(1)
    svg = out / "installed-smoke.svg"
    subprocess.run(["xdotool", "key", "ctrl+l"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", str(svg)], check=True)
    subprocess.run(["xdotool", "key", "Return"], check=True)
    deadline = time.time() + 20
    while time.time() < deadline and not svg.exists(): time.sleep(.25)
    assert svg.exists() and "<svg" in svg.read_text(encoding="utf-8")[:500], "Exported SVG is missing or invalid"

    # Use the real Tauri invoke bridge and app-data directory in the installed app.
    # Restarting WebKit proves the plugin survives process lifetime and still loads
    # its module through the scoped asset protocol.
    plugin_manifest = '{"id":"installed-smoke","name":"Installed smoke plugin","description":"Installed app persistence check","version":"1.0.0","apiVersion":1}'
    plugin_entry = "export default {setup(ctx){ctx.ui.addAction({id:'persisted',label:'Installed plugin action',run(){ctx.ui.notify('Installed plugin ran.');}});}};"
    result = driver.execute_async_script("""
      const done = arguments[2];
      const encode = value => Array.from(new TextEncoder().encode(value));
      window.__TAURI__.core.invoke('install_plugin', {
        id: 'installed-smoke',
        paths: ['plugin.json', 'index.js'],
        contents: [encode(arguments[0]), encode(arguments[1])]
      }).then(() => window.__TAURI__.core.invoke('list_plugins'))
        .then(plugins => done(plugins.some(plugin => plugin.id === 'installed-smoke')))
        .catch(error => done({error: String(error)}));
    """, plugin_manifest, plugin_entry)
    assert result is True, f"Tauri backend did not persist the plugin: {result}"
    driver.quit()
    driver = start_driver()
    wait = WebDriverWait(driver, 60)
    wait.until(EC.presence_of_element_located((By.ID, "plugin-installed-smoke-persisted")))
    driver.find_element(By.ID, "plugin-installed-smoke-persisted").click()
    wait.until(lambda d: d.find_element(By.ID, "message").text == "Installed plugin ran.")
    removed = driver.execute_async_script("""
      const done = arguments[0];
      window.__TAURI__.core.invoke('remove_plugin', {id: 'installed-smoke'})
        .then(done).catch(error => done({error: String(error)}));
    """)
    assert removed is True, f"Tauri backend did not remove the plugin: {removed}"
finally:
    driver.quit()
PY
