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
$editCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit
)
$edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
$folderField = $null
foreach ($edit in $edits) {
    $bounds = $edit.Current.BoundingRectangle
    if ($edit.Current.IsEnabled -and $bounds.Height -gt 0 -and $bounds.Y -gt ($dialogBounds.Y + $dialogBounds.Height * 0.65)) {
        if ($null -eq $folderField -or $bounds.Y -gt $folderField.Current.BoundingRectangle.Y) {
            $folderField = $edit
        }
    }
}

if ($null -eq $folderField) {
    $editDetails = @($edits | ForEach-Object {
        $current = $_.Current
        "name='$($current.Name)' id='$($current.AutomationId)' class='$($current.ClassName)' bounds=$($current.BoundingRectangle)"
    }) -join ' | '
    throw "No se encontró el campo Folder del selector nativo. Edits: $editDetails"
}

$valuePattern = $null
try {
    $valuePattern = $folderField.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
} catch { }
if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
    $valuePattern.SetValue($FolderPath)
} else {
    $folderField.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait($FolderPath)
}
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
