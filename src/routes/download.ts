import express from 'express';
import { loadCookies } from '../utils/cookieStore';
import { getDownloadUrl } from '../services/quarkFiles';
import { downloadFile } from '../services/quarkDownload';

const router = express.Router();

/**
 * 下载文件（SSE 进度推送）
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