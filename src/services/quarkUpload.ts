import fs from 'fs';
import crypto from 'crypto';
import { buildQuarkHeaders, dispatcher } from '../utils/quarkApi';
import { fetch } from 'undici';

const UPLOAD_BASE = 'https://drive-pc.quark.cn/1/clouddrive';

interface UploadProgress {
  uploaded: number;
  total: number;
  percent: number;
  speed: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

interface UpPreData {
  finish: boolean;
  task_id: string;
  upload_id?: string;
  auth_info: string;
  upload_url: string;
  obj_key: string;
  fid: string;
  bucket: string;
  format_type: string;
  callback: {
    callbackUrl: string;
    callbackBody: string;
  };
}

interface UpPreMeta {
  part_size: number;
  part_thread: number;
}

/**
 * 上传文件到夸克网盘（OSS 分片上传）
 */
export async function uploadFile(
  cookies: string,
  filePath: string,
  fileName: string,
  parentId: string,
  fileSize: number,
  onProgress?: ProgressCallback
): Promise<{ fid: string; file_name: string }> {
  const fileBuffer = fs.readFileSync(filePath);
  const startTime = Date.now();

  // 计算文件 hash
  const md5Hex = crypto.createHash('md5').update(fileBuffer).digest('hex');
  const sha1Hex = crypto.createHash('sha1').update(fileBuffer).digest('hex');

  const mimeType = getMimeType(fileName);

  // 1. 预上传 - 获取上传会话信息
  const now = Date.now();
  const preBody: any = {
    file_name: fileName,
    size: fileSize,
    pdir_fid: parentId,
    format_type: mimeType,
    ccp_hash_update: true,
    l_created_at: now,
    l_updated_at: now,
    parallel_upload: true,
    dir_name: '',
  };

  const preRes = await fetch(`${UPLOAD_BASE}/file/upload/pre?pr=ucpro&fr=pc&uc_param_str=`, {
    method: 'POST',
    headers: buildQuarkHeaders(cookies),
    body: JSON.stringify(preBody),
    dispatcher,
  });

  const preJson: any = await preRes.json();
  if (preJson.status !== 200 || preJson.code !== 0) {
    throw new Error(`上传预检失败: ${preJson.message || JSON.stringify(preJson)}`);
  }

  const preData: UpPreData = preJson.data;
  const preMeta: UpPreMeta = preJson.metadata || {};

  // 秒传检查
  if (preData.finish) {
    return { fid: preData.fid, file_name: fileName };
  }

  // 2. Hash 快传检查
  const hashRes = await fetch(`${UPLOAD_BASE}/file/update/hash?pr=ucpro&fr=pc&uc_param_str=`, {
    method: 'POST',
    headers: buildQuarkHeaders(cookies),
    body: JSON.stringify({ md5: md5Hex, sha1: sha1Hex, task_id: preData.task_id }),
    dispatcher,
  });

  const hashJson: any = await hashRes.json();
  if (hashJson.status === 200 && hashJson.data?.finish) {
    return { fid: preData.fid, file_name: fileName };
  }

  if (!preData.upload_id) {
    throw new Error('未获取到 upload_id');
  }

  // 3. 分片上传
  const partSize = preMeta.part_size || 10 * 1024 * 1024; // 默认 10MB
  const uploadUrlHost = preData.upload_url.replace(/^https?:\/\//, '');
  const totalParts = Math.ceil(fileSize / partSize);
  const etags: string[] = [];

  let uploadedBytes = 0;

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, fileSize);
    const chunk = fileBuffer.subarray(start, end);

    const etag = await uploadPart(
      cookies,
      preData,
      uploadUrlHost,
      mimeType,
      partNumber,
      chunk
    );

    etags.push(etag);
    uploadedBytes += chunk.length;

    if (onProgress) {
      const elapsed = (Date.now() - startTime) / 1000;
      onProgress({
        uploaded: uploadedBytes,
        total: fileSize,
        percent: Math.round((uploadedBytes / fileSize) * 100),
        speed: formatSpeed(uploadedBytes / elapsed),
      });
    }
  }

  // 4. 提交分片上传
  await uploadCommit(cookies, preData, uploadUrlHost, etags);

  // 5. 完成上传
  await fetch(`${UPLOAD_BASE}/file/upload/finish?pr=ucpro&fr=pc&uc_param_str=`, {
    method: 'POST',
    headers: buildQuarkHeaders(cookies),
    body: JSON.stringify({ obj_key: preData.obj_key, task_id: preData.task_id }),
    dispatcher,
  });

  // 等待一下让服务端处理
  await sleep(1000);

  return { fid: preData.fid, file_name: fileName };
}

/**
 * 上传单个分片，返回 ETag
 */
async function uploadPart(
  cookies: string,
  preData: UpPreData,
  uploadUrlHost: string,
  mimeType: string,
  partNumber: number,
  chunk: Buffer
): Promise<string> {
  const utcTime = new Date().toUTCString();

  // 构建 auth_meta (OSS 签名格式)
  // VERB\n\nContent-Type\nDate\nx-oss-*\n/Resource
  const authMeta = [
    'PUT',
    '',
    mimeType,
    utcTime,
    `x-oss-date:${utcTime}`,
    'x-oss-user-agent:aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit',
    `/${preData.bucket}/${preData.obj_key}?partNumber=${partNumber}&uploadId=${preData.upload_id}`,
  ].join('\n');

  // 获取 auth_key
  const authRes = await fetch(`${UPLOAD_BASE}/file/upload/auth?pr=ucpro&fr=pc&uc_param_str=`, {
    method: 'POST',
    headers: buildQuarkHeaders(cookies),
    body: JSON.stringify({
      auth_info: preData.auth_info,
      auth_meta: authMeta,
      task_id: preData.task_id,
    }),
    dispatcher,
  });

  const authJson: any = await authRes.json();
  if (authJson.status !== 200 || authJson.code !== 0) {
    throw new Error(`获取上传凭证失败: ${authJson.message}`);
  }

  const authKey = authJson.data?.auth_key;
  if (!authKey) {
    throw new Error('未获取到 auth_key');
  }

  // PUT 分片到 OSS
  const ossUrl = `https://${preData.bucket}.${uploadUrlHost}/${preData.obj_key}?partNumber=${partNumber}&uploadId=${preData.upload_id}`;

  const putRes = await fetch(ossUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authKey,
      'Content-Type': mimeType,
      'Referer': 'https://pan.quark.cn/',
      'x-oss-date': utcTime,
      'x-oss-user-agent': 'aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit',
    },
    body: chunk,
    dispatcher,
  });

  if (putRes.status !== 200) {
    const text = await putRes.text();
    throw new Error(`分片上传失败: ${putRes.status} ${text}`);
  }

  const etag = putRes.headers.get('etag') || '';
  return etag;
}

/**
 * 提交分片上传（Complete Multipart Upload）
 */
async function uploadCommit(
  cookies: string,
  preData: UpPreData,
  uploadUrlHost: string,
  etags: string[]
): Promise<void> {
  const utcTime = new Date().toUTCString();

  // 构建 XML body
  let xmlBody = '<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>\n';
  for (let i = 0; i < etags.length; i++) {
    xmlBody += `<Part>\n<PartNumber>${i + 1}</PartNumber>\n<ETag>${etags[i]}</ETag>\n</Part>\n`;
  }
  xmlBody += '</CompleteMultipartUpload>';

  // Content-MD5
  const contentMd5 = crypto.createHash('md5').update(xmlBody).digest('base64');

  // callback base64
  const callbackBase64 = Buffer.from(JSON.stringify(preData.callback)).toString('base64');

  // 构建 auth_meta (OSS 签名格式)
  // VERB\nContent-MD5\nContent-Type\nDate\nx-oss-*\n/Resource
  const authMeta = [
    'POST',
    contentMd5,
    'application/xml',
    utcTime,
    `x-oss-callback:${callbackBase64}`,
    `x-oss-date:${utcTime}`,
    'x-oss-user-agent:aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit',
    `/${preData.bucket}/${preData.obj_key}?uploadId=${preData.upload_id}`,
  ].join('\n');

  // 获取 auth_key
  const authRes = await fetch(`${UPLOAD_BASE}/file/upload/auth?pr=ucpro&fr=pc&uc_param_str=`, {
    method: 'POST',
    headers: buildQuarkHeaders(cookies),
    body: JSON.stringify({
      auth_info: preData.auth_info,
      auth_meta: authMeta,
      task_id: preData.task_id,
    }),
    dispatcher,
  });

  const authJson: any = await authRes.json();
  if (authJson.status !== 200 || authJson.code !== 0) {
    throw new Error(`获取提交凭证失败: ${authJson.message}`);
  }

  const authKey = authJson.data?.auth_key;
  if (!authKey) {
    throw new Error('未获取到 commit auth_key');
  }

  // POST 提交到 OSS
  const ossUrl = `https://${preData.bucket}.${uploadUrlHost}/${preData.obj_key}?uploadId=${preData.upload_id}`;

  const postRes = await fetch(ossUrl, {
    method: 'POST',
    headers: {
      'Authorization': authKey,
      'Content-MD5': contentMd5,
      'Content-Type': 'application/xml',
      'Referer': 'https://pan.quark.cn/',
      'x-oss-callback': callbackBase64,
      'x-oss-date': utcTime,
      'x-oss-user-agent': 'aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit',
    },
    body: xmlBody,
    dispatcher,
  });

  if (postRes.status !== 200) {
    const text = await postRes.text();
    throw new Error(`提交分片失败: ${postRes.status} ${text}`);
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    'ts': 'video/mp2t',
    'tsx': 'video/mp2t',
    'js': 'application/javascript',
    'json': 'application/json',
    'html': 'text/html',
    'css': 'text/css',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'gz': 'application/gzip',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
    'xml': 'application/xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  } else if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${bytesPerSec.toFixed(0)} B/s`;
}