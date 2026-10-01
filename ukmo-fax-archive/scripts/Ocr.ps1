# Windows PowerShell 5.1; Windows 10/11 built-in OCR. No image is rewritten.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
function Wait-WinRT($Operation,$Type) {
    $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $task=$method.MakeGenericMethod($Type).Invoke($null,@($Operation))
    $task.Wait(); $task.Result
}
function Read-ChartText([string]$Path) {
    # Magnify an in-memory title-strip copy, with white padding to avoid border interference.
    # Source files are never altered. Known layouts; unfamiliar layouts fall into review.
    Add-Type -AssemblyName System.Drawing
    $original=[Drawing.Bitmap]::FromFile($Path)
    $scratch=Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N')+'.png')
    try {
        if ($original.Width -eq 1076 -and $original.Height -eq 864) { $rect=New-Object Drawing.Rectangle 2,72,362,24 }
        elseif ($original.Width -eq 1179 -and $original.Height -eq 864) { $rect=New-Object Drawing.Rectangle 2,38,397,25 }
        elseif ($original.Width -eq 900 -and $original.Height -eq 608) { $rect=New-Object Drawing.Rectangle 2,3,302,19 }
        else { $rect=New-Object Drawing.Rectangle 0,0,$original.Width,([Math]::Min(130,$original.Height)) }
        $copy=New-Object Drawing.Bitmap ($rect.Width*4+40),($rect.Height*4+40)
        $graphics=[Drawing.Graphics]::FromImage($copy)
        try {
            $graphics.Clear([Drawing.Color]::White)
            $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $target=New-Object Drawing.Rectangle 20,20,($rect.Width*4),($rect.Height*4)
            $graphics.DrawImage($original,$target,$rect,[Drawing.GraphicsUnit]::Pixel)
            $copy.Save($scratch,[Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $copy.Dispose() }
    } finally { $original.Dispose() }
    try { return Read-OcrBitmap $scratch } finally { if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch } }
}
function Read-OcrBitmap([string]$Path) {
    $file=Wait-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream=Wait-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $bitmap=$null
    try {
        $decoder=Wait-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap=Wait-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $language=New-Object Windows.Globalization.Language 'en-GB'
        $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        if (!$engine) { throw 'English OCR language pack is unavailable. Install English language OCR in Windows settings.' }
        $result=Wait-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        return (($result.Lines | ForEach-Object Text) -join "`n")
    } finally { if ($bitmap) { $bitmap.Dispose() }; $stream.Dispose() }
}
function Get-ChartMetadata([string]$Text,[int]$ExpectedLead) {
    # Only the printed header is authoritative. Never infer dates from HTTP or the clock.
    # Narrow glyph substitutions in header tokens only; weekday/date and lead checks still apply.
    $Text=$Text -replace '(?i)(valid\s+)OO(\s+UTC)', '${1}00${2}'
    $Text=$Text -replace '(?i)\b0\+(\d{1,3})\)', 'T+${1})'
    $pattern='(?i)(?:valid|analysis(?:\s+chart)?(?:\s+for)?)\s+(?<hour>\d{2})(?:00)?\s*UTC\s+(?<day>MON|TUE|WED|THU|FRI|SAT|SUN)\s+(?<date>\d{2})\s+(?<month>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(?<year>\d{4})'
    $match=[regex]::Match($Text,$pattern)
    if (!$match.Success) { throw 'Printed valid-time header not confidently recognized.' }
    $s='{0} {1} {2} {3}' -f $match.Groups['date'].Value,$match.Groups['month'].Value,$match.Groups['year'].Value,$match.Groups['hour'].Value
    $valid=[datetime]::ParseExact($s,'dd MMM yyyy HH',[cultureinfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
    if ($valid.ToString('ddd',[cultureinfo]::InvariantCulture).ToUpperInvariant() -ne $match.Groups['day'].Value.ToUpperInvariant()) { throw 'Printed weekday/date mismatch.' }
    if ($valid.Hour % 6 -ne 0) { throw 'Unexpected synoptic hour.' }
    $leadMatch=[regex]::Match($Text,'(?i)T\s*\+\s*(\d{1,3})')
    if ($ExpectedLead -gt 0 -and (!$leadMatch.Success -or [int]$leadMatch.Groups[1].Value -ne $ExpectedLead)) { throw 'Printed lead does not match configured product.' }
    if ($ExpectedLead -eq 0 -and $Text -notmatch '(?i)analysis') { throw 'Analysis title missing.' }
    @{ valid_time=$valid.ToString('yyyy-MM-ddTHH:mm:ssZ'); issue_time=$valid.AddHours(-$ExpectedLead).ToString('yyyy-MM-ddTHH:mm:ssZ') }
}
