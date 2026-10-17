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
import json, pathlib, subprocess, sys, time
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

def open_file_menu():
    driver.find_element(By.ID, "menu-archivo").click()
    wait.until(lambda d: d.find_element(By.ID, "menu-archivo-panel").is_displayed())

def active_window_title():
    return subprocess.run(
        ["xdotool", "getactivewindow", "getwindowname"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()

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
    # GTK's location shortcut navigates to the directory. Choose the file name
    # separately in the dialog's name field, then confirm the save.
    subprocess.run(["xdotool", "key", "ctrl+l"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "1", str(path.parent)], check=True)
    subprocess.run(["xdotool", "key", "Return"], check=True)
    capture_desktop("native-save-dialog-directory.png")
    subprocess.run(["xdotool", "key", "ctrl+a"], check=True)
    subprocess.run(["xdotool", "type", "--clearmodifiers", "--delay", "1", path.name], check=True)
    capture_desktop("native-save-dialog-filename.png")
    subprocess.run(["xdotool", "key", "Return"], check=True)

    deadline = time.time() + 20
    while time.time() < deadline and not path.exists():
        time.sleep(0.1)
    if not path.exists():
        capture_desktop("native-save-dialog-after-submit.png")
        raise AssertionError(
            f"Native dialog did not save {path}; active window={active_window_title()!r}; "
            f"visible windows={visible_window_titles()!r}"
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
finally:
    driver.quit()
PY
