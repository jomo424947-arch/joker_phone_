Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$srcPath = "$baseDir\src\renderer\assets\joker-logo.jpg"

# Ensure directories exist
$dirs = @(
    "$baseDir\src\renderer\assets",
    "$baseDir\src\renderer\public",
    "$baseDir\public",
    "$baseDir\build"
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

# Load source image
$srcImage = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Loaded image with dimensions $($srcImage.Width) x $($srcImage.Height)"

# Function to resize image with high quality
function Get-ResizedPngBytes([System.Drawing.Image]$img, [int]$width, [int]$height) {
    $bmp = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    $rect = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
    $graphics.DrawImage($img, $rect)
    $graphics.Dispose()
    
    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()
    return $bytes
}

# 1. Save full-size PNGs (e.g. 512x512 and original size)
$logo512Bytes = Get-ResizedPngBytes $srcImage 512 512
[System.IO.File]::WriteAllBytes("$baseDir\src\renderer\assets\logo.png", $logo512Bytes)
[System.IO.File]::WriteAllBytes("$baseDir\src\renderer\public\logo.png", $logo512Bytes)
[System.IO.File]::WriteAllBytes("$baseDir\public\logo.png", $logo512Bytes)
[System.IO.File]::WriteAllBytes("$baseDir\build\icon.png", $logo512Bytes)
Write-Output "Saved 512x512 PNG logos to assets, public, and build"

# 2. Build multi-resolution ICO (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngList = [System.Collections.ArrayList]::new()
foreach ($sz in $sizes) {
    $pngBytes = Get-ResizedPngBytes $srcImage $sz $sz
    [void]$pngList.Add(@{ Size = $sz; Data = $pngBytes })
}

$icoMs = [System.IO.MemoryStream]::new()
$bw = [System.IO.BinaryWriter]::new($icoMs)

# ICONDIR
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type (1 = ICO)
$bw.Write([uint16]$pngList.Count) # Count

# Header is 6 bytes + 16 bytes per entry
$dataOffset = 6 + ($pngList.Count * 16)

# ICONDIRENTRY array
foreach ($item in $pngList) {
    $sz = $item.Size
    $data = [byte[]]$item.Data
    
    $bWidth = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $bHeight = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    
    $bw.Write([byte]$bWidth)
    $bw.Write([byte]$bHeight)
    $bw.Write([byte]0) # ColorCount
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Planes
    $bw.Write([uint16]32) # BitCount
    $bw.Write([uint32]$data.Length) # BytesInRes
    $bw.Write([uint32]$dataOffset) # ImageOffset
    
    $dataOffset += $data.Length
}

# Image data
foreach ($item in $pngList) {
    $data = [byte[]]$item.Data
    $bw.Write($data, 0, $data.Length)
}

$bw.Flush()
$icoBytes = $icoMs.ToArray()
$bw.Close()
$icoMs.Dispose()

[System.IO.File]::WriteAllBytes("$baseDir\build\icon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$baseDir\build\installerIcon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$baseDir\build\uninstallerIcon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$baseDir\public\icon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$baseDir\src\renderer\public\favicon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$baseDir\src\renderer\public\icon.ico", $icoBytes)

$srcImage.Dispose()
Write-Output "Successfully generated .ico file with sizes 256, 128, 64, 48, 32, 16 (Total $($icoBytes.Length) bytes)"
