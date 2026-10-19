$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\mockaize-favicon.png'))
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\mockaize\assets\mockaize.ico'))
$webPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\mockaize\web\assets\mockaize-favicon.png'))
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$source = [System.Drawing.Image]::FromFile($sourcePath)
$frames = [System.Collections.Generic.List[object]]::new()
try {
  foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $png = [System.IO.MemoryStream]::new()
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $scale = [Math]::Min($size / [double]$source.Width, $size / [double]$source.Height)
      $width = [int][Math]::Round($source.Width * $scale)
      $height = [int][Math]::Round($source.Height * $scale)
      $graphics.DrawImage($source, [int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
      $bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
      $frames.Add([pscustomobject]@{ Size = $size; Bytes = $png.ToArray() })
    }
    finally {
      $png.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally { $source.Dispose() }

# PNG payloads retain 32-bit alpha; Icon.FromHandle().Save() reduces the palette.
$stream = [System.IO.File]::Create($outputPath)
$writer = [System.IO.BinaryWriter]::new($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
}
finally { $writer.Dispose() }
Copy-Item -LiteralPath $sourcePath -Destination $webPath -Force
Write-Output "Created $outputPath (7 sizes, 32-bit alpha)"
