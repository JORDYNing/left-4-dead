#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if ! command -v python3 >/dev/null 2>&1; then
  print '需要 Python 3 才能启动本地游戏。请先安装 Python 3，然后重新双击此文件。'
  read -r '?按回车关闭…'
  exit 1
fi
if ! python3 scripts/serve.py; then
  read -r '?启动失败，按回车关闭…'
  exit 1
fi
print '游戏已在浏览器中打开。可以关闭此终端窗口。'
