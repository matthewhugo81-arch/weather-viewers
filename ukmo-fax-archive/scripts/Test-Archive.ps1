$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Ocr.ps1')
$tests=@(
    @('Forecast chart (T+72) valid 12 UTC SAT 03 OCT 2026',72,'2026-09-30T12:00:00Z'),
    @('Forecast chart (T+24) valid 00 UTC FRI 01 JAN 2027',24,'2026-12-31T00:00:00Z'),
    @('Forecast chart (T+24) valid 00 UTC FRI 01 MAR 2024',24,'2024-02-29T00:00:00Z'),
    @('Analysis chart valid OO UTC WED 30 SEP 2026',0,'2026-09-30T00:00:00Z'),
    @('Forecast chart 0+24) valid OO UTC THU 01 OCT 2026',24,'2026-09-30T00:00:00Z')
)
foreach($t in $tests){$m=Get-ChartMetadata $t[0] $t[1];if($m.issue_time -ne $t[2]){throw 'Date arithmetic failed'}}
foreach($t in @(@('Forecast chart (T+72) valid 12 UTC FRI 03 OCT 2026',72),@('Forecast chart (T+96) valid 12 UTC SAT 03 OCT 2026',72),@('<html>Error</html>',24),@('Analysis chart valid 25 UTC WED 30 SEP 2026',0))){
    $rejected=$false;try{$null=Get-ChartMetadata $t[0] $t[1]}catch{$rejected=$true};if(!$rejected){throw 'Unsafe header accepted'}
}
Write-Output 'PASS: header recognition, UTC month/year/leap-day rollover, weekday mismatch, lead mismatch and unreadable-header rejection.'
