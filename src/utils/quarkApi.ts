import { fetch, ProxyAgent } from 'undici';

const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
const dispatcher = PROXY_URL ? new ProxyAgent({ uri: PROXY_URL }) : undefined;

const QUARK_PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const QUARK_CLIENT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch';

const QUARK_HEADERS = {
  'User-Agent': QUARK_PC_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://pan.quark.cn/',
};

const QUARK_CLIENT_HEADERS = {
  'User-Agent': QUARK_CLIENT_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://pan.quark.cn/',
};

export interface QuarkFileItem {
  fid: string;
  file_name: string;
  file_type: 'file' | 'folder';
  size: number;
  updated_at: number;
  thumbnail_url?: string;
  category?: string;
  file_extension?: string;
}

export interface FileListResponse {
  list: QuarkFileItem[];
  total: number;
  page: number;
  size: number;
}

export interface QuarkApiResponse<T = any> {
  status: number;
  code: number;
  message: string;
  data: T;
}

export async function quarkRequest<T = any>(
  url: string,
  options: {
    method?: string;
    cookies: string;
    body?: any;
    params?: Record<string, string>;
    useClientUA?: boolean;
  }
): Promise<QuarkApiResponse<T>> {
  const { method = 'GET', cookies, body, params, useClientUA } = options;

  const fullUrl = new URL(url);
  if (params) {
    Object.entries(params).forEach(([k, v]) => fullUrl.searchParams.set(k, v));
  }

  const baseHeaders = useClientUA ? QUARK_CLIENT_HEADERS : QUARK_HEADERS;
  const fetchOptions: any = {
    method,
    headers: {
      ...baseHeaders,
      Cookie: cookies,
      'Content-Type': 'application/json',
    },
    dispatcher,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(fullUrl.toString(), fetchOptions);
  const json = await response.json();
  return json as QuarkApiResponse<T>;
}

export function buildQuarkHeaders(cookies: string): Record<string, string> {
  return {
    ...QUARK_HEADERS,
    Cookie: cookies,
    'Content-Type': 'application/json',
  };
}

/**
 * OSS 直链下载专用请求头。
 * 夸克下载直链（dl-*.pds.quark.cn）的签名只包含 UA / Referer / Cookie，
 * 额外携带 Content-Type、Accept、Accept-Language 会导致
 * 403 SignatureDoesNotMatch。切勿复用 buildQuarkHeaders。
 */
export function buildDownloadHeaders(cookies: string): Record<string, string> {
  return {
    'User-Agent': QUARK_PC_UA,
    Referer: 'https://pan.quark.cn/',
    Cookie: cookies,
  };
}

export { QUARK_HEADERS, dispatcher };