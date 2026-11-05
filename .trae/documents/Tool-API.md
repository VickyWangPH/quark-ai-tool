# 夸克网盘 AI 工具 - REST API 接口文档

## 概述

本工具在夸克网盘 API 之上封装了一层 RESTful 接口，供 AI Agent 调用。服务运行在 `http://localhost:3456`，所有接口返回统一 JSON 格式。

### 统一响应格式

```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "error": "错误描述", "code": "ERROR_CODE" }
```

### 错误码

| code | 说明 |
|------|------|
| `NOT_LOGGED_IN` | 未登录，需打开浏览器扫码 |
| `COOKIE_EXPIRED` | Cookie 已过期，需重新登录 |
| `INVALID_PARAMS` | 参数不合法 |
| `NO_FILE` | 未找到上传文件 |
| `QUARK_API_ERROR` | 夸克 API 返回错误 |
| `DOWNLOAD_FAILED` | 下载失败 |
| `GEN_QRCODE_FAILED` | 生成二维码失败 |

---

## 1. 认证接口

### 1.1 检查登录状态

```
GET /api/auth/status
```

**响应（已登录）**：

```json
{
  "success": true,
  "data": { "logged_in": true }
}
```

**响应（未登录）**：

```json
{
  "success": true,
  "data": {
    "logged_in": false,
    "qrcode_url": "http://localhost:3456/api/auth/qrcode"
  }
}
```

### 1.2 获取登录二维码

```
GET /api/auth/qrcode
```

返回 HTML 页面，展示夸克网盘登录二维码，使用夸克 APP 扫码即可登录。页面自动轮询扫码状态，登录成功后自动跳转。

### 1.3 轮询扫码状态

```
GET /api/auth/poll?token=<token>
```

**参数**：

| 参数 | 说明 |
|------|------|
| `token` | 从 qrcode 页面获取的 token |

**响应**：

```json
// 等待扫码
{ "status": "pending" }

// 扫码成功
{ "status": "success" }

// 二维码过期
{ "status": "expired" }
```

### 1.4 登出

```
POST /api/auth/logout
```

**响应**：

```json
{
  "success": true,
  "data": { "message": "已登出" }
}
```

---

## 2. 文件管理接口

### 2.1 列出文件

```
GET /api/files?parent_id=<fid>&page=<page>&size=<size>
```

**参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `parent_id` | string | `"0"` | 父目录 fid，根目录为 `"0"` |
| `page` | int | `1` | 页码 |
| `size` | int | `50` | 每页数量 |

**响应**：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "fid": "文件唯一ID",
        "file_name": "文件名",
        "file_type": "file",
        "size": 12345,
        "updated_at": 1781676497523,
        "thumbnail_url": "",
        "category": 4,
        "file_extension": "txt"
      }
    ],
    "total": 100,
    "page": 1,
    "size": 50
  }
}
```

**file_type 取值**：`"file"` = 文件，`"folder"` = 文件夹。

### 2.2 新建文件夹

```
POST /api/files/mkdir
Content-Type: application/json

{
  "parent_id": "父目录ID",
  "name": "文件夹名称"
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "fid": "新文件夹ID",
    "file_name": "文件夹名称",
    "file_type": "folder",
    "size": 0,
    "updated_at": 1781676497523
  }
}
```

### 2.3 重命名

```
POST /api/files/rename
Content-Type: application/json

{
  "file_id": "文件ID",
  "new_name": "新名称"
}
```

**响应**：

```json
{
  "success": true,
  "data": { "message": "重命名成功" }
}
```

### 2.4 删除文件

```
POST /api/files/delete
Content-Type: application/json

{
  "file_ids": ["fid1", "fid2"]
}
```

**响应**：

```json
{
  "success": true,
  "data": { "message": "删除成功" }
}
```

### 2.5 移动文件

```
POST /api/files/move
Content-Type: application/json

{
  "file_ids": ["fid1", "fid2"],
  "target_parent_id": "目标父目录ID"
}
```

**响应**：

```json
{
  "success": true,
  "data": { "message": "移动成功" }
}
```

### 2.6 获取文件预览

```
GET /api/files/preview/:fileId
```

**响应**：

```json
{
  "success": true,
  "data": {
    "type": "text",
    "url": "下载链接",
    "file_name": "文件名",
    "size": 12345
  }
}
```

**type 取值**：`"image"` | `"video"` | `"text"` | `"audio"` | `"pdf"` | `"unknown"`。

---

## 3. 上传接口

### 3.1 上传文件

```
POST /api/upload
Content-Type: multipart/form-data

字段:
  file: <文件二进制>
  parent_id: "父目录ID"（可选，默认根目录）
```

**响应**：

```json
{
  "success": true,
  "data": {
    "taskId": "upload_1781676496000_abc123",
    "file_name": "test.txt",
    "size": 12345
  }
}
```

### 3.2 监听上传进度（SSE）

```
GET /api/upload/progress/:taskId
```

这是一个 SSE（Server-Sent Events）流式接口，持续推送上传进度。

**SSE 事件类型**：

| 事件 | 数据格式 | 说明 |
|------|----------|------|
| `progress` | `{"uploaded": 8192, "total": 12345, "percent": 66, "speed": "1.2 MB/s"}` | 上传进度 |
| `complete` | `{"fid": "xxx", "file_name": "test.txt"}` | 上传完成 |
| `error` | `{"error": "错误信息"}` | 上传失败 |

---

## 4. 下载接口

### 4.1 下载文件（SSE 进度推送）

```
GET /api/download/:fileId?save_path=<可选保存路径>
```

这也是一个 SSE 流式接口，推送下载进度。

**SSE 事件类型**：

| 事件 | 数据格式 | 说明 |
|------|----------|------|
| `progress` | `{"downloaded": 8192, "total": 12345, "percent": 66, "speed": "1.2 MB/s"}` | 下载进度 |
| `complete` | `{"local_path": "./downloads/test.txt", "size": 12345}` | 下载完成 |
| `error` | `{"error": "错误信息"}` | 下载失败 |

文件默认下载到 `./downloads/` 目录。

---

## 5. Cookie 存储说明

Cookie 保存在项目根目录的 `.quark_cookies.json` 文件中：

```json
{
  "cookies": "key1=value1; key2=value2; ...",
  "updated_at": 1781676497523
}
```

- 登录成功后自动保存
- 重启服务自动加载
- 调用 `/api/auth/logout` 或删除文件可清除
- Cookie 过期后需要重新扫码登录

---

## 6. AI 调用示例

### 典型工作流

#### 1. 检查登录状态

```bash
curl -s http://localhost:3456/api/auth/status
```

如果 `logged_in` 为 `false`，需要通知用户打开浏览器访问 `http://localhost:3456` 扫码登录。

#### 2. 浏览文件列表

```bash
# 查看根目录
curl -s "http://localhost:3456/api/files?parent_id=0"

# 进入子目录
curl -s "http://localhost:3456/api/files?parent_id=abc123"

# 分页浏览
curl -s "http://localhost:3456/api/files?parent_id=0&page=2&size=20"
```

#### 3. 创建文件夹

```bash
curl -s -X POST http://localhost:3456/api/files/mkdir \
  -H "Content-Type: application/json" \
  -d '{"parent_id": "0", "name": "新建文件夹"}'
```

#### 4. 上传文件

```bash
# 步骤 1：上传文件
TASK_ID=$(curl -s -X POST http://localhost:3456/api/upload \
  -F "file=@./document.pdf" \
  -F "parent_id=0" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['taskId'])")

# 步骤 2：轮询进度
while true; do
  STATUS=$(curl -s "http://localhost:3456/api/upload/progress/$TASK_ID" | grep "event: complete")
  if [ -n "$STATUS" ]; then
    echo "上传完成"
    break
  fi
  sleep 2
done
```

#### 5. 下载文件

```bash
# 步骤 1：获取文件列表，找到目标 fid
curl -s "http://localhost:3456/api/files?parent_id=0"

# 步骤 2：下载文件
curl -N "http://localhost:3456/api/download/fid123" 2>&1 | while read line; do
  echo "$line"
done
```

#### 6. 文件管理操作

```bash
# 重命名
curl -s -X POST http://localhost:3456/api/files/rename \
  -H "Content-Type: application/json" \
  -d '{"file_id": "fid123", "new_name": "新名称.txt"}'

# 移动
curl -s -X POST http://localhost:3456/api/files/move \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["fid123"], "target_parent_id": "parent_fid"}'

# 删除
curl -s -X POST http://localhost:3456/api/files/delete \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["fid123", "fid456"]}'
```

### TypeScript/JavaScript 示例

```typescript
const BASE = 'http://localhost:3456';

async function apiCall(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  return res.json();
}

// 检查登录
const status = await apiCall('/api/auth/status');
if (!status.data.logged_in) {
  console.log('请打开浏览器访问 http://localhost:3456 扫码登录');
}

// 列出文件
const files = await apiCall('/api/files?parent_id=0');
for (const f of files.data.list) {
  console.log(`[${f.file_type}] ${f.file_name} (${f.size} bytes, fid: ${f.fid})`);
}

// 创建文件夹
const result = await apiCall('/api/files/mkdir', {
  method: 'POST',
  body: JSON.stringify({ parent_id: '0', name: '新文件夹' }),
});
console.log('新文件夹 fid:', result.data.fid);

// 上传文件（使用 FormData）
const form = new FormData();
form.append('file', fileBlob);
form.append('parent_id', '0');
const uploadRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
const { data } = await uploadRes.json();
console.log('上传任务 ID:', data.taskId);

// 监听上传进度
const eventSource = new EventSource(`${BASE}/api/upload/progress/${data.taskId}`);
eventSource.addEventListener('progress', (e) => {
  const p = JSON.parse(e.data);
  console.log(`上传进度: ${p.percent}% (${p.speed})`);
});
eventSource.addEventListener('complete', (e) => {
  const result = JSON.parse(e.data);
  console.log('上传完成:', result);
  eventSource.close();
});
```

### Python 示例

```python
import requests
import json
import time

BASE = "http://localhost:3456"

def api_call(path, method="GET", data=None, files=None):
    url = f"{BASE}{path}"
    if method == "GET":
        return requests.get(url).json()
    elif files:
        return requests.post(url, files=files, data=data).json()
    else:
        return requests.post(url, json=data).json()

# 检查登录
status = api_call("/api/auth/status")
print("已登录:", status["data"]["logged_in"])

# 列出文件
files = api_call("/api/files?parent_id=0")
for f in files["data"]["list"]:
    print(f"[{f['file_type']}] {f['file_name']} ({f['size']} bytes)")

# 上传文件
with open("./test.txt", "rb") as f:
    result = api_call("/api/upload", method="POST",
                      files={"file": f},
                      data={"parent_id": "0"})
task_id = result["data"]["taskId"]

# 轮询上传进度
while True:
    resp = requests.get(f"{BASE}/api/upload/progress/{task_id}", stream=True)
    for line in resp.iter_lines(decode_unicode=True):
        if line.startswith("data:"):
            event_data = json.loads(line[5:].strip())
            if "percent" in event_data:
                print(f"进度: {event_data['percent']}%")
    time.sleep(2)
```

---

## 7. 接口总览

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 检查登录状态 | GET | `/api/auth/status` | 返回登录状态 |
| 获取登录二维码 | GET | `/api/auth/qrcode` | HTML 页面，扫码登录 |
| 轮询扫码状态 | GET | `/api/auth/poll` | 轮询扫码结果 |
| 登出 | POST | `/api/auth/logout` | 清除 Cookie |
| 列出文件 | GET | `/api/files` | 分页浏览文件列表 |
| 新建文件夹 | POST | `/api/files/mkdir` | 创建文件夹 |
| 重命名 | POST | `/api/files/rename` | 重命名文件/文件夹 |
| 删除 | POST | `/api/files/delete` | 删除文件/文件夹 |
| 移动 | POST | `/api/files/move` | 移动文件/文件夹 |
| 文件预览 | GET | `/api/files/preview/:fid` | 获取预览信息 |
| 上传文件 | POST | `/api/upload` | multipart/form-data |
| 上传进度 | GET | `/api/upload/progress/:taskId` | SSE 流 |
| 下载文件 | GET | `/api/download/:fid` | SSE 流 |