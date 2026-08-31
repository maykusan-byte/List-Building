[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputDirectory,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$Pattern = '*.png'
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -ne 'Desktop') {
  throw 'Run this script with Windows PowerShell 5.1 (powershell.exe), not PowerShell Core.'
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.IsGenericMethod -and
    $_.GetParameters().Count -eq 1 -and
    $_.ReturnType.IsGenericType -and
    $_.ReturnType.Name -eq 'Task`1'
  } |
  Select-Object -First 1

function Await-WinRt {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $task = $asTask.Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$storageFileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$randomAccessStreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$bitmapDecoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$softwareBitmapType = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$ocrEngineType = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$ocrResultType = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]

$resolvedInput = (Resolve-Path -LiteralPath $InputDirectory).Path
$resolvedOutputParent = Split-Path -Parent ([System.IO.Path]::GetFullPath($OutputPath))
if (-not [System.IO.Directory]::Exists($resolvedOutputParent)) {
  [System.IO.Directory]::CreateDirectory($resolvedOutputParent) | Out-Null
}

$engine = $ocrEngineType::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw 'Windows OCR could not create an engine for the current user languages.'
}

$files = Get-ChildItem -LiteralPath $resolvedInput -Filter $Pattern -File | Sort-Object Name
$results = foreach ($imageFile in $files) {
  $storageFile = Await-WinRt ($storageFileType::GetFileFromPathAsync($imageFile.FullName)) $storageFileType
  $stream = Await-WinRt ($storageFile.OpenReadAsync()) $randomAccessStreamType
  try {
    $decoder = Await-WinRt ($bitmapDecoderType::CreateAsync($stream)) $bitmapDecoderType
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) $softwareBitmapType
    try {
      $ocr = Await-WinRt ($engine.RecognizeAsync($bitmap)) $ocrResultType
      $words = foreach ($line in $ocr.Lines) {
        foreach ($word in $line.Words) {
          $rect = $word.BoundingRect
          $normalized = ($word.Text.Trim() -replace ',', '.') -replace '[^0-9.]', ''
          $numeric = $normalized -match '^(?:[0-9]|[1-5][0-9]|60)(?:\.[0-9])?$'
          $insideMeasurementBand =
            $rect.X -ge ($decoder.PixelWidth * 0.12) -and
            ($rect.X + $rect.Width) -le ($decoder.PixelWidth * 0.90) -and
            $rect.Y -ge ($decoder.PixelHeight * 0.24) -and
            ($rect.Y + $rect.Height) -le ($decoder.PixelHeight * 0.86)

          [ordered]@{
            text = $word.Text
            boundsPx = [ordered]@{
              x = [math]::Round($rect.X, 3)
              y = [math]::Round($rect.Y, 3)
              width = [math]::Round($rect.Width, 3)
              height = [math]::Round($rect.Height, 3)
            }
            normalizedNumericText = if ($numeric) { $normalized } else { $null }
            isMeasurementCandidate = [bool]($numeric -and $insideMeasurementBand)
          }
        }
      }

      [ordered]@{
        fileName = $imageFile.Name
        sha256 = (Get-FileHash -LiteralPath $imageFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        widthPx = [int]$decoder.PixelWidth
        heightPx = [int]$decoder.PixelHeight
        angle = [double]$ocr.TextAngle
        text = $ocr.Text
        words = @($words)
      }
    }
    finally {
      if ($null -ne $bitmap) { $bitmap.Dispose() }
    }
  }
  finally {
    $stream.Dispose()
  }
}

$payload = [ordered]@{
  schemaVersion = 'warforge-layout-ocr/v1'
  generatedAt = [DateTime]::UtcNow.ToString('o')
  engineLanguage = $engine.RecognizerLanguage.LanguageTag
  files = @($results)
}

$json = $payload | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText(
  [System.IO.Path]::GetFullPath($OutputPath),
  $json + [Environment]::NewLine,
  (New-Object System.Text.UTF8Encoding($false))
)
