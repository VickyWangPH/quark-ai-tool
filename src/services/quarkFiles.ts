import { quarkRequest, QuarkFileItem, FileListResponse } from '../utils/quarkApi';

const DRIVE_BASE = 'https://drive-pc.quark.cn/1/clouddrive';

/**
 * 获取文件列表
 */
export async function getFileList(
  cookies: string,
  parentId: string = '0',
  page: number = 1,
  size: number = 50
): Promise<FileListResponse> {
  const res = await quarkRequest<any>(`${DRIVE_BASE}/file/sort`, {
    cookies,
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      pdir_fid: parentId,
      _page: String(page),
      _size: String(size),
      _sort: 'file_type:asc,updated_at:desc',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`获取文件列表失败: ${res.message}`);
  }

  const data = res.data;
  const list: QuarkFileItem[] = (data?.list || []).map((item: any) => ({
    fid: item.fid,
    file_name: item.file_name,
    file_type: item.dir ? 'folder' : 'file',
    size: item.size || 0,
    updated_at: item.updated_at || item.latest_updated_at || 0,
    thumbnail_url: item.thumbnail_url || '',
    category: item.category,
    file_extension: item.file_extension,
  }));

  return {
    list,
    total: data?.total || 0,
    page,
    size,
  };
}

/**
 * 新建文件夹
 */
export async function createFolder(
  cookies: string,
  parentId: string,
  name: string
): Promise<QuarkFileItem> {
  const res = await quarkRequest<any>(`${DRIVE_BASE}/file`, {
    method: 'POST',
    cookies,
    body: {
      pdir_fid: parentId,
      file_name: name,
      dir: true,
      dir_init_lock: false,
    },
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`新建文件夹失败: ${res.message}`);
  }

  const data = res.data;
  // 可能有 task_id，需要轮询
  if (data?.task_id) {
    await pollTask(cookies, data.task_id);
  }

  return {
    fid: data?.fid || '',
    file_name: name,
    file_type: 'folder',
    size: 0,
    updated_at: Date.now(),
  };
}

/**
 * 重命名文件
 */
export async function renameFile(
  cookies: string,
  fileId: string,
  newName: string
): Promise<void> {
  const res = await quarkRequest(`${DRIVE_BASE}/file/rename`, {
    method: 'POST',
    cookies,
    body: {
      fid: fileId,
      file_name: newName,
    },
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`重命名失败: ${res.message}`);
  }

  if (res.data?.task_id) {
    await pollTask(cookies, res.data.task_id);
  }
}

/**
 * 删除文件
 */
export async function deleteFiles(
  cookies: string,
  fileIds: string[]
): Promise<void> {
  const res = await quarkRequest(`${DRIVE_BASE}/file/delete`, {
    method: 'POST',
    cookies,
    body: {
      filelist: fileIds,
      action_type: 2, // 2 = 移到回收站
    },
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`删除失败: ${res.message}`);
  }

  if (res.data?.task_id) {
    await pollTask(cookies, res.data.task_id);
  }
}

/**
 * 移动文件
 */
export async function moveFiles(
  cookies: string,
  fileIds: string[],
  targetParentId: string
): Promise<void> {
  const res = await quarkRequest(`${DRIVE_BASE}/file/move`, {
    method: 'POST',
    cookies,
    body: {
      fid_list: fileIds,
      to_pdir_fid: targetParentId,
    },
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`移动失败: ${res.message}`);
  }

  if (res.data?.task_id) {
    await pollTask(cookies, res.data.task_id);
  }
}

/**
 * 获取文件下载链接
 */
export async function getDownloadUrl(
  cookies: string,
  fileId: string
): Promise<{ download_url: string; file_name: string; size: number }> {
  const res = await quarkRequest<any>(`${DRIVE_BASE}/file/download`, {
    method: 'POST',
    cookies,
    body: {
      fid: fileId,
    },
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`获取下载链接失败: ${res.message}`);
  }

  return {
    download_url: res.data?.download_url || '',
    file_name: res.data?.file_name || '',
    size: res.data?.size || 0,
  };
}

/**
 * 获取文件预览信息
 */
export async function getFilePreview(
  cookies: string,
  fileId: string
): Promise<{
  type: string;
  url?: string;
  content?: string;
  file_name: string;
  size: number;
}> {
  const res = await quarkRequest<any>(`${DRIVE_BASE}/file/info`, {
    cookies,
    params: {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      fid: fileId,
    },
  });

  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`获取文件信息失败: ${res.message}`);
  }

  const data = res.data;
  const category = data?.category || '';
  const file_name = data?.file_name || '';
  const size = data?.size || 0;

  // 根据文件类型判断预览方式
  let type = 'unknown';
  if (category === 'image' || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file_name)) {
    type = 'image';
  } else if (category === 'video' || /\.(mp4|mkv|avi|mov|flv|wmv)$/i.test(file_name)) {
    type = 'video';
  } else if (category === 'document' || /\.(txt|md|json|xml|html|css|js|ts|py|java|cpp|c|h|log|yaml|yml|toml|ini|cfg|conf)$/i.test(file_name)) {
    type = 'text';
  } else if (category === 'audio' || /\.(mp3|wav|flac|aac|ogg|wma|m4a)$/i.test(file_name)) {
    type = 'audio';
  } else if (/\.(pdf)$/i.test(file_name)) {
    type = 'pdf';
  }

  return {
    type,
    url: data?.download_url || data?.preview_url || '',
    file_name,
    size,
  };
}

/**
 * 轮询任务状态
 */
async function pollTask(
  cookies: string,
  taskId: string,
  maxRetries: number = 20,
  interval: number = 1000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    await sleep(interval);
    const res = await quarkRequest<any>(`${DRIVE_BASE}/task`, {
      cookies,
      params: {
        pr: 'ucpro',
        fr: 'pc',
        uc_param_str: '',
        task_id: taskId,
        retry_index: String(i),
      },
    });

    if (res.status === 200 && res.code === 0) {
      const status = res.data?.status;
      if (status === 2) return; // 成功
      if (status === 3) throw new Error(`任务失败: ${res.data?.message}`);
    }
  }
  throw new Error('任务超时');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}