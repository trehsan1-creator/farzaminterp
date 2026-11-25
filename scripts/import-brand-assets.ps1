param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedArchive = (Resolve-Path $ArchivePath).Path
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("farzam-brand-assets-" + [guid]::NewGuid().ToString("N"))

$expected = @{
  "Peyda-Regular.woff2"   = "5b5cc58273a0f9dfe44c8a13fe93f8b71065c8c05c84ed0c0b5cb85ba0a6bb34"
  "Peyda-Medium.woff2"    = "b2de29c2bd24246921b0b90c48e178a27d3c675dda7f2ce60c113d8d0de0c493"
  "Peyda-SemiBold.woff2"  = "79fe2881777e201f2b09407cbac3c9cb6d2d47881c9c418ea7b9aecd6b58ac66"
  "Peyda-Bold.woff2"      = "e07bb6c2625519867601d596eb586d763a3da4b6bd77bdc521d7b0e2b63cf875"
  "Peyda-ExtraBold.woff2" = "54d316a372eaed9a837e1ef8f1f0d43b4b3b5576b3b5baddd9e7122f91d5e85a"
}

try {
  Expand-Archive -LiteralPath $resolvedArchive -DestinationPath $tempRoot
  $sourceRoot = Join-Path $tempRoot "assets"
  $fontSource = Join-Path $sourceRoot "fonts"
  $imageSource = Join-Path $sourceRoot "images"
  $fontTarget = Join-Path $repoRoot "assets/fonts"
  $brandTarget = Join-Path $repoRoot "assets/brand"

  New-Item -ItemType Directory -Force -Path $fontTarget, $brandTarget | Out-Null

  foreach ($entry in $expected.GetEnumerator()) {
    $source = Join-Path $fontSource $entry.Key
    if (!(Test-Path -LiteralPath $source)) { throw "Missing font in archive: $($entry.Key)" }
    $actualHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $entry.Value) {
      throw "Hash mismatch for $($entry.Key). Expected $($entry.Value), got $actualHash. No font was accepted."
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $fontTarget $entry.Key) -Force
  }

  $svgMap = @{
    "af-logo.svg" = "af-logo.svg"
    "typography-fa.svg" = "wordmark-fa.svg"
    "typography-en.svg" = "wordmark-en.svg"
    "isometric.svg" = "isometric.svg"
  }
  foreach ($sourceName in $svgMap.Keys) {
    $source = Join-Path $imageSource $sourceName
    if (!(Test-Path -LiteralPath $source)) { throw "Missing SVG in archive: $sourceName" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $brandTarget $svgMap[$sourceName]) -Force
  }

  Write-Host "Brand assets imported and all five Peyda font hashes verified."
  Write-Host "Review git status, then commit assets/fonts/*.woff2 and assets/brand/isometric.svg."
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
