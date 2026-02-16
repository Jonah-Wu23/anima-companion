# 阿里云宝塔（Linux）部署手册（anima-companion.cn）

## 0. 现状与结论（先看）

你当前提供的信息（到期时间 `2027-02-16 17:57:24`）显示：

- 域名：`anima-companion.cn` / `www.anima-companion.cn`
- 解析：已指向 `47.100.139.165`
- 备案：**未备案**

在中国大陆服务器场景下，**未备案域名无法稳定对外提供网站访问**（80/443 可能被拦截或提示未备案）。

所以部署建议分两阶段：

1. **阶段 A（立即可做）**：先用服务器 IP 验证完整链路（可联调、可验收）。
2. **阶段 B（备案完成后）**：切换到 `anima-companion.cn + HTTPS` 正式发布。

---

## 1. 目标拓扑

- `Nginx`（80/443）统一入口
- `Next.js` 前端：`127.0.0.1:3000`
- `FastAPI` 后端：`127.0.0.1:18000`
- Nginx 转发规则：
  - `/` -> Next.js
  - `/api/` -> FastAPI（转发后端 `/v1/...`）

---

## 2. 服务器准备（宝塔面板）

## 2.1 宝塔安装软件

在宝塔软件商店安装：

- `Nginx`（建议 1.24+）
- `Node.js`（建议 20 LTS）
- `Python`（3.11+）
- `PM2管理器`（可选，不用 PM2 也行）

## 2.2 阿里云安全组 / 宝塔防火墙

放行端口：

- `22`（SSH）
- `80`（HTTP）
- `443`（HTTPS，备案后使用）

不要对公网开放 `3000/18000`，仅本机回环访问。

---

## 3. 拉取代码与目录规划

以下命令在服务器 SSH 执行：

```bash
cd /www/wwwroot
git clone <你的仓库地址> anima-companion
cd /www/wwwroot/anima-companion
```

后续默认项目根目录：

`/www/wwwroot/anima-companion`

## 3.1 按当前 `.gitignore` 的仓库建议（部署最省事）

结合当前根目录 `.gitignore`，为保证服务器上 `git clone` 后可直接完成大部分部署，建议 GitHub 仓库至少包含：

- `web/`（Next.js 前端源码）
- `server/`（FastAPI 后端源码）
- `configs/`（动作清单、人物与提示词配置）
- `scripts/`（启动与校验脚本）
- `docs/`（运维与发布文档）
- `assets/model_photos/`（衣柜缩略图）
- `assets/photos/`（默认相册图片，如需预置）
- `assets/audio/references/`（语音参考音频，如需预置）
- `assets/textures/`（通用贴图资源，如有）

同时，以下内容继续保持“不要放 GitHub”是合理的（当前已在 `.gitignore`）：

- 所有密钥与环境文件：`.env*`、`secrets/`、证书与密钥文件
- 运行时数据：`server/.data/`、`*.db`、`*.sqlite*`
- 构建与缓存：`web/.next/`、`node_modules/`、`__pycache__/`
- 大体积原始资产：`assets/models/`、`assets/motions/phainon/raw/`

说明：`assets/models/` 与 `assets/motions/phainon/raw/` 被忽略，是“代码已拉取但 3D 角色或动作缺失”的主要原因。

> 可选优化：若后续要用 GitHub Actions 自动部署，需要把 `.github/` 从 `.gitignore` 中移除，再提交 workflow 文件。

## 3.2 “我要自己上传”文件清单（不走 GitHub）

以下文件/目录请在服务器上手工上传到 `/www/wwwroot/anima-companion` 对应位置：

1. `server/.env`
2. `web/.env.production`
3. `assets/models/`（整目录，含 PMX、贴图、物理与依赖资源）
4. `assets/motions/phainon/raw/`（整目录，含 VMD；与 `configs/motions/phainon-motion-manifest.yaml` 对齐）
5. `server/.data/companion.db`（仅当你要保留已有账号/关系值/记忆数据时上传）
6. `server/.data/auth_*` 相关运行时文件（仅当你要保留登录态与验证码上下文时上传）
7. HTTPS 证书文件（如你不使用宝塔自动签发）：`*.pem`、`*.key`、`*.pfx` 等

按当前模型注册表（`web/src/lib/wardrobe/model-registry.ts`），`assets/models/` 至少应覆盖这些目录：

- `assets/models/Phainon`
- `assets/models/Phainon_Khaslana_normal`
- `assets/models/Phainon_Khaslana`
- `assets/models/Phainon_Demiurge/白厄 - 粉3`
- `assets/models/Phainon_IronTomb_White/白厄 - red`
- `assets/models/Phainon_Agent_White`
- `assets/models/Phainon_Agent_Black`
- `assets/models/Phainon_CaptainUniform`
- `assets/models/Phainon_LuckinCollab/白厄瑞幸联动`
- `assets/models/Phainon_ANAN_Magazine/白厄anan杂志`
- `assets/models/Phainon_Goddess/白厄女神 - by_填字小檀桌`
- `assets/models/Phainon_Lady/白厄女士 - 双版本`

--- 

## 4. 配置后端（FastAPI）

## 4.1 创建 Python 虚拟环境并安装依赖

```bash
cd /www/wwwroot/anima-companion/server
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
```

## 4.2 配置 `server/.env`

```bash
cd /www/wwwroot/anima-companion/server
cp .env.example .env
```

最低建议修改项（按你真实配置填写）：

- `LLM_API_KEY`
- `DASHSCOPE_API_KEY`
- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `AUTH_SMS_SIGN_NAME`
- `AUTH_SMS_TEMPLATE_CODE`
- `AUTH_CAPTCHA_SCENE_ID_LOGIN`
- `AUTH_CAPTCHA_SCENE_ID_REGISTER`
- `AUTH_CAPTCHA_SCENE_ID_SMS`
- `AUTH_SESSION_SECRET`（必须改成强随机值）

按上线阶段设置：

- 阶段 A（IP + HTTP）
  - `AUTH_COOKIE_SECURE=false`
  - `CORS_ALLOW_ORIGINS=http://47.100.139.165`
- 阶段 B（域名 + HTTPS）
  - `AUTH_COOKIE_SECURE=true`
  - `CORS_ALLOW_ORIGINS=https://anima-companion.cn,https://www.anima-companion.cn`

如果你暂时没有本机 SenseVoice / GPT-SoVITS 服务，建议先改成云端链路优先，避免超时：

- `ASR_PROVIDER_PRIORITY=fun_asr_realtime`
- `TTS_PROVIDER_PRIORITY=qwen_clone_tts`

---

## 5. 配置前端（Next.js）

## 5.1 安装依赖并构建

```bash
cd /www/wwwroot/anima-companion/web
npm ci
```

## 5.2 配置 `web/.env.production`

```bash
cd /www/wwwroot/anima-companion/web
cp .env.example .env.production
```

按阶段设置 `NEXT_PUBLIC_API_BASE_URL`：

- 阶段 A（IP 验证）：`http://47.100.139.165/api`
- 阶段 B（正式域名）：`https://anima-companion.cn/api`

然后构建：

```bash
cd /www/wwwroot/anima-companion/web
npm run build
```

---

## 6. 注册系统服务（systemd，推荐）

## 6.1 后端服务

创建文件 `/etc/systemd/system/anima-server.service`：

```ini
[Unit]
Description=Anima Companion FastAPI Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/www/wwwroot/anima-companion/server
EnvironmentFile=/www/wwwroot/anima-companion/server/.env
ExecStart=/www/wwwroot/anima-companion/server/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 18000
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

## 6.2 前端服务

创建文件 `/etc/systemd/system/anima-web.service`：

```ini
[Unit]
Description=Anima Companion Next.js Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/www/wwwroot/anima-companion/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

## 6.3 启动服务

```bash
systemctl daemon-reload
systemctl enable anima-server anima-web
systemctl restart anima-server anima-web
systemctl status anima-server --no-pager
systemctl status anima-web --no-pager
```

---

## 7. 配置宝塔 Nginx 反向代理

在宝塔站点（可先用 IP 站点）中，将 Nginx 配置改为：

```nginx
server {
    listen 80;
    server_name 47.100.139.165 anima-companion.cn www.anima-companion.cn;

    client_max_body_size 50m;

    # Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # FastAPI API (/api/v1/* -> /v1/*)
    location /api/ {
        proxy_pass http://127.0.0.1:18000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

验证并重载：

```bash
nginx -t
systemctl reload nginx
```

---

## 8. 联调验收（阶段 A：IP）

## 8.1 服务健康检查

```bash
curl -s http://127.0.0.1:18000/healthz
curl -I http://127.0.0.1:3000
curl -s http://47.100.139.165/api/healthz
```

`/api/healthz` 返回 `{"status":"ok"}` 即后端代理成功。

## 8.2 页面与关键链路

- 打开 `http://47.100.139.165`
- 注册/登录（验证码、短信）
- 进入聊天页
- VIP 入口跳转到 `/sponsor`
- 点击“我已打赏，启用VIP”后回跳

---

## 9. 切换到正式域名（阶段 B：备案后）

完成备案与 SSL 后执行：

1. 宝塔站点绑定：`anima-companion.cn`、`www.anima-companion.cn`
2. 配置 HTTPS 证书（阿里云 SSL 或你自己的证书）
3. 修改环境变量：
   - `server/.env`
     - `AUTH_COOKIE_SECURE=true`
     - `CORS_ALLOW_ORIGINS=https://anima-companion.cn,https://www.anima-companion.cn`
   - `web/.env.production`
     - `NEXT_PUBLIC_API_BASE_URL=https://anima-companion.cn/api`
4. 重新构建并重启：

```bash
cd /www/wwwroot/anima-companion/web
npm run build
systemctl restart anima-web anima-server
systemctl reload nginx
```

---

## 10. 发布/回滚流程（建议）

## 10.1 发布

```bash
cd /www/wwwroot/anima-companion
git pull

cd /www/wwwroot/anima-companion/server
source .venv/bin/activate
pip install -e .

cd /www/wwwroot/anima-companion/web
npm ci
npm run build

systemctl restart anima-server anima-web
```

## 10.2 快速回滚

```bash
cd /www/wwwroot/anima-companion
git log --oneline -n 5
git reset --hard <上一版本commit>

cd /www/wwwroot/anima-companion/web
npm run build
systemctl restart anima-server anima-web
```

---

## 11. 常见故障排查

## 11.1 502 / 网关错误

```bash
systemctl status anima-server --no-pager
journalctl -u anima-server -n 200 --no-pager
```

## 11.2 前端空白或 JS 报错

```bash
systemctl status anima-web --no-pager
journalctl -u anima-web -n 200 --no-pager
```

## 11.3 Nginx 配置错误

```bash
nginx -t
journalctl -u nginx -n 100 --no-pager
```

## 11.4 Cookie 不生效

重点检查：

- 是否 HTTPS 环境下将 `AUTH_COOKIE_SECURE` 设为 `true`
- `NEXT_PUBLIC_API_BASE_URL` 与访问域名是否一致（建议同域 `/api`）
- `CORS_ALLOW_ORIGINS` 是否包含当前前端来源
