[CmdletBinding()]
param([string]$Root='', [string]$Config='', [switch]$Reprocess)
$ErrorActionPreference='Stop'
if (!$Root) { $Root=Split-Path $PSScriptRoot -Parent }
$Root=[IO.Path]::GetFullPath($Root)
if (!$Config) { $Config=Join-Path $Root 'sources.json' }
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$utf8=New-Object Text.UTF8Encoding $false
function Save-Json($Path,$Value) {
    $temp="$Path.$([guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temp,(ConvertTo-Json -InputObject $Value -Depth 12),$utf8)
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temp,$Path,"$Path.bak") } else { [IO.File]::Move($temp,$Path) }
}
$archive=Join-Path $Root 'archive'
$null=New-Item -ItemType Directory -Force $archive
# Exclusive file handle releases even on termination; no stale-lock cleanup needed.
try { $lock=[IO.File]::Open((Join-Path $archive '.poll.lock'),'OpenOrCreate','ReadWrite','None') }
catch { throw 'Another archive operation is running.' }
$failed=0
try {
    . (Join-Path $PSScriptRoot 'Ocr.ps1')
    $manifestPath=Join-Path $archive 'manifest.json'
    $manifest=@{schema_version=1;updated_at=$null;charts=@();pending=@()}
    if (Test-Path $manifestPath) { $manifest=Get-Content $manifestPath -Raw | ConvertFrom-Json }
    $charts=@($manifest.charts); $pending=@($manifest.pending)
    $products=@((Get-Content $Config -Raw | ConvertFrom-Json).products | Where-Object enabled)
    foreach ($product in $products) {
        $temp=Join-Path $archive ([guid]::NewGuid().ToString('N')+'.tmp')
        try {
            # Windows curl negotiates current TLS without .NET Framework TLS limitations.
            & curl.exe --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 2 --retry-delay 2 --connect-timeout 15 --max-time 45 --user-agent 'UKMO-FAX-Personal-Archive/1.0' --output $temp $product.url
            if ($LASTEXITCODE -ne 0) { throw "curl failed with exit code $LASTEXITCODE" }
            $bytes=[IO.File]::ReadAllBytes($temp)
            if ($bytes.Length -lt 24 -or [BitConverter]::ToString($bytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A') { throw 'Response is not a PNG image.' }
            $sha=[Security.Cryptography.SHA256]::Create()
            try { $hash=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
            $key=$product.source+':'+$product.product+':'+$hash
            if (@($charts | Where-Object id -eq $key).Count -or (!$Reprocess -and @($pending | Where-Object id -eq $key).Count)) { Write-Output "Unchanged: $($product.product)"; continue }
            $download=[datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
            $prior=@($pending | Where-Object id -eq $key)
            if ($prior.Count) { $download=$prior[0].download_time }
            $relative="archive/objects/$($product.source)/$hash.png"
            $destination=Join-Path $Root $relative
            $null=New-Item -ItemType Directory -Force (Split-Path $destination)
            if (!(Test-Path -LiteralPath $destination)) { [IO.File]::Move($temp,$destination) }
            $record=[ordered]@{id=$key;issue_time=$null;valid_time=$null;lead_hours=[int]$product.lead_hours;source=$product.source;product=$product.product;filename=$relative;download_time=$download;source_url=$product.url;sha256=$hash;metadata_method='printed-header-ocr';issue_time_basis='valid_time minus lead_hours (nominal run, not publication time)'}
            $pending=@($pending | Where-Object id -ne $key)
            try {
                $ocr=Read-ChartText $destination
                $meta=Get-ChartMetadata $ocr ([int]$product.lead_hours)
                $record.issue_time=$meta.issue_time; $record.valid_time=$meta.valid_time
                $charts+= [pscustomobject]$record
                Write-Output "Archived: $($product.product) valid $($meta.valid_time)"
            } catch {
                $record.metadata_method='needs-review'; $record['review_reason']=$_.Exception.Message
                $pending+=[pscustomobject]$record
                Write-Warning "Saved for review: $($product.product): $($_.Exception.Message)"
            }
        } catch { $failed++; Write-Warning "Download failed: $($product.url): $($_.Exception.Message)" }
        finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
    }
    $manifest.charts=@($charts | Sort-Object valid_time,issue_time,source,download_time)
    $manifest.pending=@($pending)
    $manifest.updated_at=[datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    Save-Json $manifestPath $manifest
    # Companion JS makes file:// opening work without fetch/CORS or a local server.
    $jsPath=Join-Path $archive 'manifest.js'
    $jsTemp="$jsPath.tmp"
    [IO.File]::WriteAllText($jsTemp,('window.FAX_ARCHIVE = '+(ConvertTo-Json -InputObject $manifest -Depth 12 -Compress)+';'),$utf8)
    if (Test-Path $jsPath) { [IO.File]::Replace($jsTemp,$jsPath,"$jsPath.bak") } else { [IO.File]::Move($jsTemp,$jsPath) }
    Write-Output "$($charts.Count) indexed charts; $($pending.Count) awaiting review; $failed failed downloads."
} finally { $lock.Dispose() }
if ($failed) { exit 1 }
