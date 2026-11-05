import fs from 'fs';
import path from 'path';
import { buildDownloadHeaders, dispatcher } from '../utils/quarkApi';
import { fetch } from 'undici';

const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');

interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed: string;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * 从夸克网盘下载文件到本地
 */
export async function downloadFile(
  cookies: string,
  downloadUrl: string,
  fileName: string,
  fileSize: number,
  savePath?: string,
  onProgress?: ProgressCallback
): Promise<{ local_path: string; size: number }> {
  // 确保下载目录存在
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const localPath = savePath || path.join(DOWNLOAD_DIR, fileName);

  const startTime = Date.now();
  let downloadedBytes = 0;

  const response = await fetch(downloadUrl, {
    headers: buildDownloadHeaders(cookies),
    dispatcher,
  });

  if (!response.ok) {
    throw new Error(`下载请求失败: ${response.status}`);
  }

  const contentLength = response.headers.get('content-length') || '';
  const total = contentLength ? parseInt(contentLength, 10) : fileSize;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const writeStream = fs.createWriteStream(localPath);
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloadedBytes += value.length;
      writeStream.write(value);

      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0
        ? formatSpeed(downloadedBytes / elapsed)
        : '0 B/s';

      if (onProgress && total > 0) {
        onProgress({
          downloaded: downloadedBytes,
          total,
          percent: Math.round((downloadedBytes / total) * 100),
          speed,
        });
      }
    }
  } finally {
    writeStream.end();
    reader.releaseLock();
  }

  // 等待写入完成
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return {
    local_path: localPath,
    size: downloadedBytes,
  };
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  } else if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${bytesPerSec.toFixed(0)} B/s`;
}

export { DOWNLOAD_DIR };