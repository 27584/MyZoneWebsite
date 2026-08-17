# MyZone 官网

`website/` 目录是 MyZone 应用的静态官网与 Supabase 演示前端。
它用于展示 MyZone 的桌面应用核心功能、用户登录流程、仪表盘体验和后台管理页面。

## 配置说明

### 1. 设置 Supabase

在 [Supabase](https://supabase.com/) 创建一个新项目，然后：

1. **创建数据库表**：
   - 在 Supabase 控制台的 SQL 编辑器中执行 `../supabase/schema.sql`
   - 然后执行 `../supabase/security-policies.sql`

2. **启用 Email 认证**：
   - 进入 Authentication -> Settings
   - 启用 Email/Password 认证方式

3. **获取项目凭证**：
   - 进入 Settings -> API Keys
   - 切换到 API Keys 选项卡（新版密钥）
   - 复制 `Project URL` 和 `Publishable key`（格式：`sb_publishable_xxx`）

### 2. 配置网站

编辑 `js/supabase-client.js` 文件，替换以下内容：

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_your-key-here';
```

将 `your-project-id.supabase.co` 替换为你的 Supabase Project URL，将 `sb_publishable_your-key-here` 替换为你的 Publishable key。

### 3. 站点功能说明

- `index.html`：宣传首页，展示 MyZone 隐私空间与浏览器扩展支持
- `sponsor.html`：赞助页面，展示 PRO 版和支持项目的入口
- `dashboard.html`：用户仪表盘页面，用于展示登录后用户状态和功能入口
- `admin.html`：后台管理页面，用于管理员上传和管理扩展内容

## 部署到 GitHub Pages

### 自动部署（推荐）

项目已配置 GitHub Actions 工作流，会自动将 `website/` 目录部署到 GitHub Pages：

1. 将仓库推送到 GitHub
2. 在仓库 **Settings -> Pages -> Build and deployment -> Source** 选择 **"GitHub Actions"**
3. 推送 `main` 分支，或手动触发 **Deploy Website to Pages** 工作流即可部署

工作流文件：[`.github/workflows/deploy-pages.yml`](file:///d:/Projects/AI%20Projects/MyZone/.github/workflows/deploy-pages.yml)

### 手动部署

1. 将 `website` 目录的内容推送到 GitHub 仓库
2. 在仓库的 Settings -> Pages 中：
   - Source 选择 `Deploy from a branch`
   - Branch 选择 `main`，目录选择 `/website`
   - 点击 Save

## 技术栈

- HTML5 + CSS3 + JavaScript (ES6+)
- Supabase Auth (Email/Password)
- Supabase Database (PostgreSQL)
- GitHub Pages 部署