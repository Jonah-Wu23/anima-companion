# 邮箱+密码注册登录功能实施计划

Implementation Plan. Task List and Thought in Chinese

**状态**: 待评审  
**创建日期**: 2026-02-19  
**相关需求**: 在保留现有手机号注册/登录链路的基础上，新增邮箱+密码注册和登录选项（无需邮箱验证码验证）

---

## 目标

在保留现有手机号注册/登录链路的基础上，新增**邮箱+密码**注册和登录选项。无需邮箱验证码验证，直接使用邮箱+密码完成注册和登录。

## 非目标（本期不做）

- 邮箱验证（发送验证邮件、验证链接）
- 找回/重置密码
- 手机号与邮箱绑定同一账号
- 第三方 OAuth 登录

## 现状调研（基于当前代码）

- 后端账号存储使用 SQLite，初始化逻辑在 `server/app/repositories/auth_store.py` 的 `_init_tables()` 中执行 `CREATE TABLE IF NOT EXISTS ...`。
- 现有接口（均在 `server/app/api/v1/endpoints/auth.py`）：
  - `POST /v1/auth/register`：手机号 + 短信验证码 + 密码注册（包含人机验证）。
  - `POST /v1/auth/login/password`：账号 + 密码登录（包含人机验证；账号字段可输入手机号或用户名）。
  - `POST /v1/auth/login/sms`：手机号 + 短信验证码登录（包含人机验证）。
- 前端页面：
  - `web/src/app/register/page.tsx` 目前只有手机号注册。
  - `web/src/app/login/page.tsx` 目前只有密码登录/短信登录两种 Tab。

---

## 任务清单

### 1. 后端 - 数据库层 `server/app/repositories/auth_store.py`

- [ ] 修改 `auth_users` 表结构，添加 `email` 字段（可为空）
- [ ] 新增“启动时迁移”逻辑：已有数据库缺少 `email` 列时，执行 `ALTER TABLE auth_users ADD COLUMN email TEXT`
- [ ] 创建唯一索引 `idx_auth_users_email`（用于约束邮箱唯一；允许 `NULL`）
- [ ] 新增 `normalize_email()`（`strip + lower`）
- [ ] 新增 `register_user_with_email(email, password)`：创建账号并写入 `email`
- [ ] 新增 `authenticate_user_by_email(email, password)`：按 `email` 查询并校验密码
- [ ] 新增 `get_user_by_email(email)` 方法（供后续绑定/找回密码复用）
- [ ] 保持现有 `register_user()`/`authenticate_user()` 行为不变，避免影响手机号链路

### 2. 后端 - API Schema `server/app/schemas/auth.py`

- [ ] 新增 `AuthRegisterEmailRequest`（email, password, captcha_verify_param）
- [ ] 新增 `AuthLoginEmailRequest`（email, password, captcha_verify_param）
- [ ] 邮箱字段使用更严格的类型/校验（建议使用 Pydantic `EmailStr`），并设置合理长度上限（建议 `<= 254`）

### 3. 后端 - API 接口 `server/app/api/v1/endpoints/auth.py`

- [ ] 新增 `POST /v1/auth/register/email` 接口
  - 人机验证（复用 `scene="register"`）
  - 邮箱规范化（小写化）并校验格式
  - 检查邮箱是否已存在
  - 创建用户（`account` 自动生成；`email` 存储规范化邮箱）
  - 创建会话，写入 Cookie，返回 `AuthSessionResponse`
- [ ] 新增 `POST /v1/auth/login/email` 接口
  - 人机验证（复用 `scene="login"`）
  - 邮箱规范化并校验格式
  - 验证邮箱+密码（失败返回通用错误，避免账号枚举）
  - 创建会话，写入 Cookie，返回 `AuthSessionResponse`

### 4. 前端 - API 类型 `web/src/lib/api/types.ts`

- [ ] 新增 `AuthRegisterEmailRequest` 接口
- [ ] 新增 `AuthLoginEmailRequest` 接口

### 5. 前端 - API 客户端 `web/src/lib/api/client.ts`

- [ ] 新增 `registerWithEmail()` 方法
- [ ] 新增 `loginWithEmail()` 方法

### 6. 前端 - 注册页面 `web/src/app/register/page.tsx`

- [ ] 添加注册方式切换 Tab（手机号注册 / 邮箱注册），默认保持手机号注册不变
- [ ] 邮箱注册表单（邮箱、密码、确认密码、协议勾选）
- [ ] 邮箱格式校验与一致性校验（两次密码一致）
- [ ] 复用现有阿里云人机验证（`verifyAliyunCaptcha("register")`）
- [ ] 调用 `api.registerWithEmail()`，成功后跳转 `/chat`

### 7. 前端 - 登录页面 `web/src/app/login/page.tsx`

- [ ] 扩展登录方式 Tab（密码登录 / 短信登录 / 邮箱登录）
- [ ] 邮箱登录表单（邮箱、密码）
- [ ] 复用现有阿里云人机验证（`verifyAliyunCaptcha("login")`）
- [ ] 调用 `api.loginWithEmail()`，成功后跳转 `/chat`

### 8. 联调与自测

- [ ] 覆盖用例：邮箱注册成功、邮箱重复注册、邮箱登录成功、邮箱密码错误、邮箱格式错误、验证码失败
- [ ] 前端：`npm run typecheck`（以及必要时 `npm run lint`）
- [ ] 后端：启动服务后用 Postman/HTTPie 验证 2 个新接口，确认 Cookie 写入与 `GET /v1/auth/me` 可用

---

## 数据模型设计

### 用户表结构（扩展后）

```sql
auth_users:
  - id: INTEGER PRIMARY KEY
  - account: TEXT UNIQUE NOT NULL  -- 用户名/手机号/系统生成账号
  - email: TEXT                    -- 新增：邮箱（可选，使用唯一索引约束）
  - password_hash: TEXT NOT NULL
  - created_at: INTEGER
```

### 迁移策略（重要）

由于当前项目没有单独的 migration 框架，且表结构由 `_init_tables()` 在启动时创建/确保，需要采用“启动时轻量迁移”：

1. 连接数据库后检查 `auth_users` 是否存在 `email` 列（`PRAGMA table_info(auth_users)`）。
2. 若不存在，则执行 `ALTER TABLE auth_users ADD COLUMN email TEXT`。
3. 创建唯一索引 `idx_auth_users_email`（建议使用 `CREATE UNIQUE INDEX IF NOT EXISTS ...`）。

### 关键决策

- `account` 字段仍作为主账号标识（保持向后兼容）
- 邮箱注册用户：`account` 自动生成（例如 `email_<随机>`），`email` 存储规范化邮箱
- 邮箱登录走新接口，仅按 `email` 字段匹配（不与 `account` 混用，边界清晰）

---

## 接口设计

### 新注册接口

```http
POST /v1/auth/register/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPassword123",
  "captcha_verify_param": "..."
}
```

**成功响应**: `AuthSessionResponse`

**错误码**:
- `409` - 邮箱已存在
- `400` - 格式错误

### 新登录接口

```http
POST /v1/auth/login/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPassword123",
  "captcha_verify_param": "..."
}
```

**成功响应**: `AuthSessionResponse`

**错误码**:
- `401` - 邮箱或密码错误（通用提示，避免泄露账号是否存在）

---

## 验证规则

| 字段 | 规则 |
|------|------|
| 邮箱 | 标准邮箱格式校验，规范化小写，最大254字符 |
| 密码 | 6-128位，建议包含大小写字母+数字 |
| 验证码 | 复用现有阿里云验证码机制 |

---

## 风险与注意事项

1. **向后兼容**: 现有手机号用户数据不受影响
2. **迁移可靠性**: 生产/本地已有数据库必须通过“启动时迁移”补齐 `email` 列与索引
3. **唯一性约束**: 邮箱必须全局唯一（以规范化后的小写值为准）
4. **安全性**: 仍强制要求阿里云人机验证，降低撞库与暴力尝试风险
5. **账号枚举**: 登录失败使用通用错误提示；注册可提示“邮箱已存在”以提升用户体验
6. **账号关联**: 当前版本暂不支持手机号+邮箱绑定同一账号（可在后续迭代添加）

---

## 预估工作量

- 后端开发：2-3小时
- 前端开发：3-5小时（UI Tab + 表单校验）
- 联调测试：1-2小时
- **总计：6-10小时**

---

## 验收标准

- [ ] 用户可以通过邮箱+密码成功注册新账号
- [ ] 用户可以使用邮箱+密码成功登录
- [ ] 注册和登录时均需通过阿里云验证码验证
- [ ] 邮箱格式不正确时给出明确错误提示
- [ ] 邮箱已存在时给出明确错误提示（例如“邮箱已存在”）
- [ ] 密码错误时给出通用错误提示（不泄露账号是否存在）
- [ ] 现有手机号注册/登录功能不受影响
- [ ] 注册成功后自动登录并跳转至聊天页面

---

## 发布与回滚

- 发布顺序建议：先后端（新接口 + 迁移）再前端（打开邮箱 Tab），避免前端先发导致 404。
- 回滚策略：如出现问题，前端隐藏邮箱 Tab；后端保留接口与字段不影响旧链路（兼容性回滚成本最低）。

## 后续优化建议（不在本次实施范围）

1. **邮箱验证**: 添加可选的邮箱验证流程，提升账号安全性
2. **找回密码**: 支持通过邮箱找回密码
3. **账号绑定**: 支持手机号和邮箱绑定到同一账号
4. **第三方登录**: 接入 Google、GitHub 等 OAuth 登录
