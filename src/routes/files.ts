import express from 'express';
import { loadCookies } from '../utils/cookieStore';
import {
  getFileList,
  createFolder,
  renameFile,
  deleteFiles,
  moveFiles,
  getFilePreview,
} from '../services/quarkFiles';

const router = express.Router();

function requireLogin(res: express.Response) {
  return res.json({
    success: false,
    error: '未登录，请打开浏览器扫码登录',
    code: 'NOT_LOGGED_IN',
  });
}

/**
 * 获取文件列表
 */
router.get('/', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const parentId = (req.query.parent_id as string) || '0';
  const page = parseInt((req.query.page as string) || '1', 10);
  const size = parseInt((req.query.size as string) || '50', 10);

  try {
    const result = await getFileList(cookieData.cookies, parentId, page, size);
    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    if (String(e).includes('require login')) {
      return res.json({
        success: false,
        error: 'Cookie 已过期，请重新扫码',
        code: 'COOKIE_EXPIRED',
      });
    }
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

/**
 * 新建文件夹
 */
router.post('/mkdir', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const { parent_id, name } = req.body;
  if (!name) {
    return res.json({
      success: false,
      error: '缺少文件夹名称',
      code: 'INVALID_PARAMS',
    });
  }

  try {
    const result = await createFolder(cookieData.cookies, parent_id || '0', name);
    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

/**
 * 重命名
 */
router.post('/rename', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const { file_id, new_name } = req.body;
  if (!file_id || !new_name) {
    return res.json({
      success: false,
      error: '缺少参数',
      code: 'INVALID_PARAMS',
    });
  }

  try {
    await renameFile(cookieData.cookies, file_id, new_name);
    res.json({
      success: true,
      data: { message: '重命名成功' },
    });
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

/**
 * 删除文件
 */
router.post('/delete', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const { file_ids } = req.body;
  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return res.json({
      success: false,
      error: 'file_ids 必须是非空数组',
      code: 'INVALID_PARAMS',
    });
  }

  try {
    await deleteFiles(cookieData.cookies, file_ids);
    res.json({
      success: true,
      data: { message: '删除成功' },
    });
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

/**
 * 移动文件
 */
router.post('/move', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const { file_ids, target_parent_id } = req.body;
  if (!Array.isArray(file_ids) || file_ids.length === 0 || !target_parent_id) {
    return res.json({
      success: false,
      error: '缺少必要参数',
      code: 'INVALID_PARAMS',
    });
  }

  try {
    await moveFiles(cookieData.cookies, file_ids, target_parent_id);
    res.json({
      success: true,
      data: { message: '移动成功' },
    });
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

/**
 * 获取文件预览
 */
router.get('/preview/:fileId', async (req, res) => {
  const cookieData = loadCookies();
  if (!cookieData?.cookies) {
    return requireLogin(res);
  }

  const fileId = req.params.fileId;

  try {
    const preview = await getFilePreview(cookieData.cookies, fileId);
    res.json({
      success: true,
      data: preview,
    });
  } catch (e) {
    res.json({
      success: false,
      error: String((e as Error).message),
      code: 'QUARK_API_ERROR',
    });
  }
});

export default router;
