#!/usr/bin/env bash
set -euo pipefail

# Build reproducible gallery images:
# - input:  gallery/candidates/* (snapshot at script start)
# - output: gallery/images/*.avif
# - size:   2400x1600 (3:2), full image contained over a softened backdrop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CANDIDATES_DIR="$REPO_DIR/gallery/candidates"
IMAGES_DIR="$REPO_DIR/gallery/images"

if ! command -v convert >/dev/null 2>&1; then
  echo "Error: ImageMagick 'convert' is required but not found." >&2
  exit 1
fi

mkdir -p "$IMAGES_DIR"

# Capture the file list at startup, so newly added files are not processed mid-run.
mapfile -d '' SOURCES < <(
  find "$CANDIDATES_DIR" -maxdepth 1 -type f \
    \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.heic" -o -iname "*.heif" -o -iname "*.tif" -o -iname "*.tiff" -o -iname "*.avif" \) \
    -print0 | sort -z
)

if [[ ${#SOURCES[@]} -eq 0 ]]; then
  echo "No candidate images found in: $CANDIDATES_DIR"
  exit 0
fi

processed=0
for src in "${SOURCES[@]}"; do
  filename="$(basename "$src")"
  stem="${filename%.*}"
  dst="$IMAGES_DIR/$stem.avif"
  tmp="$dst.tmp.avif"

  echo "Compressing: $filename"
  convert \
    \( "$src" \
      -auto-orient \
      -strip \
      -resize "2400x1600^" \
      -gravity center \
      -extent "2400x1600" \
      -blur "0x52" \
      -modulate "72,90,100" \
    \) \
    \( "$src" \
      -auto-orient \
      -strip \
      -resize "2400x1600" \
    \) \
    -gravity center \
    -compose over \
    -composite \
    -quality 45 \
    "$tmp"

  mv -f "$tmp" "$dst"
  rm -f "$src"
  processed=$((processed + 1))
done

echo "Done. Processed $processed image(s) into $IMAGES_DIR"
