import express from 'express';
import QRCode from 'qrcode';
import { loadCookies, saveCookies, clearCookies } from '../utils/cookieStore';
import { getQrcodeToken, pollQrcodeStatus, completeLogin } from '../services/quarkAuth';
import { getFileList } from '../services/quarkFiles';

const router = express.Router();

/**
 * 检查登录状态
 */
router.get('/status', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return res.json({
      success: true,
      data: {
        logged_in: false,
        qrcode_url: `${req.protocol}://${req.get('host')}/api/auth/qrcode`,
      },
    });
  }

  // 验证 Cookie 是否有效
  try {
    await getFileList(cookieData.cookies, '0', 1, 1);
    return res.json({
      success: true,
      data: { logged_in: true },
    });
  } catch (e) {
    // Cookie 无效
    clearCookies();
    return res.json({
      success: true,
      data: {
        logged_in: false,
        qrcode_url: `${req.protocol}://${req.get('host')}/api/auth/qrcode`,
      },
    });
  }
});

/**
 * 获取二维码
 */
router.get('/qrcode', async (req, res) => {
  try {
    const { token, qrcode_url } = await getQrcodeToken();
    const qrcodeBase64 = await QRCode.toDataURL(qrcode_url);

    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>夸克网盘 - 扫码登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    h1 {
      color: #1e293b;
      font-size: 24px;
      margin-bottom: 8px;
    }
    p {
      color: #64748b;
      margin-bottom: 32px;
    }
    .qrcode {
      margin-bottom: 32px;
    }
    .qrcode img {
      width: 256px;
      height: 256px;
      border-radius: 8px;
    }
    .status {
      font-size: 14px;
      color: #06b6d4;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .success {
      color: #10b981;
      animation: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>夸克网盘登录</h1>
    <p>请使用夸克 APP 扫码登录</p>
    <div class="qrcode">
      <img src="${qrcodeBase64}" alt="登录二维码">
    </div>
    <div id="status" class="status">等待扫码...</div>
  </div>

  <script>
    const token = "${token}";
    const statusEl = document.getElementById('status');
    const interval = setInterval(async () => {
      const res = await fetch('/api/auth/poll?token=' + token);
      const data = await res.json();
      if (data.status === 'success') {
        statusEl.textContent = '扫码成功，正在获取 Cookie...';
        statusEl.classList.add('success');
        setTimeout(() => {
          window.location.href = '/api/auth/status';
        }, 2000);
        clearInterval(interval);
      } else if (data.status === 'expired') {
        statusEl.textContent = '二维码已过期，请刷新页面';
        clearInterval(interval);
      }
    }, 2000);
  </script>
</body>
</html>
    `);
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'GEN_QRCODE_FAILED',
    });
  }
});

/**
 * 轮询扫码状态
 */
router.get('/poll', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.json({ status: 'error', message: '缺少 token' });
  }

  try {
    const result = await pollQrcodeStatus(token);
    if (result.status === 'success' && result.serviceTicket) {
      // 完成登录获取完整 Cookie
      const fullCookies = await completeLogin(result.serviceTicket);
      saveCookies(fullCookies);
      return res.json({ status: 'success' });
    }
    return res.json({ status: result.status });
  } catch (e) {
    return res.json({ status: 'error', message: String((e as Error).message) });
  }
});

/**
 * 登出 - 清除 Cookie
 */
router.post('/logout', (req, res) => {
  clearCookies();
  res.json({ success: true, data: { message: '已登出' } });
});

export default router;