# List Portal —— 订阅管理

订阅/账号/到期时间管理，两层密码保护。

- 前台 `https://list.tszheoi-law.top` —— 需要密码（默认 `6966@list`）才能查看
- 后台 `https://list.tszheoi-law.top/tsz` —— 管理密码（默认 `6966@List`），增删改

## 四列数据

| 列 | 说明 |
|---|---|
| 类型 | 例如 会员 / 云服务 / 软件 |
| 名字 | 订阅名 |
| 账号 | 账号或邮箱 |
| 到期 | 日期，前台会按剩余天数标色（过期红、30 天内黄） |

## 架构

```
浏览器 ──► Cloudflare Pages
             ├── GET  /       functions/index.js   前台（校验密码 → 渲染表格）
             ├── POST /       functions/index.js   登录 / 退出
             └── /tsz         functions/tsz.js     后台（仅管理员）
                                    ↓
                          GitHub 仓库的 subs.json
```

## 文件

```
subs.json              数据源
functions/index.js     前台（密码门 + 表格）
functions/tsz.js       后台（密码门 + 增删改）
public/index.html      兜底页（Functions 失效时显示）
```

## Cloudflare Pages 配置

- 构建命令：**留空**
- 构建输出目录：`public`
- Functions：仓库根目录 `functions/`（自动识别）

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VIEW_PASSWORD` | `6966@list` | 前台查看密码 |
| `ADMIN_PASSWORD` | `6966@List` | 后台管理密码 |
| `ADMIN_SECRET` | 需自定义 | 会话签名密钥（随机长串） |
| `GITHUB_TOKEN` | — | GitHub PAT（repo 权限） |
| `GITHUB_REPO` | — | `Tszheoi/list-portal` |
| `GITHUB_BRANCH` | `main` | |
| `GITHUB_FILE` | `subs.json` | |

> 两个密码**区分大小写**：前台是小写 `l`，后台是大写 `L`。

## 数据结构

```json
{
  "items": [
    { "type": "会员", "name": "夸克 SVIP", "account": "abc@example.com", "expire": "2027-01-01" }
  ]
}
```
