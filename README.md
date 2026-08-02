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

1. 将 `website` 目录的内容推送到 GitHub 仓库
2. 在仓库的 Settings -> Pages 中：
   - Source 选择 `main` 分支
   - 如果你使用的是子目录，选择 `/ (root)` 或 `/website`（根据你的仓库结构）
   - 点击 Save

GitHub Pages 会自动部署网站。由于我们已经添加了 `.nojekyll` 文件，所有文件都会被正确服务。

## 技术栈

- HTML5 + CSS3 + JavaScript (ES6+)
- Supabase Auth (Email/Password)
- Supabase Database (PostgreSQL)
- GitHub Pages 部署