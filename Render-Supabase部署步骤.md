# Render + Supabase 部署步骤

这个方案不需要你买服务器，也不需要 cpolar 实名认证。

Render 用来运行网页后端。

Supabase 用来放 PostgreSQL 数据库。

## 1. 先注册账号

需要你自己注册：

```text
https://render.com/
https://supabase.com/
```

## 2. 在 Supabase 创建数据库

1. 登录 Supabase。
2. New project。
3. 设置项目名，例如：

```text
fitness-meal-planner
```

4. 设置数据库密码，自己保存好。
5. 等项目创建完成。
6. 找到数据库连接串，通常在 Project Settings -> Database -> Connection string。

需要的是 PostgreSQL 连接地址，格式类似：

```text
postgresql://postgres.xxxxx:你的密码@aws-xxx.pooler.supabase.com:6543/postgres
```

注意：这个地址不要发给别人，不要写进前端网页。

## 3. 把项目上传到 GitHub

Render 最简单的部署方式是连接 GitHub 仓库。

需要上传的核心文件：

```text
fitness-meal-planner.html
server.js
package.json
package-lock.json
render.yaml
```

不要上传：

```text
node_modules
data
*.log
postgres-backup-*.sql
.env
```

这些已经写进 `.gitignore`。

## 4. 在 Render 创建 Web Service

1. 登录 Render。
2. New -> Web Service。
3. 选择你的 GitHub 仓库。
4. Runtime 选择 Node。
5. Build Command：

```text
npm install
```

6. Start Command：

```text
npm start
```

## 5. 设置 Render 环境变量

在 Render 的 Environment 页面添加：

```text
DATABASE_URL=你从 Supabase 复制的数据库连接串
ADMIN_TOKEN=你自己的后台查看密码
PGSSLMODE=require
```

`ADMIN_TOKEN` 是你自己查看领取需求用的密码。

用户不需要知道这个密码。

## 6. 部署成功后访问

Render 会给你一个网址，例如：

```text
https://fitness-meal-planner.onrender.com
```

用户访问：

```text
https://fitness-meal-planner.onrender.com
```

你自己查看领取需求：

```text
https://fitness-meal-planner.onrender.com/api/leads?token=你的ADMIN_TOKEN
```

## 7. 注意

免费版 Render 可能会休眠。

如果一段时间没人访问，第一次打开可能会慢一点。

这是免费测试阶段可以接受的问题。

正式收费后建议升级套餐或换正式服务器。

