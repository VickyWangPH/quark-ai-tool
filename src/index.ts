import express from 'express';
import path from 'path';
import { loadCookies } from './utils/cookieStore';
import authRoutes from './routes/auth';
import fileRoutes from './routes/files';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/download', downloadRoutes);

// 首页 - 二维码登录页
app.get('/', (req, res) => {
  const cookieData = loadCookies();
  if (cookieData?.cookies) {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>夸克网盘 - 已登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e2e8f0;
    }
    .card {
      background: #1e293b;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      border: 1px solid #334155;
    }
    h1 { color: #10b981; font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; margin-bottom: 24px; }
    .info { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .api-list { text-align: left; font-size: 13px; line-height: 2; color: #94a3b8; }
    .api-list code { color: #06b6d4; background: #0f172a; padding: 2px 6px; border-radius: 4px; }
    .btn {
      display: inline-block; margin-top: 24px; padding: 10px 24px;
      background: #ef4444; color: #fff; border: none; border-radius: 8px;
      cursor: pointer; font-size: 14px; text-decoration: none;
    }
    .btn:hover { background: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <h1>登录成功</h1>
    <p class="subtitle">夸克网盘 AI 工具服务已就绪</p>
    <p class="info">所有 API 均可正常调用，Cookie 已持久化到本地</p>
    <div class="api-list">
      <div>状态: <code>curl /api/auth/status</code></div>
      <div>文件: <code>curl /api/files?parent_id=0</code></div>
      <div>上传: <code>curl -F 'file=@...' /api/upload</code></div>
      <div>下载: <code>curl -N /api/download/:fid</code></div>
      <div>预览: <code>curl /api/files/preview/:fid</code></div>
    </div>
    <form action="/api/auth/logout" method="POST">
      <button class="btn" type="submit">登出</button>
    </form>
  </div>
</body>
</html>
    `);
  } else {
    res.redirect('/api/auth/qrcode');
  }
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     夸克网盘 AI 工具服务已启动            ║');
  console.log(`║     HTTP: http://0.0.0.0:${PORT}          ║`);
  console.log('║     登录: http://localhost:' + PORT + '          ║');
  console.log('║     状态: /api/auth/status               ║');
  console.log('║     文件: /api/files?parent_id=0          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const cookieData = loadCookies();
  if (cookieData?.cookies) {
    console.log('[启动] 已加载本地 Cookie');
  } else {
    console.log('[启动] 未登录，请打开浏览器扫码');
  }
});

export default app;
