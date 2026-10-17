#!/usr/bin/env bash
set -euo pipefail

app_bin="${MERMAID_BP_BIN:-$(dpkg-query -L mermaid-bp | awk '/^\/usr\/bin\// { print; exit }')}"
output_dir="${MERMAID_BP_SMOKE_DIR:-$PWD/linux-smoke-artifacts}"
mkdir -p "$output_dir"
command -v xdotool >/dev/null
command -v scrot >/dev/null
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
import json, pathlib, shutil, subprocess, sys, time
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
plugin_folder = out / "fixture" / "installed-smoke"

def start_driver():
    return webdriver.Remote(command_executor="http://127.0.0.1:4444", options=options)

def open_file_menu():
    driver.find_element(By.ID, "menu-archivo").click()
    wait.until(lambda d: d.find_element(By.ID, "menu-archivo-panel").is_displayed())

def open_plugins_settings():
    driver.find_element(By.ID, "menu-configuracion").click()
    wait.until(lambda d: d.find_element(By.ID, "menu-configuracion-panel").is_displayed())
    driver.find_element(By.ID, "plugins-button").click()
    wait.until(EC.visibility_of_element_located((By.ID, "settings-dialog")))
    wait.until(lambda d: not d.find_element(By.ID, "plugins-dialog").get_attribute("hidden"))

def active_window_title():
    active = subprocess.run(
        ["xdotool", "getactivewindow", "getwindowname"],
        capture_output=True, text=True,
    )
    if active.returncode == 0 and active.stdout.strip():
        return active.stdout.strip()

    focused = subprocess.run(
        ["xdotool", "getwindowfocus", "-f"], capture_output=True, text=True,
    )
    if focused.returncode == 0 and focused.stdout.strip():
        title = subprocess.run(
            ["xdotool", "getwindowname", focused.stdout.strip()],
            capture_output=True, text=True,
        )
        if title.returncode == 0 and title.stdout.strip():
            return title.stdout.strip()
    return "<no active X11 window>"

def visible_window_titles():
    result = subprocess.run(
        ["xdotool", "search", "--onlyvisible", "--name", ".*"],
        capture_output=True, text=True,
    )
    titles = []
    for window_id in result.stdout.splitlines():
        title = subprocess.run(
            ["xdotool", "getwindowname", window_id],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        if title:
            titles.append(title)
    return titles

def capture_desktop(name):
    subprocess.run(["scrot", "-o", str(out / name)], check=True)
    titles = visible_window_titles()
    (out / f"{name}.windows.txt").write_text(
        "Active window: " + active_window_title() + "\n" + "\n".join(titles) + "\n",
        encoding="utf-8",
    )

def save_path_diagnostics(path):
    candidates = {
        path,
        pathlib.Path.cwd() / path.name,
        pathlib.Path.home() / path.name,
        pathlib.Path.cwd() / path.parent.name / path.name,
    }
    report = [f"Requested path: {path}", f"Working directory: {pathlib.Path.cwd()}"]
    for candidate in sorted(candidates, key=str):
        if candidate.exists():
            report.append(f"Found: {candidate} ({candidate.stat().st_size} bytes)")
    (out / "native-save-path-diagnostics.txt").write_text("\n".join(report) + "\n", encoding="utf-8")

def save_from_native_dialog(button, path):
    before = active_window_title()
    before_windows = set(visible_window_titles())
    button.click()
    deadline = time.time() + 15
    while time.time() < deadline:
        current = active_window_title()
        current_windows = set(visible_window_titles())
        if (current and current != before) or current_windows - before_windows:
            break
        time.sleep(0.1)
    else:
        capture_desktop("native-save-dialog-missing.png")
        raise AssertionError(
            f"Native save dialog did not take focus; active window={active_window_title()!r}; "
            f"visible windows={visible_window_titles()!r}"
        )

    capture_desktop("native-save-dialog.png")
    # The portal dialog opens with the file name entry focused, where Ctrl+L
    # does not activate GTK's location shortcut. Focus the file list first.
    subprocess.run(["xdotool", "mousemove", "1100", "800", "click", "1"], check=True)
    subprocess.run(["xdotool", "key", "ctrl+l"], check=True)
    time.sleep(0.3)
    capture_desktop("native-save-location-entry.png")
    subprocess.run(["xdotool", "key", "ctrl+a"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "1", str(path.parent)], check=True)
    capture_desktop("native-save-location-path.png")
    subprocess.run(["xdotool", "key", "Return"], check=True)
    time.sleep(0.5)
    capture_desktop("native-save-dialog-directory.png")
    # Return from the location entry can leave focus on the file list. Click
    # GTK's Name field explicitly before entering the output filename.
    subprocess.run(["xdotool", "mousemove", "600", "123", "click", "1"], check=True)
    subprocess.run(["xdotool", "key", "ctrl+a"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "1", path.name], check=True)
    time.sleep(0.3)
    capture_desktop("native-save-dialog-filename.png")
    subprocess.run(["xdotool", "key", "Return"], check=True)

    deadline = time.time() + 20
    while time.time() < deadline and not path.exists():
        time.sleep(0.1)
    if not path.exists():
        capture_desktop("native-save-dialog-after-submit.png")
        save_path_diagnostics(path)
        raise AssertionError(
            f"Native dialog did not save {path}; active window={active_window_title()!r}; "
            f"visible windows={visible_window_titles()!r}"
        )

def choose_plugin_folder(folder):
    before = active_window_title()
    before_windows = set(visible_window_titles())
    driver.find_element(By.CSS_SELECTOR, 'label[for="plugin-folder-input"]').click()
    deadline = time.time() + 15
    while time.time() < deadline:
        current = active_window_title()
        current_windows = set(visible_window_titles())
        if (current and current != before) or current_windows - before_windows:
            break
        time.sleep(0.1)
    else:
        capture_desktop("native-plugin-folder-dialog-missing.png")
        raise AssertionError(
            f"Native folder chooser did not take focus; active window={active_window_title()!r}; "
            f"visible windows={visible_window_titles()!r}"
        )

    capture_desktop("native-plugin-folder-dialog.png")
    subprocess.run(["xdotool", "key", "ctrl+l"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "1", str(folder)], check=True)
    subprocess.run(["xdotool", "key", "Return"], check=True)
    time.sleep(1)
    if active_window_title() != before:
        # In GTK, the first Return may navigate to the typed folder; the second
        # activates the chooser's Select Folder action for that directory.
        subprocess.run(["xdotool", "key", "Return"], check=True)
    deadline = time.time() + 20
    while time.time() < deadline and active_window_title() != before:
        time.sleep(0.1)
    if active_window_title() != before:
        capture_desktop("native-plugin-folder-dialog-after-submit.png")
        raise AssertionError(
            f"Native folder chooser did not close after selecting {folder}; "
            f"active window={active_window_title()!r}; visible windows={visible_window_titles()!r}"
        )

try:
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "#editor .cm-content"))
    bridge_status = driver.execute_script(
        "return {save: typeof window.__MERMAID_BP_SAVE__, invoke: typeof window.__TAURI__?.core?.invoke}"
    )
    (out / "bridge-status.json").write_text(json.dumps(bridge_status), encoding="utf-8")
    editor = driver.find_element(By.CSS_SELECTOR, "#editor .cm-content")
    editor.click()
    editor.send_keys(Keys.CONTROL, "a")
    # WebDriver sends embedded newlines as whitespace to contenteditable.
    # Send Enter as its own key so CodeMirror stores a real Mermaid line break.
    source = "flowchart TD\n  Linux[Ubuntu instalado] --> SVG[Exportado]"
    editor.send_keys("flowchart TD")
    editor.send_keys(Keys.ENTER)
    editor.send_keys("  Linux[Ubuntu instalado] --> SVG[Exportado]")
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#diagram svg")))
    driver.save_screenshot(str(out / "editor.png"))

    open_file_menu()
    mmd = out / "installed-smoke.mmd"
    save_from_native_dialog(driver.find_element(By.ID, "save"), mmd)
    saved_source = mmd.read_text(encoding="utf-8") if mmd.exists() else "<missing>"
    assert source in saved_source, f"Saved .mmd is missing or incorrect: {saved_source!r}"

    open_file_menu()
    svg = out / "installed-smoke.svg"
    save_from_native_dialog(driver.find_element(By.ID, "svg"), svg)
    assert svg.exists() and "<svg" in svg.read_text(encoding="utf-8")[:500], "Exported SVG is missing or invalid"

    # Supply files from a real directory through the GTK folder chooser. All
    # management operations then go through the installed app's settings UI.
    plugin_manifest = '{"id":"installed-smoke","name":"Installed smoke plugin","description":"Installed app persistence check","version":"1.0.0","apiVersion":1}'
    plugin_entry = "export default {setup(ctx){ctx.ui.addAction({id:'persisted',label:'Installed plugin action',run(){ctx.ui.notify('Installed plugin ran.');}});}};"
    plugin_folder.mkdir(parents=True, exist_ok=True)
    (plugin_folder / "plugin.json").write_text(plugin_manifest, encoding="utf-8")
    (plugin_folder / "index.js").write_text(plugin_entry, encoding="utf-8")
    open_plugins_settings()
    choose_plugin_folder(plugin_folder)
    wait.until(lambda d: "Installed smoke plugin · versión 1.0.0" in d.find_element(By.ID, "plugin-import-preview").text)
    trust = driver.find_element(By.ID, "plugin-trust-confirm")
    assert not driver.find_element(By.ID, "plugin-install").is_enabled(), "Install must require explicit trust"
    trust.click()
    driver.find_element(By.ID, "plugin-install").click()
    wait.until(lambda d: "instalado o actualizado" in d.find_element(By.ID, "plugin-local-status").text)
    wait.until(EC.presence_of_element_located((By.ID, "plugin-installed-smoke-persisted")))

    # A WebKit restart proves persistence and module loading through the scoped
    # asset protocol in the installed native application.
    driver.quit()
    driver = start_driver()
    wait = WebDriverWait(driver, 60)
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "#editor .cm-content"))
    wait.until(EC.presence_of_element_located((By.ID, "plugin-installed-smoke-persisted")))
    driver.find_element(By.ID, "plugin-installed-smoke-persisted").click()
    wait.until(lambda d: d.find_element(By.ID, "message").text == "Installed plugin ran.")

    open_plugins_settings()
    toggle = driver.find_element(By.CSS_SELECTOR, '[data-plugin-toggle="installed-smoke"]')
    toggle.click()
    wait.until(lambda d: "Desactivado" in d.find_element(By.CSS_SELECTOR, '[data-plugin-status="installed-smoke"]').text)
    wait.until(EC.invisibility_of_element_located((By.ID, "plugin-installed-smoke-persisted")))
    toggle = driver.find_element(By.CSS_SELECTOR, '[data-plugin-toggle="installed-smoke"]')
    toggle.click()
    wait.until(EC.presence_of_element_located((By.ID, "plugin-installed-smoke-persisted")))

    updated_manifest = plugin_manifest.replace('"version":"1.0.0"', '"version":"2.0.0"')
    (plugin_folder / "plugin.json").write_text(updated_manifest, encoding="utf-8")
    choose_plugin_folder(plugin_folder)
    wait.until(lambda d: "versión 2.0.0" in d.find_element(By.ID, "plugin-import-preview").text)
    driver.find_element(By.ID, "plugin-trust-confirm").click()
    driver.find_element(By.ID, "plugin-install").click()
    wait.until(lambda d: "instalado o actualizado" in d.find_element(By.ID, "plugin-local-status").text)
    wait.until(lambda d: "2.0.0" in d.find_element(By.CSS_SELECTOR, '[data-plugin-status="installed-smoke"]').text)

    driver.find_element(By.ID, "plugins-close").click()
    wait.until(EC.invisibility_of_element_located((By.ID, "settings-dialog")))
    driver.find_element(By.ID, "plugin-installed-smoke-persisted").click()
    wait.until(lambda d: d.find_element(By.ID, "message").text == "Installed plugin ran.")
    open_plugins_settings()
    driver.find_element(By.ID, "plugin-installed-smoke-remove").click()
    driver.switch_to.alert.accept()
    wait.until(lambda d: "retirado" in d.find_element(By.ID, "plugin-local-status").text)
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-plugin-toggle="installed-smoke"]')))
    wait.until(EC.invisibility_of_element_located((By.ID, "plugin-installed-smoke-persisted")))
finally:
    driver.quit()
    shutil.rmtree(plugin_folder.parent, ignore_errors=True)
PY
