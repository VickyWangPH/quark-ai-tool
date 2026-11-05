import express from 'express';
import { fetch } from 'undici';
import { loadCookies } from '../utils/cookieStore';
import { getDownloadUrl } from '../services/quarkFiles';
import { downloadFile } from '../services/quarkDownload';
import { buildDownloadHeaders, dispatcher } from '../utils/quarkApi';

const router = express.Router();

/**
 * 下载文件
 *
 * 两种模式：
 *  - 默认：SSE 推送进度，文件写入 sidecar 本地 downloads/（或 save_path）
 *  - ?inline=1：直接把文件字节回吐给调用方，不落盘
 *    —— 供程序化读取云端 JSON / 快照（SaveSync 的 quark_bridge 使用），
 *       避免依赖 sidecar 本地文件路径，Phase 1b 去 sidecar 后契约仍成立
 */
router.get('/:fileId', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return res.json({
      success: false,
      error: '未登录，请打开浏览器扫码登录',
      code: 'NOT_LOGGED_IN',
    });
  }

  const fileId = req.params.fileId;
  const savePath = req.query.save_path as string | undefined;

  try {
    // 获取下载链接
    const downloadInfo = await getDownloadUrl(cookieData.cookies, fileId);

    // inline 模式：直接回吐文件字节
    if (req.query.inline === '1' || req.query.inline === 'true') {
      const remote = await fetch(downloadInfo.download_url, {
        headers: buildDownloadHeaders(cookieData.cookies),
        dispatcher,
      });
      if (!remote.ok) {
        throw new Error(`下载请求失败: ${remote.status}`);
      }
      const buf = Buffer.from(await remote.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length),
        'X-File-Name': encodeURIComponent(downloadInfo.file_name || ''),
      });
      return res.end(buf);
    }

    // 设置 SSE header
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 开始下载
    const result = await downloadFile(
      cookieData.cookies,
      downloadInfo.download_url,
      downloadInfo.file_name,
      downloadInfo.size,
      savePath,
      (progress) => {
        sendEvent('progress', progress);
      }
    );

    sendEvent('complete', result);
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      return res.json({
        success: false,
        error: String((e as Error).message),
        code: 'DOWNLOAD_FAILED',
      });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: String((e as Error).message) })}\n\n`);
    res.end();
  }
});

export default router;