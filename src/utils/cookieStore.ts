import fs from 'fs';
import path from 'path';

const COOKIE_FILE = path.join(__dirname, '..', '.quark_cookies.json');

interface CookieData {
  cookies: string;
  updated_at: number;
}

export function loadCookies(): CookieData | null {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const raw = fs.readFileSync(COOKIE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[CookieStore] 读取 Cookie 失败:', e);
  }
  return null;
}

export function saveCookies(cookieString: string): void {
  const data: CookieData = {
    cookies: cookieString,
    updated_at: Date.now(),
  };
  try {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[CookieStore] Cookie 已保存');
  } catch (e) {
    console.error('[CookieStore] 保存 Cookie 失败:', e);
  }
}

export function clearCookies(): void {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      fs.unlinkSync(COOKIE_FILE);
    }
  } catch (e) {
    console.error('[CookieStore] 清除 Cookie 失败:', e);
  }
}