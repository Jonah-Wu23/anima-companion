# 宝塔发布（首载性能版 + WebP 贴图）

目标：优先解决首载慢，聚焦 `模型贴图 WebP 化 + gzip/br 传输压缩 + 资源预压缩`，不改业务逻辑。

## 1) 构建前预压缩资源

一键方式（推荐，等价于下方分步命令的 1~3）：

```bash
cd /www/wwwroot/anima-companion

# 若 git pull 报 "dubious ownership"，先执行一次：
# git config --global --add safe.directory /www/wwwroot/anima-companion

bash scripts/release/server_webp_convert.sh                 # dry-run -> apply -> verify
bash scripts/release/server_webp_convert.sh --dry-run-only  # 只预览不写入
```

脚本会自动选择 `server/.venv/bin/python`、缺 Pillow 时自动安装，root 执行时自动把 `assets/models` 属主回收为 `www:www`。

分步方式（需要单独控制参数时使用），在项目根目录执行：

```bash
cd /www/wwwroot/anima-companion
/www/server/nodejs/v22.22.0/bin/node -v
/www/server/nodejs/v22.22.0/bin/npm -v
VENV_PY=/www/wwwroot/anima-companion/server/.venv/bin/python

# 首次/缺依赖时安装 Pillow（WebP 与 TGA 优化脚本都依赖）
$VENV_PY -m pip install -U Pillow

# 可选：先做一次 TGA-RLE 贴图瘦身（默认 dry-run，确认后加 --apply）
$VENV_PY scripts/bootstrap/optimize_tga_rle.py --root assets/models --min-size-kb 256
# $VENV_PY scripts/bootstrap/optimize_tga_rle.py --root assets/models --min-size-kb 256 --apply

# 1) 模型贴图转 WebP（先 dry-run 看体积收益）
$VENV_PY scripts/bootstrap/convert_model_textures_to_webp.py --root assets/models --dry-run --report-path ./tmp/webp-convert-report.json

# 2) 实际写入 WebP
$VENV_PY scripts/bootstrap/convert_model_textures_to_webp.py --root assets/models --apply --report-path ./tmp/webp-convert-report-apply.json

# 3) 发布前校验（必须全绿）
$VENV_PY scripts/validation/verify_model_texture_webp.py --root assets/models --report-path ./tmp/webp-verify-report.json

# 4) 生成 assets/configs 的 .br/.gz 旁路文件（只在源文件更新后重建）
/www/server/nodejs/v22.22.0/bin/npm run precompress:assets
```

说明：
- 该命令会为 `.pmx/.vmd/.tga/.bmp` 等文件生成同名 `.br/.gz`。
- Web 端 `/api/local-files/*` 已支持优先命中这些预压缩文件。
- Web 前端默认开启 WebP 贴图优先加载（`NEXT_PUBLIC_MMD_PREFER_WEBP_TEXTURES=1`）。

## 2) 构建并重启 Web

```bash
cd /www/wwwroot/anima-companion/web
export PATH=/www/server/nodejs/v22.22.0/bin:$PATH
BT_DEPLOY_SKIP_CHECKS=1 NODE_OPTIONS="--max-old-space-size=1536" npm run build
```

宝塔操作：
- 重启 Node 项目：`anima-web`
- 重启 Nginx

## 3) Nginx 压缩（建议开启）

放在站点 `server {}` 或全局 `http {}` 中：

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 5;
gzip_proxied any;
gzip_types
  application/octet-stream
  application/wasm
  image/bmp
  image/x-targa
  text/plain
  text/yaml
  application/json
  application/javascript;
```

重载 Nginx 后验证：

```bash
curl -I -H "Accept-Encoding: br, gzip" "https://anima-companion.fun/api/local-files/assets/models/Phainon/%E9%A2%9C%E8%B5%A4.tga"
```

期望头部至少出现其一：
- `Content-Encoding: br`
- `Content-Encoding: gzip`

## 4) 快速回滚开关（只回退贴图请求策略）

如果上线后出现个别机型材质异常，可先切换：

```bash
# web/.env.production 或宝塔环境变量
NEXT_PUBLIC_MMD_PREFER_WEBP_TEXTURES=0
```

然后重建并重启 Web（无需重转贴图、无需改 PMX）。

## 5) 验收清单

```bash
curl -s http://127.0.0.1:18000/healthz
curl -s https://anima-companion.fun/api/healthz
python3 scripts/validation/verify_local_files_assets.py --base-url https://anima-companion.fun
```

页面侧重点：
- 首次进入角色页的贴图请求后缀以 `.webp` 为主，`png/tga/bmp` 显著减少。
- 同网络条件下，模型贴图总传输体积降幅目标 `>= 50%`。
- 首次换装耗时下降；二次换装继续命中缓存。
