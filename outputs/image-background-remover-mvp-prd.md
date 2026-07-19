# Image Background Remover MVP 需求文档

## 1. 项目概述

### 1.1 项目名称

Image Background Remover

### 1.2 项目定位

一个在线图片去背景工具。用户无需注册，打开网站后即可上传图片，系统自动移除图片背景，并返回透明背景 PNG 文件供用户预览和下载。

### 1.3 MVP 核心目标

在最短时间内上线一个可用、稳定、体验顺滑的单图背景移除工具，用于验证关键词 `image background remover` 的自然搜索流量、用户转化和 API 成本模型。

### 1.4 技术前提

- 部署平台：Cloudflare
- 前端托管：Cloudflare Pages
- 后端接口：Cloudflare Pages Functions 或 Cloudflare Workers
- 背景移除服务：Remove.bg API
- 图片存储：不做持久化存储，仅在请求内存中处理
- 输出格式：透明背景 PNG

## 2. 用户与使用场景

### 2.1 目标用户

- 电商卖家：需要快速制作白底或透明底商品图
- 内容创作者：需要制作封面、头像、社交媒体素材
- 设计师和运营人员：需要临时处理素材
- 普通用户：需要从照片中抠出人物、宠物或物品

### 2.2 核心场景

用户搜索 `image background remover` 进入网站，上传一张图片，等待数秒后获得透明背景图片，然后下载用于后续编辑、发布或商品展示。

### 2.3 用户痛点

- 不想安装软件
- 不想注册账号
- 不想学习复杂操作
- 希望处理速度快
- 希望结果可以直接下载
- 担心图片隐私和存储问题

## 3. MVP 范围

### 3.1 MVP 必须包含

- 图片上传
- 拖拽上传
- 图片格式和大小校验
- 调用 Remove.bg API 移除背景
- 原图预览
- 结果图预览
- 下载透明 PNG
- 失败提示
- 加载状态
- 移动端适配
- 基础 SEO 信息
- 隐私说明：图片不存储，仅用于本次处理

### 3.2 MVP 暂不包含

- 用户登录
- 付费系统
- 图片历史记录
- 云端图片存储
- 批量处理
- 图片编辑器
- 手动擦除或恢复背景
- 图片压缩
- API 开放平台
- 多语言版本

### 3.3 后续可扩展功能

- 批量背景移除
- 白底商品图
- 自定义背景颜色
- 自定义背景图片
- 图片裁剪和尺寸预设
- 高清下载
- 免费额度和付费套餐
- 用户工作台
- 开发者 API

## 4. 产品结构

### 4.1 页面列表

MVP 只需要一个核心页面：

- `/`：图片背景移除工具首页

后续 SEO 扩展页面：

- `/remove-background-from-image`
- `/transparent-background-maker`
- `/white-background-image`
- `/product-photo-background-remover`
- `/bulk-background-remover`

### 4.2 首页信息架构

首页首屏应直接呈现工具，而不是营销页。

建议结构：

1. 顶部导航
2. 主工具区
3. 原图与结果图预览区
4. 下载操作区
5. 简短功能说明
6. 常见问题
7. 隐私说明
8. 页脚

## 5. 功能需求

### 5.1 图片上传

#### 功能描述

用户可以通过点击上传区或拖拽图片到上传区来选择图片。

#### 支持格式

- JPG
- JPEG
- PNG
- WebP

#### 文件限制

MVP 建议限制：

- 单张图片最大 10 MB
- 只支持单图上传

如果 Remove.bg API 当前套餐存在更低限制，应以后端实际 API 返回为准，并在前端给出友好提示。

#### 验收标准

- 用户点击上传区后可以选择本地图片
- 用户拖拽图片到上传区后可以触发上传
- 上传非图片文件时显示错误提示
- 上传超出大小限制的图片时显示错误提示
- 重新上传图片时可以替换当前图片

### 5.2 图片处理

#### 功能描述

前端将用户图片通过 `FormData` 提交到后端接口，后端在内存中读取文件，并转发给 Remove.bg API。

#### 接口流程

```text
Browser
  -> POST /api/remove-bg
  -> Cloudflare Worker / Pages Function
  -> POST https://api.remove.bg/v1.0/removebg
  -> Return PNG
  -> Browser Preview + Download
```

#### 验收标准

- 用户上传图片后自动开始处理
- 处理过程中显示加载状态
- 处理成功后展示透明背景 PNG
- 处理失败时显示明确提示
- API Key 不出现在前端代码或浏览器网络请求中
- 服务端不持久化保存用户图片

### 5.3 结果预览

#### 功能描述

处理完成后，页面展示原图和去背景结果图。结果图应使用棋盘格背景，以便用户识别透明区域。

#### MVP 预览模式

- 原图预览
- 去背景结果预览

#### 可选增强

- Before / After 对比滑杆
- 白色背景预览
- 深色背景预览
- 纯色背景预览

#### 验收标准

- 原图和结果图都能清晰展示
- 透明区域能被用户识别
- 移动端不会出现布局溢出
- 图片加载失败时有兜底提示

### 5.4 下载图片

#### 功能描述

用户可以下载处理后的透明背景 PNG。

#### 文件命名

建议命名规则：

```text
removed-background-{timestamp}.png
```

#### 验收标准

- 处理成功后显示下载按钮
- 点击下载按钮后下载 PNG 文件
- 下载文件可以在本地正常打开
- 下载前无需注册或登录

### 5.5 错误处理

#### 错误类型

- 未选择文件
- 文件格式不支持
- 文件过大
- Remove.bg API 请求失败
- Remove.bg API Key 未配置
- Remove.bg API 额度不足
- 网络超时
- 服务器异常

#### 提示原则

错误信息应清楚、短句、可行动。

示例：

- `Please upload a JPG, PNG, or WebP image.`
- `The image is too large. Please upload an image under 10 MB.`
- `Background removal failed. Please try another image.`
- `Service is temporarily unavailable. Please try again later.`

MVP 网站主语言可以先使用英文页面文案，以匹配关键词 `image background remover`。后台需求文档和开发沟通使用中文。

## 6. 非功能需求

### 6.1 性能

- 首屏工具区应尽快可交互
- 上传后应立即显示本地原图预览
- 处理状态应在 300 ms 内反馈
- 正常图片处理时间目标：3 到 10 秒
- 前端不应阻塞主线程处理大图

### 6.2 隐私

- 网站不保存用户上传图片
- 图片仅在当前请求中转发给 Remove.bg API
- 响应头设置 `Cache-Control: no-store`
- 页面应展示简短隐私说明
- 不应在日志中记录图片内容、Base64、文件二进制或可访问图片地址

### 6.3 安全

- Remove.bg API Key 只能保存在 Cloudflare 环境变量
- 前端不得暴露 API Key
- 后端需要校验文件类型和大小
- 后端需要限制请求方法，只接受 `POST`
- 后端需要返回合理错误码
- 可加入基础频率限制，防止 API 额度被刷

### 6.4 兼容性

- 支持主流桌面浏览器：Chrome、Safari、Edge、Firefox
- 支持主流移动浏览器：iOS Safari、Android Chrome
- 上传、预览、下载流程在移动端可用

## 7. 接口需求

### 7.1 去背景接口

#### Endpoint

```http
POST /api/remove-bg
```

#### Request

Content-Type:

```http
multipart/form-data
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| image | File | 是 | 用户上传的图片 |

#### Response: 成功

```http
200 OK
Content-Type: image/png
Cache-Control: no-store
```

Body 为 PNG 二进制。

#### Response: 失败

```json
{
  "error": "Background removal failed. Please try again."
}
```

#### 状态码建议

| 状态码 | 场景 |
| --- | --- |
| 400 | 参数错误、未上传图片、格式不支持 |
| 413 | 文件过大 |
| 429 | 请求过于频繁或 API 额度受限 |
| 502 | Remove.bg API 请求失败 |
| 500 | 服务端未知错误 |

### 7.2 Remove.bg API 调用

#### Endpoint

```http
POST https://api.remove.bg/v1.0/removebg
```

#### Headers

```http
X-Api-Key: {REMOVE_BG_API_KEY}
```

#### Body

```text
image_file: File
size: auto
```

MVP 阶段不暴露复杂参数，统一使用 `size=auto`。

## 8. 前端交互需求

### 8.1 初始状态

页面展示：

- 产品名称
- 简短价值说明
- 上传区
- 支持格式提示
- 隐私提示

建议英文文案：

```text
Remove Image Background Online
Upload an image and get a transparent PNG in seconds.
```

### 8.2 上传后状态

页面展示：

- 原图预览
- 处理中状态
- 禁用重复提交按钮
- 可取消或重新选择图片

### 8.3 成功状态

页面展示：

- 原图
- 去背景结果图
- 下载 PNG 按钮
- 再处理一张图片按钮

### 8.4 失败状态

页面展示：

- 错误提示
- 重新上传按钮
- 保留原图预览

## 9. SEO 需求

### 9.1 页面标题

```text
Image Background Remover - Remove Background Online
```

### 9.2 Meta Description

```text
Remove image backgrounds online and download a transparent PNG in seconds. Upload a JPG, PNG, or WebP image and erase the background automatically.
```

### 9.3 H1

```text
Image Background Remover
```

### 9.4 页面关键词

- image background remover
- remove background from image
- background remover
- transparent background maker
- remove image background online
- PNG background remover

### 9.5 FAQ 建议

- Is this image background remover free?
- Do you store my uploaded images?
- What image formats are supported?
- Can I download a transparent PNG?
- Does it work for product photos?

## 10. 数据指标

MVP 阶段建议追踪匿名事件，不记录图片内容。

### 10.1 核心指标

- 页面访问量
- 上传点击率
- 上传成功率
- 去背景成功率
- 下载率
- API 失败率
- 平均处理耗时

### 10.2 事件建议

| 事件名 | 触发时机 |
| --- | --- |
| page_view | 用户访问页面 |
| upload_started | 用户选择图片 |
| upload_rejected | 文件校验失败 |
| remove_started | 开始请求去背景 |
| remove_succeeded | 去背景成功 |
| remove_failed | 去背景失败 |
| download_clicked | 用户点击下载 |

## 11. Cloudflare 部署需求

### 11.1 环境变量

Cloudflare 中需要配置：

```text
REMOVE_BG_API_KEY
```

### 11.2 部署建议

- 使用 Cloudflare Pages 托管前端
- 使用 Pages Functions 实现 `/api/remove-bg`
- 如后续需要更强控制，可迁移到独立 Cloudflare Worker
- 不需要 R2、D1、KV 等存储服务

### 11.3 缓存策略

- HTML、CSS、JS 可以正常缓存
- `/api/remove-bg` 必须设置 `Cache-Control: no-store`
- 图片处理结果不应被 Cloudflare 缓存

## 12. 风险与限制

### 12.1 API 成本风险

Remove.bg API 按调用或图片消耗计费，公开免费工具可能快速消耗额度。

建议 MVP 加入：

- 单 IP 简单频率限制
- 文件大小限制
- 请求失败监控
- 每日调用量告警

### 12.2 滥用风险

用户可能通过脚本批量调用接口。

建议后续加入：

- Turnstile
- 请求速率限制
- 免费次数限制
- 登录后使用高清或批量功能

### 12.3 Cloudflare 请求限制

Cloudflare Workers / Pages Functions 对请求体大小、执行时间、内存有平台限制。MVP 应限制上传图片大小，并避免在 Worker 中做复杂图像计算。

### 12.4 第三方服务依赖

Remove.bg API 故障、额度不足或响应变慢会直接影响网站体验。前端需要清楚提示失败，并允许用户重试。

## 13. MVP 验收清单

- 用户可以打开首页并看到上传工具
- 用户可以上传 JPG、PNG、WebP 图片
- 非图片文件会被拒绝
- 超过大小限制的图片会被拒绝
- 上传后能立即看到原图预览
- 系统能调用 Remove.bg API 完成背景移除
- 成功后能看到透明背景结果图
- 用户可以下载 PNG 文件
- API Key 不暴露在浏览器端
- 图片不写入数据库、对象存储或本地磁盘
- `/api/remove-bg` 返回 `Cache-Control: no-store`
- 移动端上传、预览、下载流程可用
- 页面具备基础 SEO 标题和描述
- 部署到 Cloudflare 后可正常使用

## 14. 建议开发里程碑

### Milestone 1: 项目初始化

- 创建前端项目
- 配置 Cloudflare Pages
- 创建 `/api/remove-bg`
- 配置环境变量读取

### Milestone 2: 核心链路

- 实现图片上传
- 实现本地原图预览
- 实现后端转发 Remove.bg API
- 实现结果图返回和预览
- 实现 PNG 下载

### Milestone 3: 体验完善

- 增加拖拽上传
- 增加错误提示
- 增加加载状态
- 增加移动端样式
- 增加隐私说明

### Milestone 4: 上线验证

- 配置生产环境变量
- 部署 Cloudflare Pages
- 验证 API 调用
- 测试不同格式和尺寸图片
- 添加基础统计
- 检查 SEO 元信息

## 15. MVP 成功标准

MVP 上线后，如果满足以下条件，可进入下一阶段：

- 用户从首页可以在 30 秒内完成一次去背景并下载
- 去背景成功率稳定在 95% 以上
- 下载率达到上传用户的 60% 以上
- API 成本在可接受范围内
- 有自然搜索或投放流量进入并产生真实使用

## 16. 下一阶段建议

如果 MVP 数据验证良好，优先开发：

1. 白底商品图功能
2. 批量处理
3. 自定义背景颜色
4. Turnstile 防滥用
5. 免费额度和付费下载
6. SEO 长尾页面

