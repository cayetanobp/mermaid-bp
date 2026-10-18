param(
    [Parameter(Mandatory = $true)][string]$FolderPath,
    [Parameter(Mandatory = $true)][string]$DialogTitle
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$root = [System.Windows.Automation.AutomationElement]::RootElement
$deadline = [DateTime]::UtcNow.AddSeconds(30)
$dialog = $null
while ([DateTime]::UtcNow -lt $deadline -and $null -eq $dialog) {
    $windows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($window in $windows) {
        if ($window.Current.Name -like "*$DialogTitle*") {
            $dialog = $window
            break
        }
    }
    if ($null -eq $dialog) { Start-Sleep -Milliseconds 200 }
}

if ($null -eq $dialog) {
    throw "No apareció el selector nativo «$DialogTitle»."
}

$dialogBounds = $dialog.Current.BoundingRectangle
$controls = $dialog.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)
$folderField = $null
foreach ($control in $controls) {
    $bounds = $control.Current.BoundingRectangle
    if ($control.Current.IsEnabled -and $bounds.Height -gt 0 -and $bounds.Y -gt ($dialogBounds.Y + $dialogBounds.Height * 0.65)) {
        try {
            $pattern = $control.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            if (-not $pattern.Current.IsReadOnly -and ($null -eq $folderField -or $bounds.Y -gt $folderField.Bounds.Y)) {
                $folderField = [pscustomobject]@{ Element = $control; Pattern = $pattern; Bounds = $bounds }
            }
        } catch { }
        if ($null -eq $folderField -and $control.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox) {
            $folderField = [pscustomobject]@{ Element = $control; Pattern = $null; Bounds = $bounds }
        }
    }
}

if ($null -eq $folderField) {
    $controlDetails = @($controls | ForEach-Object {
        $current = $_.Current
        "type='$($current.ControlType.ProgrammaticName)' name='$($current.Name)' id='$($current.AutomationId)' class='$($current.ClassName)' focusable=$($current.IsKeyboardFocusable) bounds=$($current.BoundingRectangle)"
    }) -join ' | '
    throw "No se encontró el campo Folder del selector nativo. Controles: $controlDetails"
}

if ($null -ne $folderField.Pattern) {
    $folderField.Pattern.SetValue($FolderPath)
} else {
    $folderField.Element.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait($FolderPath)
}
try { $folderField.Element.SetFocus() } catch { }
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')

$buttonCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
)
$deadline = [DateTime]::UtcNow.AddSeconds(15)
$selectFolder = $null
while ([DateTime]::UtcNow -lt $deadline -and $null -eq $selectFolder) {
    $buttons = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    foreach ($button in $buttons) {
        if ($button.Current.Name -match '^(Select Folder|Seleccionar carpeta|Elegir carpeta)$') {
            $selectFolder = $button
            break
        }
    }
    if ($null -eq $selectFolder) { Start-Sleep -Milliseconds 200 }
}

if ($null -eq $selectFolder) {
    $controls = $dialog.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    $names = @($controls | ForEach-Object {
        $current = $_.Current
        if ($current.Name) { "$($current.ControlType.ProgrammaticName):$($current.Name)" }
    } | Where-Object { $_ }) -join ' | '
    throw "El selector nativo no mostró el botón de confirmar carpeta. Controles: $names"
}

$selectFolder.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Output "Carpeta seleccionada en diálogo nativo: $FolderPath"
