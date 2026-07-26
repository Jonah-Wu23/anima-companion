#!/usr/bin/env bash
# 服务器端一键执行：模型贴图 WebP 转换 + 校验。
# 用法：
#   bash scripts/release/server_webp_convert.sh                 # dry-run -> apply -> verify
#   bash scripts/release/server_webp_convert.sh --dry-run-only  # 只看不写
#   bash scripts/release/server_webp_convert.sh --root assets/models/Phainon
# 退出码：任一阶段失败即非 0，便于接入发布流水线。

set -euo pipefail

# ---------- 参数 ----------
ROOT="assets/models"
DRY_RUN_ONLY=0
NO_CHOWN=0
REPORT_DIR="tmp"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="${2:?--root 需要一个路径参数}"
      shift 2
      ;;
    --dry-run-only)
      DRY_RUN_ONLY=1
      shift
      ;;
    --no-chown)
      NO_CHOWN=1
      shift
      ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "[webp-oneclick] 未知参数: $1" >&2
      exit 2
      ;;
  esac
done

# ---------- 定位仓库根目录 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

CONVERT_SCRIPT="scripts/bootstrap/convert_model_textures_to_webp.py"
VERIFY_SCRIPT="scripts/validation/verify_model_texture_webp.py"

# ---------- 选择 Python（逐个验证能真正执行）----------
PY=""
CANDIDATES=(
  "server/.venv/bin/python"
  "server/venv/bin/python"
  "python3"
  "python"
)
for cand in "${CANDIDATES[@]}"; do
  if [[ "${cand}" == */* ]]; then
    [[ -x "${cand}" ]] || continue
  else
    command -v "${cand}" >/dev/null 2>&1 || continue
  fi
  # 不仅要存在，还要能执行（排除 /usr/bin/python3 无执行权限等情况）
  if "${cand}" -c "import sys" >/dev/null 2>&1; then
    PY="${cand}"
    break
  fi
  echo "[webp-oneclick] 候选 ${cand} 存在但无法执行，跳过" >&2
done

if [[ -z "${PY}" ]]; then
  echo "[webp-oneclick] 未找到可执行的 python，请检查以下位置：" >&2
  echo "  ls -l server/.venv/bin/python* /usr/bin/python3*" >&2
  echo "若是 /usr/bin/python3 无执行权限，可执行: chmod +x /usr/bin/python3*" >&2
  exit 1
fi
echo "[webp-oneclick] python=${PY} root=${ROOT}"

# ---------- 确保 Pillow ----------
if ! "${PY}" -c "import PIL" >/dev/null 2>&1; then
  echo "[webp-oneclick] 未检测到 Pillow，开始安装..."
  "${PY}" -m pip install -U Pillow
fi

mkdir -p "${REPORT_DIR}"

# ---------- 1) dry-run ----------
echo "[webp-oneclick] [1/3] dry-run 预览..."
"${PY}" "${CONVERT_SCRIPT}" \
  --root "${ROOT}" \
  --dry-run \
  --report-path "${REPORT_DIR}/webp-convert-dryrun.json"

if [[ "${DRY_RUN_ONLY}" -eq 1 ]]; then
  echo "[webp-oneclick] --dry-run-only 指定，未写入任何文件。"
  exit 0
fi

# ---------- 2) apply ----------
echo "[webp-oneclick] [2/3] 实际写入 .webp..."
"${PY}" "${CONVERT_SCRIPT}" \
  --root "${ROOT}" \
  --apply \
  --report-path "${REPORT_DIR}/webp-convert-apply.json"

# ---------- 3) verify ----------
echo "[webp-oneclick] [3/3] 校验（要求 missing=0 decode_failed=0 size_mismatch=0）..."
"${PY}" "${VERIFY_SCRIPT}" \
  --root "${ROOT}" \
  --report-path "${REPORT_DIR}/webp-verify.json"

# ---------- 属主修复（root 执行时把文件还给 www） ----------
if [[ "${NO_CHOWN}" -eq 0 ]] && [[ "$(id -u)" -eq 0 ]] && id www >/dev/null 2>&1; then
  echo "[webp-oneclick] 当前为 root，回收属主到 www:www ${ROOT}"
  chown -R www:www "${ROOT}"
fi

echo "[webp-oneclick] 完成。建议线上验收："
echo "  curl -s -o /dev/null -w '%{http_code}\\n' \\"
echo "    'https://anima-companion.fun/api/local-files/assets/models/Phainon/%E9%A2%9C.webp'"
echo "  python3 scripts/validation/verify_local_files_assets.py --base-url https://anima-companion.fun"
