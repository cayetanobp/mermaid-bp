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
import json, pathlib, re, shutil, subprocess, sys, time
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
    import pyatspi

    before = active_window_title()
    before_windows = set(visible_window_titles())
    driver.find_element(By.ID, "plugin-folder-select").click()
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
    dialog_ids = subprocess.check_output(
        ["xdotool", "search", "--name", "Elegir carpeta de plugin"], text=True
    ).splitlines()
    if not dialog_ids:
        raise AssertionError("Could not identify the native folder chooser window")
    dialog_id = dialog_ids[-1]

    def accessible_tree():
        nodes = []
        desktop = pyatspi.Registry.getDesktop(0)
        pending = [(desktop, 0, [])]
        while pending:
            node, depth, ancestors = pending.pop()
            try:
                role = node.getRoleName()
                name = node.name or ""
                ancestry = ancestors + [f"{role} name={name!r}"]
                value = ""
                try:
                    value = node.queryText().getText(0, 4096)
                except Exception:
                    pass
                actions = []
                try:
                    action = node.queryAction()
                    actions = [action.getName(index) for index in range(action.nActions)]
                except Exception:
                    pass
                nodes.append({"node": node, "role": role, "name": name, "value": value, "actions": actions, "ancestry": ancestry})
                if depth < 14:
                    for index in reversed(range(node.childCount)):
                        child = node.getChildAtIndex(index)
                        if child is not None:
                            pending.append((child, depth + 1, ancestry))
            except Exception:
                continue
        return nodes

    def save_accessible_tree(filename, nodes):
        lines = [
            f"{entry['role']} name={entry['name']!r} value={entry['value']!r} actions={entry['actions']!r} "
            f"ancestry={entry['ancestry']!r}"
            for entry in nodes
        ]
        (out / filename).write_text("\n".join(lines), encoding="utf-8")

    # GTK's folder-only chooser hides regular files. Navigate through its
    # actual Files table and activate the native Select button through AT-SPI.
    capture_desktop("native-plugin-folder-dialog.png")
    nodes = accessible_tree()
    save_accessible_tree("native-plugin-folder-dialog.accessibility.txt", nodes)
    dialog_nodes = [item for item in nodes if "Elegir carpeta de plugin" in " ".join(item["ancestry"])]
    if not dialog_nodes:
        raise AssertionError("AT-SPI cannot find the native GTK folder chooser in the accessibility tree")
    def file_cells(tree):
        return [
            item for item in tree
            if item["role"].lower() == "table cell"
            and any("table name='Files'" in ancestor for ancestor in item["ancestry"])
            and item["name"].strip()
        ]

    def wait_for_folder_row(name, timeout=8):
        deadline = time.time() + timeout
        latest = nodes
        while time.time() < deadline:
            latest = accessible_tree()
            matches = [item for item in file_cells(latest) if item["name"].strip() == name]
            if len(matches) == 1:
                return latest, matches[0]
            time.sleep(0.2)
        save_accessible_tree(f"native-plugin-folder-missing-{name}.accessibility.txt", latest)
        raise AssertionError(
            f"GTK folder list did not show the expected directory {name!r}; "
            f"visible directory rows={[item['name'] for item in file_cells(latest)]!r}"
        )

    def activate_folder_row(name, screenshot):
        tree, item = wait_for_folder_row(name)
        action = item["node"].queryAction()
        actions = [action.getName(index).lower() for index in range(action.nActions)]
        activate_index = next((index for index, label in enumerate(actions) if label == "activate"), None)
        if activate_index is None or not action.doAction(activate_index):
            raise AssertionError(f"GTK folder row {name!r} has no usable activate action: {actions!r}")
        (out / "native-plugin-folder-navigation.txt").open("a", encoding="utf-8").write(name + "\n")
        time.sleep(0.4)
        capture_desktop(screenshot)

    # Recent exposes the fixture's parent folder. These row activations enter
    # each folder using the GTK view; the folder-only list correctly hides the
    # plugin's regular files.
    activate_folder_row("mermaid-bp-linux-smoke", "native-plugin-folder-parent.png")
    activate_folder_row("fixture", "native-plugin-folder-fixture.png")
    activate_folder_row("installed-smoke", "native-plugin-folder-target.png")

    deadline = time.time() + 8
    selected_button = None
    latest = []
    while time.time() < deadline:
        latest = accessible_tree()
        buttons = [
            item for item in latest
            if "Elegir carpeta de plugin" in " ".join(item["ancestry"])
            and item["role"].lower() == "push button" and item["name"].strip().lower() == "select"
        ]
        enabled = []
        for item in buttons:
            try:
                if item["node"].getState().contains(pyatspi.STATE_ENABLED):
                    enabled.append(item)
            except Exception:
                pass
        if len(enabled) == 1:
            selected_button = enabled[0]
            break
        time.sleep(0.2)
    if selected_button is None:
        save_accessible_tree("native-plugin-folder-select-disabled.accessibility.txt", latest)
        capture_desktop("native-plugin-folder-select-disabled.png")
        raise AssertionError(
            "GTK did not enable its native Select button after activating the requested folder; "
            f"active window={active_window_title()!r}; "
            f"visible directory rows={[item['name'] for item in file_cells(latest)]!r}"
        )
    capture_desktop("native-plugin-folder-target-selected.png")
    action = selected_button["node"].queryAction()
    action_names = [action.getName(index).lower() for index in range(action.nActions)]
    activate_index = next(
        (index for index, name in enumerate(action_names) if name in {"click", "press", "activate"}),
        None,
    )
    if activate_index is None or not action.doAction(activate_index):
        raise AssertionError(f"GTK Select button has no usable activation action: {action_names!r}")

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
    try:
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "plugin-installed-smoke-persisted")))
    except Exception as error:
        diagnostics = driver.execute_script("""
          return (async () => {
            const id = 'installed-smoke';
            const bridge = window.__TAURI__?.core;
            const state = {
              location: location.href,
              localStatus: document.querySelector('#plugin-local-status')?.textContent,
              importError: document.querySelector('#plugin-import-error')?.textContent,
              preview: document.querySelector('#plugin-import-preview')?.textContent,
              pluginList: document.querySelector('#plugin-list')?.textContent,
              pluginRows: Array.from(document.querySelectorAll('[data-plugin-status]')).map(node => ({
                id: node.dataset.pluginStatus, text: node.textContent,
              })),
              actions: Array.from(document.querySelectorAll('#plugin-actions > *')).map(node => ({id: node.id, text: node.textContent})),
              resources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /asset|plugin/i.test(name)),
            };
            if (!bridge) return {...state, bridge: 'missing'};
            try {
              state.root = await bridge.invoke('plugins_root');
              const root = state.root.replace(/[\\/]+$/, '');
              const unixPath = `${root}/${id}/plugin.json`;
              const windowsPath = `${root}\\${id}\\plugin.json`;
              state.urls = {unix: bridge.convertFileSrc(unixPath, 'asset'), windows: bridge.convertFileSrc(windowsPath, 'asset')};
              state.fetches = {};
              for (const [name, url] of Object.entries(state.urls)) {
                try {
                  const response = await fetch(url, {cache: 'no-store'});
                  state.fetches[name] = {status: response.status, body: (await response.text()).slice(0, 500)};
                } catch (reason) { state.fetches[name] = {error: String(reason)}; }
              }
            } catch (reason) { state.bridgeError = String(reason); }
            return state;
          })();
        """)
        (out / "plugin-install-diagnostics.json").write_text(json.dumps(diagnostics, indent=2), encoding="utf-8")
        driver.save_screenshot(str(out / "plugin-install-failure.png"))
        raise AssertionError(
            "Installed plugin action did not appear; diagnostic state saved to "
            f"plugin-install-diagnostics.json: {json.dumps(diagnostics, ensure_ascii=False)}"
        ) from error

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
