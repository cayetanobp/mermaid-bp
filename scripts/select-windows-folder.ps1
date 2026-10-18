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

$dialog.SetFocus()
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('^l')
Start-Sleep -Milliseconds 150
[System.Windows.Forms.SendKeys]::SendWait($FolderPath)
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
    $names = @($controls | ForEach-Object { $_.Current.Name } | Where-Object { $_ }) -join ' | '
    throw "El selector nativo no mostró el botón de confirmar carpeta. Controles: $names"
}

$selectFolder.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Output "Carpeta seleccionada en diálogo nativo: $FolderPath"
