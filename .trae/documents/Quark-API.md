# 夸克网盘内部 API 参考（逆向工程）

## 概述

夸克网盘 PC 端 API 基础地址为 `https://drive-pc.quark.cn/1/clouddrive`，所有请求需携带 Cookie 鉴权。通用请求参数包括 `pr=ucpro&fr=pc&uc_param_str=`。

### 通用请求头

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
Referer: https://pan.quark.cn/
Content-Type: application/json
Cookie: <登录后获取的 Cookie>
```

> **注意**：登录认证接口需使用专用 UA：
> `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch`

### 通用响应格式

```json
{
  "status": 200,
  "code": 0,
  "message": "success",
  "data": { ... },
  "metadata": { ... },
  "timestamp": 1234567890
}
```

- `status`: HTTP 状态码，200 表示成功
- `code`: 业务状态码，0 表示成功
- `data`: 响应数据
- `metadata`: 元数据（如分页信息、分片配置等）

---

## 1. 登录认证

夸克网盘使用二维码扫码登录，涉及三个步骤：获取 token → 轮询扫码状态 → 换取 Cookie。

### 1.1 获取二维码 Token

```
GET https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin?client_id=532&v=1.2&request_id=<uuid>

Headers:
  User-Agent: <quark-cloud-drive 专用 UA>
```

**说明**：此接口必须使用 `quark-cloud-drive` 专用 UA，且为 **GET** 请求（非 POST）。

**参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `client_id` | `532` | 客户端 ID，固定值 |
| `v` | `1.2` | API 版本 |
| `request_id` | UUID v4 | 每次请求生成唯一 ID |

**响应示例**：

```json
{
  "status": 2000000,
  "data": {
    "members": {
      "token": "xxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

**二维码生成**：拿到 token 后，构造 deep link URL：

```
https://su.quark.cn/4_eMHBJ?token=<token>&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=S:custom|OPT:SAREA@0|OPT:IMMERSIVE@1|OPT:BACK_BTN_STYLE@0
```

访问此 URL 会 302 重定向到 `b.quark.cn/...` 格式的 deep link，使用重定向后的 URL 生成二维码即可（避免重定向消耗 token 有效期）。

### 1.2 轮询扫码状态

```
GET https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken?client_id=532&v=1.2&token=<token>&request_id=<uuid>

Headers:
  User-Agent: <quark-cloud-drive 专用 UA>
```

**参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `client_id` | `532` | 固定值 |
| `v` | `1.2` | API 版本 |
| `token` | string | 上一步获取的 token |
| `request_id` | UUID v4 | 请求唯一 ID |

**响应状态码**：

| status | 含义 |
|--------|------|
| `2000000` | 扫码成功，`data.members.service_ticket` 包含 ticket |
| `50004001` | 等待扫码中 |
| `50004002` | 二维码已过期 |

**成功响应示例**：

```json
{
  "status": 2000000,
  "data": {
    "members": {
      "service_ticket": "ST-xxxxxx"
    }
  }
}
```

### 1.3 换取 Cookie

扫码成功后，用 `service_ticket` 分两步获取完整 Cookie。

**步骤 1**：访问账号信息接口

```
GET https://pan.quark.cn/account/info?st=<service_ticket>&lw=scan

Headers:
  User-Agent: <quark-cloud-drive 专用 UA>
```

从响应 `Set-Cookie` 头中提取 Cookie（通常包含 `__pus` 等关键字段）。

**步骤 2**：访问 drive 配置接口

```
GET https://drive-pc.quark.cn/1/clouddrive/config?pr=ucpro&fr=pc&uc_param_str=

Headers:
  User-Agent: <quark-cloud-drive 专用 UA>
  Referer: https://pan.quark.cn
  Cookie: <步骤1获取的Cookie>
```

从响应 `Set-Cookie` 头中提取额外 Cookie（如 `__puus`），合并两步的 Cookie 即为最终可用的鉴权 Cookie。

---

## 2. 文件管理

### 2.1 获取文件列表

```
GET https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid=<parent_id>&_page=1&_size=50&_sort=file_type:asc,updated_at:desc
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `pdir_fid` | string | 父目录 fid，根目录为 `"0"` |
| `_page` | int | 页码，从 1 开始 |
| `_size` | int | 每页数量，默认 50 |
| `_sort` | string | 排序规则，格式 `字段:asc/desc` |
| `_fetch_total` | string | 设为 `"1"` 返回总数 |

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "list": [
      {
        "fid": "文件唯一ID",
        "file_name": "文件名",
        "pdir_fid": "父目录ID",
        "size": 12345,
        "file": true,
        "dir": false,
        "category": 4,
        "format_type": "text/plain",
        "file_extension": "txt",
        "updated_at": 1781676497523,
        "created_at": 1781676497523,
        "thumbnail_url": ""
      }
    ],
    "total": 100,
    "_page": 1,
    "_size": 50,
    "_count": 50
  },
  "metadata": {
    "_total": 100,
    "_count": 50,
    "_page": 1
  }
}
```

**关键字段说明**：

| 字段 | 说明 |
|------|------|
| `fid` | 文件/文件夹唯一标识 |
| `file` | 是否为文件（true=文件, false=文件夹） |
| `dir` | 是否为文件夹（true=文件夹, false=文件） |
| `category` | 文件分类：0=文件夹, 1=视频, 2=音频, 3=图片, 4=文档, 5=压缩包, 6=其他 |
| `size` | 文件大小（字节），文件夹为 0 |
| `format_type` | MIME 类型 |

### 2.2 新建文件夹

```
POST https://drive-pc.quark.cn/1/clouddrive/file?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "pdir_fid": "父目录ID",
  "file_name": "文件夹名称",
  "dir": true,
  "dir_init_lock": false
}
```

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "fid": "新文件夹ID",
    "task_id": "任务ID（可能为空）"
  }
}
```

如果返回 `task_id`，需要轮询任务状态确认操作完成（见 [5. 任务轮询](#5-任务轮询)）。

### 2.3 重命名

```
POST https://drive-pc.quark.cn/1/clouddrive/file/rename?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "fid": "文件ID",
  "file_name": "新名称"
}
```

### 2.4 删除文件

```
POST https://drive-pc.quark.cn/1/clouddrive/file/delete?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "filelist": ["fid1", "fid2"],
  "action_type": 2
}
```

**参数**：

| 参数 | 说明 |
|------|------|
| `filelist` | 要删除的文件 fid 列表 |
| `action_type` | 删除类型：`1`=彻底删除, `2`=移到回收站 |

### 2.5 移动文件

```
POST https://drive-pc.quark.cn/1/clouddrive/file/move?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "fid_list": ["fid1", "fid2"],
  "to_pdir_fid": "目标父目录ID"
}
```

### 2.6 获取文件信息

```
GET https://drive-pc.quark.cn/1/clouddrive/file/info?pr=ucpro&fr=pc&uc_param_str=&fid=<file_id>
```

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "fid": "文件ID",
    "file_name": "文件名",
    "size": 12345,
    "category": 4,
    "format_type": "text/plain",
    "download_url": "下载链接（可能为空）"
  }
}
```

### 2.7 获取下载链接

```
POST https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "fid": "文件ID"
}
```

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "fid": "文件ID",
    "file_name": "文件名",
    "size": 12345,
    "download_url": "https://...（临时下载链接）"
  }
}
```

下载链接需携带 Cookie 才能访问，且有时效性。

---

## 3. 文件上传（OSS 分片上传）

夸克网盘后端使用阿里云 OSS 作为存储，上传流程为标准的 OSS 分片上传，共 5 个步骤。

### 3.1 预上传（获取上传会话）

```
POST https://drive-pc.quark.cn/1/clouddrive/file/upload/pre?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "file_name": "文件名",
  "size": 12345,
  "pdir_fid": "父目录ID（根目录为0）",
  "format_type": "application/octet-stream",
  "ccp_hash_update": true,
  "l_created_at": 1781676496000,
  "l_updated_at": 1781676496000,
  "parallel_upload": true,
  "dir_name": ""
}
```

**参数说明**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_name` | string | 文件名 |
| `size` | int | 文件大小（字节） |
| `pdir_fid` | string | 父目录 fid |
| `format_type` | string | 文件 MIME 类型 |
| `ccp_hash_update` | bool | 是否启用 hash 更新，固定 `true` |
| `l_created_at` | int | 文件创建时间，毫秒时间戳 |
| `l_updated_at` | int | 文件修改时间，毫秒时间戳 |
| `parallel_upload` | bool | 是否并行上传，固定 `true` |
| `dir_name` | string | 固定空字符串 `""` |

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "finish": false,
    "task_id": "上传任务ID",
    "upload_id": "OSS UploadId",
    "auth_info": "OSS认证信息字符串",
    "upload_url": "https://cn-hangzhou.oss-cn-hangzhou.aliyuncs.com",
    "obj_key": "OSS对象Key",
    "fid": "文件ID（已分配）",
    "bucket": "OSS Bucket名称",
    "format_type": "application/octet-stream",
    "callback": {
      "callbackUrl": "回调URL",
      "callbackBody": "回调Body"
    }
  },
  "metadata": {
    "part_size": 10485760,
    "part_thread": 5
  }
}
```

**关键响应字段**：

| 字段 | 说明 |
|------|------|
| `finish` | 是否秒传完成。若为 `true`，文件已存在于云端，无需上传 |
| `task_id` | 上传任务 ID，后续步骤需要 |
| `upload_id` | OSS 分片上传 ID |
| `auth_info` | OSS 认证信息，用于后续签名 |
| `upload_url` | OSS 上传域名（含 `https://` 前缀） |
| `obj_key` | OSS 对象 Key |
| `bucket` | OSS Bucket 名称 |
| `callback` | OSS 回调配置 |
| `part_size` | 分片大小（字节），默认约 10MB |

### 3.2 Hash 快传检查

```
POST https://drive-pc.quark.cn/1/clouddrive/file/update/hash?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "md5": "文件MD5十六进制小写",
  "sha1": "文件SHA1十六进制小写",
  "task_id": "任务ID"
}
```

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "finish": true
  }
}
```

如果 `finish` 为 `true`，说明文件已存在于云端（秒传），无需继续上传。

### 3.3 分片上传（每个分片独立执行）

对每个分片，先获取 OSS 鉴权 key，再 PUT 到 OSS。

#### 步骤 A：获取分片上传鉴权

```
POST https://drive-pc.quark.cn/1/clouddrive/file/upload/auth?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "auth_info": "<预上传返回的auth_info>",
  "auth_meta": "<OSS签名元数据字符串>",
  "task_id": "<任务ID>"
}
```

**`auth_meta` 格式**（OSS 签名规范，换行符 `\n` 分隔）：

```
PUT

<mime_type>
<utc_time>
x-oss-date:<utc_time>
x-oss-user-agent:aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit
/<bucket>/<obj_key>?partNumber=<n>&uploadId=<upload_id>
```

其中 `<utc_time>` 格式为 `new Date().toUTCString()`，即 `"Wed, 17 Jun 2026 12:00:00 GMT"`。

**各行含义**：

| 行 | 内容 | 说明 |
|----|------|------|
| 1 | `PUT` | HTTP 方法 |
| 2 | 空 | Content-MD5（PUT 请求为空） |
| 3 | `<mime_type>` | Content-Type |
| 4 | `<utc_time>` | Date |
| 5 | `x-oss-date:...` | OSS 自定义头 |
| 6 | `x-oss-user-agent:...` | OSS 自定义头 |
| 7 | `/<bucket>/<obj_key>?...` | 资源路径 |

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "auth_key": "OSS Authorization 头值"
  }
}
```

#### 步骤 B：PUT 分片到 OSS

```
PUT https://<bucket>.<upload_url_host>/<obj_key>?partNumber=<n>&uploadId=<upload_id>

Headers:
  Authorization: <auth_key>
  Content-Type: <mime_type>
  Referer: https://pan.quark.cn/
  x-oss-date: <utc_time>
  x-oss-user-agent: aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit

Body: <文件分片二进制数据>
```

**说明**：
- `upload_url_host` 是去掉 `https://` 前缀后的 `upload_url`
- 分片大小由 `metadata.part_size` 决定，最后一个分片可能小于此值
- 响应头 `ETag` 即为该分片的 ETag，需要保存用于后续提交
- 响应状态码 200 表示成功

### 3.4 提交分片上传（Complete Multipart Upload）

#### 步骤 A：获取提交鉴权

```
POST https://drive-pc.quark.cn/1/clouddrive/file/upload/auth?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "auth_info": "<预上传返回的auth_info>",
  "auth_meta": "<OSS签名元数据字符串>",
  "task_id": "<任务ID>"
}
```

**`auth_meta` 格式**：

```
POST
<content_md5_base64>
application/xml
<utc_time>
x-oss-callback:<callback_base64>
x-oss-date:<utc_time>
x-oss-user-agent:aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit
/<bucket>/<obj_key>?uploadId=<upload_id>
```

其中：
- `content_md5_base64`：XML body 的 MD5 哈希值，Base64 编码
- `callback_base64`：`callback` 对象的 JSON 序列化字符串，Base64 编码

#### 步骤 B：POST 提交到 OSS

```
POST https://<bucket>.<upload_url_host>/<obj_key>?uploadId=<upload_id>

Headers:
  Authorization: <auth_key>
  Content-MD5: <content_md5_base64>
  Content-Type: application/xml
  Referer: https://pan.quark.cn/
  x-oss-callback: <callback_base64>
  x-oss-date: <utc_time>
  x-oss-user-agent: aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit

Body (XML):
<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
  <Part>
    <PartNumber>1</PartNumber>
    <ETag>"abc123..."</ETag>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <ETag>"def456..."</ETag>
  </Part>
</CompleteMultipartUpload>
```

**说明**：XML body 中按分片编号列出所有分片的 ETag。ETag 需要保留引号。

### 3.5 完成上传

```
POST https://drive-pc.quark.cn/1/clouddrive/file/upload/finish?pr=ucpro&fr=pc&uc_param_str=

Body:
{
  "obj_key": "<OSS对象Key>",
  "task_id": "<任务ID>"
}
```

调用此接口后，建议等待 1-2 秒让服务端完成处理，文件即可在文件列表中显示。

---

## 4. 文件下载

### 4.1 获取下载链接

参见 [2.7 获取下载链接](#27-获取下载链接)。

### 4.2 下载文件内容

使用获取到的 `download_url`，携带 Cookie 发起 GET 请求即可下载文件内容。

```
GET <download_url>

Headers:
  Cookie: <夸克Cookie>
  User-Agent: <Chrome UA>
  Referer: https://pan.quark.cn/
```

响应为文件二进制流，支持 `Range` 请求实现断点续传。

---

## 5. 任务轮询

某些操作（创建文件夹、删除、移动、重命名、上传）会返回 `task_id`，需要轮询任务状态。

```
GET https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc&uc_param_str=&task_id=<task_id>&retry_index=<n>
```

**响应**：

```json
{
  "status": 200,
  "code": 0,
  "data": {
    "task_id": "任务ID",
    "status": 2,
    "message": ""
  }
}
```

**status 含义**：

| status | 含义 |
|--------|------|
| `1` | 进行中 |
| `2` | 成功 |
| `3` | 失败 |

建议轮询间隔 1 秒，最多 20 次。

---

## 附录：API 总览

| 接口 | 方法 | 地址 |
|------|------|------|
| 获取二维码 Token | GET | `https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin` |
| 轮询扫码状态 | GET | `https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken` |
| 换取 Cookie（步骤1） | GET | `https://pan.quark.cn/account/info?st=...&lw=scan` |
| 换取 Cookie（步骤2） | GET | `https://drive-pc.quark.cn/1/clouddrive/config` |
| 获取文件列表 | GET | `https://drive-pc.quark.cn/1/clouddrive/file/sort` |
| 新建文件夹 | POST | `https://drive-pc.quark.cn/1/clouddrive/file` |
| 重命名 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/rename` |
| 删除 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/delete` |
| 移动 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/move` |
| 获取文件信息 | GET | `https://drive-pc.quark.cn/1/clouddrive/file/info` |
| 获取下载链接 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/download` |
| 预上传 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/upload/pre` |
| Hash 快传检查 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/update/hash` |
| 获取上传鉴权 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/upload/auth` |
| 完成上传 | POST | `https://drive-pc.quark.cn/1/clouddrive/file/upload/finish` |
| 任务轮询 | GET | `https://drive-pc.quark.cn/1/clouddrive/task` |