import { quarkRequest, dispatcher } from '../utils/quarkApi';
import { fetch } from 'undici';
import { v4 as uuidv4 } from 'uuid';

const UOP_BASE = 'https://uop.quark.cn';
const QUARK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch';

export interface QrcodeResult {
  token: string;
  qrcode_url: string;
}

/**
 * 获取登录二维码 token
 */
export async function getQrcodeToken(): Promise<QrcodeResult> {
  // 使用 GET 请求 + client_id/v/request_id 参数（与 quarkpan 库一致）
  const res = await quarkRequest(`${UOP_BASE}/cas/ajax/getTokenForQrcodeLogin`, {
    method: 'GET',
    cookies: '',
    params: { client_id: '532', v: '1.2', request_id: uuidv4() },
    useClientUA: true,
  });

  if (res.status !== 2000000 || !res.data?.members?.token) {
    throw new Error(`获取二维码 token 失败: ${res.message}`);
  }

  const token = res.data.members.token;
  // 先发请求获取 su.quark.cn 的重定向，拿到最终的 b.quark.cn deep link
  const suUrl = `https://su.quark.cn/4_eMHBJ?token=${encodeURIComponent(token)}&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=S%3Acustom%7COPT%3ASAREA%400%7COPT%3AIMMERSIVE%401%7COPT%3ABACK_BTN_STYLE%400`;
  const suRes = await fetch(suUrl, {
    dispatcher,
    redirect: 'manual',
    headers: {
      'User-Agent': QUARK_UA,
    },
  });
  const deepLink = suRes.headers.get('location') || '';
  // 用 deep link 作为二维码内容，避免重定向消耗 token
  const qrcodeUrl = deepLink || suUrl;

  return { token, qrcode_url: qrcodeUrl };
}

/**
 * 轮询扫码状态
 */
export async function pollQrcodeStatus(token: string): Promise<{
  status: 'pending' | 'success' | 'expired';
  serviceTicket?: string;
}> {
  const res = await quarkRequest(
    `${UOP_BASE}/cas/ajax/getServiceTicketByQrcodeToken`,
    {
      cookies: '',
      params: { client_id: '532', v: '1.2', token, request_id: uuidv4() },
      useClientUA: true,
    }
  );

  // 2000000 = 扫码成功
  if (res.status === 2000000) {
    const serviceTicket = res.data?.members?.service_ticket;
    return { status: 'success', serviceTicket };
  }

  // 50004001 = 未扫码
  if (res.status === 50004001) {
    return { status: 'pending' };
  }

  // 50004002 = 过期
  return { status: 'expired' };
}

/**
 * 完成登录，获取完整 Cookie
 * 扫码成功后，用 service_ticket 换取 Cookie
 */
export async function completeLogin(serviceTicket: string): Promise<string> {
  // 1. 用 service_ticket 获取 Cookie
  const accountRes = await fetch(
    `https://pan.quark.cn/account/info?st=${encodeURIComponent(serviceTicket)}&lw=scan`,
    {
      headers: {
        'User-Agent': QUARK_UA,
      },
      dispatcher,
    }
  );

  const setCookie = accountRes.headers.getSetCookie?.()?.join('; ') || '';

  // 2. 用 Cookie 访问 drive 接口获取额外 Cookie (__puus)
  const configRes = await fetch(
    'https://drive-pc.quark.cn/1/clouddrive/config?pr=ucpro&fr=pc&uc_param_str=',
    {
      headers: {
        'User-Agent': QUARK_UA,
        Referer: 'https://pan.quark.cn',
        Cookie: setCookie,
      },
      dispatcher,
    }
  );

  const extraCookie = configRes.headers.getSetCookie?.()?.join('; ') || '';

  // 合并 Cookie
  const allCookies = combineCookies(setCookie, extraCookie);
  return allCookies;
}

function combineCookies(...cookieStrings: string[]): string {
  const cookieMap = new Map<string, string>();
  for (const str of cookieStrings) {
    if (!str) continue;
    const parts = str.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const value = trimmed.substring(eqIdx + 1);
        cookieMap.set(key, value);
      }
    }
  }
  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}