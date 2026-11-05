# 夸克网盘 AI 工具服务 - 调用指南

## 服务信息

- **地址**: `http://localhost:3456`
- **端口**: 3456
- **启动**: `npm run dev`

## 前置条件

1. 启动服务后，如果未登录，需要打开浏览器访问 `http://localhost:3456` 扫码登录
2. 登录后 Cookie 自动保存到 `.quark_cookies.json`，重启服务无需重新登录
3. 检查登录状态：`curl http://localhost:3456/api/auth/status`

## 完整 API 参考

### 1. 登录状态检查

```bash
curl http://localhost:3456/api/auth/status
```

**响应示例（已登录）：**
```json
{ "success": true, "data": { "logged_in": true } }
```

**响应示例（未登录）：**
```json
{
  "success": true,
  "data": {
    "logged_in": false,
    "qrcode_url": "http://localhost:3456/api/auth/qrcode"
  }
}
```

### 2. 列出文件

```bash
# 根目录
curl "http://localhost:3456/api/files?parent_id=0"

# 指定目录
curl "http://localhost:3456/api/files?parent_id=abc123"

# 分页
curl "http://localhost:3456/api/files?parent_id=0&page=1&size=20"
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "fid": "abc123",
        "file_name": "文档",
        "file_type": "folder",
        "size": 0,
        "updated_at": 1700000000000,
        "thumbnail_url": ""
      },
      {
        "fid": "def456",
        "file_name": "photo.jpg",
        "file_type": "file",
        "size": 1048576,
        "updated_at": 1700000000000,
        "category": "image"
      }
    ],
    "total": 100,
    "page": 1,
    "size": 20
  }
}
```

### 3. 新建文件夹

```bash
curl -X POST http://localhost:3456/api/files/mkdir \
  -H "Content-Type: application/json" \
  -d '{"parent_id": "0", "name": "新建文件夹"}'
```

### 4. 重命名文件

```bash
curl -X POST http://localhost:3456/api/files/rename \
  -H "Content-Type: application/json" \
  -d '{"file_id": "abc123", "new_name": "新名称.txt"}'
```

### 5. 删除文件

```bash
curl -X POST http://localhost:3456/api/files/delete \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["abc123", "def456"]}'
```

### 6. 移动文件

```bash
curl -X POST http://localhost:3456/api/files/move \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["abc123"], "target_parent_id": "xyz789"}'
```

### 7. 预览文件

```bash
curl http://localhost:3456/api/files/preview/abc123
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "type": "image",
    "url": "https://example.com/preview.jpg",
    "file_name": "photo.jpg",
    "size": 1048576
  }
}
```

`type` 可能的值：`image`、`video`、`text`、`audio`、`pdf`、`unknown`

### 8. 上传文件

```bash
# 上传文件，返回 taskId
curl -X POST http://localhost:3456/api/upload \
  -F "file=@/path/to/local/file.mp4" \
  -F "parent_id=0"

# 响应
# { "success": true, "data": { "taskId": "upload_xxx", "file_name": "file.mp4", "size": 10485760 } }
```

**查看上传进度（SSE）：**
```bash
curl -N http://localhost:3456/api/upload/progress/upload_xxx
```

**SSE 事件流：**
```
event: progress
data: {"uploaded":5242880,"total":10485760,"percent":50,"speed":"2.3 MB/s"}

event: complete
data: {"fid":"abc123","file_name":"file.mp4"}
```

### 9. 下载文件

```bash
# 下载文件（SSE 进度推送）
curl -N http://localhost:3456/api/download/abc123

# 指定保存路径
curl -N "http://localhost:3456/api/download/abc123?save_path=/custom/path/file.mp4"
```

**SSE 事件流：**
```
event: progress
data: {"downloaded":5242880,"total":10485760,"percent":50,"speed":"5.1 MB/s"}

event: complete
data: {"local_path":"/workspace/downloads/file.mp4","size":10485760}
```

### 10. 登出

```bash
curl -X POST http://localhost:3456/api/auth/logout
```

## 错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `NOT_LOGGED_IN` | 未登录 | 提示用户打开浏览器扫码登录 |
| `COOKIE_EXPIRED` | Cookie 过期 | 提示用户重新扫码 |
| `FILE_NOT_FOUND` | 文件不存在 | 检查 file_id 是否正确 |
| `UPLOAD_FAILED` | 上传失败 | 检查网络和文件大小 |
| `DOWNLOAD_FAILED` | 下载失败 | 检查 file_id 和网络 |
| `QUARK_API_ERROR` | 夸克 API 错误 | 查看 error 字段详情 |
| `NO_FILE` | 未上传文件 | 检查 multipart form 是否包含 file 字段 |
| `INVALID_PARAMS` | 参数错误 | 检查请求参数 |

## AI 调用典型场景

### 场景 1：检查服务是否可用

```bash
curl -s http://localhost:3456/api/auth/status
# 如果 logged_in: false，提示用户："请打开浏览器访问 http://localhost:3456 扫码登录夸克网盘"
# 如果 logged_in: true，可以继续操作
```

### 场景 2：浏览用户网盘文件

```bash
# 1. 先看根目录
curl -s "http://localhost:3456/api/files?parent_id=0"

# 2. 用户说"打开文档目录"，找到 fid 后
curl -s "http://localhost:3456/api/files?parent_id=找到的fid"
```

### 场景 3：用户要上传文件

```bash
# 1. 上传
curl -s -X POST http://localhost:3456/api/upload \
  -F "file=@/path/to/file" \
  -F "parent_id=0"
# 返回 → {"success":true,"data":{"taskId":"upload_xxx","file_name":"file.mp4","size":10485760}}

# 2. 查看进度
curl -N http://localhost:3456/api/upload/progress/upload_xxx
```

### 场景 4：用户要下载文件

```bash
# 从文件列表中找到 file_id，然后下载
curl -N http://localhost:3456/api/download/abc123
# SSE 流会推送进度，完成后返回本地路径
```

### 场景 5：用户要预览文件

```bash
curl -s http://localhost:3456/api/files/preview/abc123
# 返回 type 和 url/content，根据 type 决定如何展示
```