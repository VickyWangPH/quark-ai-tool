import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { loadCookies } from '../utils/cookieStore';
import { uploadFile } from '../services/quarkUpload';

const router = express.Router();

// 配置 multer - 存到临时目录
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'quark-upload');
    require('fs').mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^\w.\u4e00-\u9fa5-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

const multerUpload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB
  },
});

/**
 * 上传文件
 *
 * 首先获取 taskId，然后连接 /api/upload/progress/:taskId 看 SSE 进度
 */
router.post('/', multerUpload.single('file'), async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return res.json({
      success: false,
      error: '未登录，请打开浏览器扫码登录',
      code: 'NOT_LOGGED_IN',
    });
  }

  const file = req.file;
  if (!file) {
    return res.json({
      success: false,
      error: '未找到上传文件',
      code: 'NO_FILE',
    });
  }

  const parentId = (req.body.parent_id as string) || '0';
  const taskId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // 保存上传任务到内存
  (global as any).uploadTasks = (global as any).uploadTasks || new Map();
  (global as any).uploadTasks.set(taskId, {
    status: 'pending',
    uploaded: 0,
    total: file.size,
    percent: 0,
  });

  res.json({
    success: true,
    data: {
      taskId,
      file_name: file.originalname,
      size: file.size,
    },
  });

  // 异步处理上传
  setTimeout(async () => {
    try {
      const result = await uploadFile(
        cookieData.cookies,
        file.path,
        file.originalname,
        parentId,
        file.size,
        (progress) => {
          const task = (global as any).uploadTasks.get(taskId);
          if (task) {
            Object.assign(task, progress);
          }
        }
      );

      const task = (global as any).uploadTasks.get(taskId);
      if (task) {
        task.status = 'completed';
        task.result = result;
      }

      // 删除临时文件
      require('fs').unlink(file.path, () => {});
    } catch (e) {
      const task = (global as any).uploadTasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = String((e as Error).message);
      }
      console.error('Upload failed:', e);
    }
  }, 0);
});

/**
 * SSE 推送上传进度
 */
router.get('/progress/:taskId', (req, res) => {
  const taskId = req.params.taskId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 检查任务是否存在
  const task = (global as any).uploadTasks?.get(taskId);
  if (!task) {
    sendEvent('error', { error: '任务不存在' });
    res.end();
    return;
  }

  // 初始推送
  sendEvent('progress', {
    uploaded: task.uploaded,
    total: task.total,
    percent: task.percent,
  });

  // 定时推送进度
  const interval = setInterval(() => {
    if (!res.writableEnded) {
      sendEvent('progress', {
        uploaded: task.uploaded,
        total: task.total,
        percent: task.percent,
        speed: task.speed,
      });

      if (task.status === 'completed') {
        sendEvent('complete', task.result);
        clearInterval(interval);
        res.end();
        (global as any).uploadTasks.delete(taskId);
      } else if (task.status === 'failed') {
        sendEvent('error', { error: task.error });
        clearInterval(interval);
        res.end();
        (global as any).uploadTasks.delete(taskId);
      }
    } else {
      clearInterval(interval);
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
