[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Id,[Parameter(Mandatory=$true)][string]$ValidTime,[Parameter(Mandatory=$true)][int]$LeadHours,[string]$Root='')
$ErrorActionPreference='Stop'
if (!$Root) { $Root=Split-Path $PSScriptRoot -Parent }
$Root=[IO.Path]::GetFullPath($Root)
$valid=[datetime]::ParseExact($ValidTime,'yyyy-MM-ddTHH:mm:ssZ',[cultureinfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
if ($valid.Hour % 6 -ne 0 -or $valid.Minute -ne 0 -or $valid.Second -ne 0 -or $LeadHours -notin @(0,24,36,48,60,72,84,96,120)) { throw 'Expected a synoptic UTC time and a supported lead hour.' }
$archive=Join-Path $Root 'archive'
$lock=[IO.File]::Open((Join-Path $archive '.poll.lock'),'OpenOrCreate','ReadWrite','None')
try {
    $path=Join-Path $archive 'manifest.json'; $m=Get-Content $path -Raw | ConvertFrom-Json
    $matches=@($m.pending | Where-Object id -eq $Id)
    if ($matches.Count -ne 1) { throw 'ID must identify exactly one pending chart.' }
    $c=$matches[0]
    $c.valid_time=$valid.ToString('yyyy-MM-ddTHH:mm:ssZ');$c.issue_time=$valid.AddHours(-$LeadHours).ToString('yyyy-MM-ddTHH:mm:ssZ');$c.lead_hours=$LeadHours;$c.metadata_method='manual'
    $c.PSObject.Properties.Remove('review_reason')
    $m.charts=@($m.charts)+@($c);$m.pending=@($m.pending | Where-Object id -ne $Id);$m.updated_at=[datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $utf8=New-Object Text.UTF8Encoding $false
    [IO.File]::WriteAllText("$path.tmp",(ConvertTo-Json -InputObject $m -Depth 12),$utf8)
    [IO.File]::Replace("$path.tmp",$path,"$path.bak")
    $js=Join-Path $archive 'manifest.js'
    [IO.File]::WriteAllText("$js.tmp",('window.FAX_ARCHIVE = '+(ConvertTo-Json -InputObject $m -Depth 12 -Compress)+';'),$utf8)
    if(Test-Path $js){[IO.File]::Replace("$js.tmp",$js,"$js.bak")}else{[IO.File]::Move("$js.tmp",$js)}
    Write-Output "Reviewed: $Id"
} finally { $lock.Dispose() }
