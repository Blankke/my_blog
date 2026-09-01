#!/usr/bin/env bash
set -euo pipefail

# 使用示例：
#   将待处理图片放入 gallery/candidates/，然后执行：
#   bash scripts/build-gallery-images.sh
#
# 处理规则：
# - 输入：gallery/candidates/*（脚本启动时获取文件列表）
# - 输出：gallery/images/*.avif
# - 尺寸：保留原图像素尺寸与宽高比，仅根据 EXIF 修正方向

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
    "$src" \
    -auto-orient \
    -strip \
    -quality 45 \
    "$tmp"

  mv -f "$tmp" "$dst"
  rm -f "$src"
  processed=$((processed + 1))
done

echo "Done. Processed $processed image(s) into $IMAGES_DIR"
