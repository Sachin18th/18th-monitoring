export interface BrowserMetadata {
  browser: string;
  version: string;
  os: string;
  device: 'mobile' | 'tablet' | 'desktop';
  screen: string;
  language: string;
  userAgent: string;
}

export const getBrowserMetadata = (): BrowserMetadata => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let version = 'Unknown';
  let os = 'Unknown';
  let device: 'mobile' | 'tablet' | 'desktop' = 'desktop';

  // Basic Browser Detection
  if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
  else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
  else if (ua.indexOf('Safari') > -1) browser = 'Safari';
  else if (ua.indexOf('Edge') > -1) browser = 'Edge';

  // Basic OS Detection
  if (ua.indexOf('Win') > -1) os = 'Windows';
  else if (ua.indexOf('Mac') > -1) os = 'MacOS';
  else if (ua.indexOf('Linux') > -1) os = 'Linux';
  else if (ua.indexOf('Android') > -1) os = 'Android';
  else if (ua.indexOf('like Mac') > -1) os = 'iOS';

  // Device Detection
  if (/tablet|ipad|playbook|silk/i.test(ua.toLowerCase())) {
    device = 'tablet';
  } else if (/mobile|iphone|ipod|blackberry|opera mini|iemobile|webos/i.test(ua.toLowerCase())) {
    device = 'mobile';
  }

  return {
    browser,
    version, // Could be refined with regex
    os,
    device,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    userAgent: ua
  };
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getNetworkInfo = () => {
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return {};
  return {
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData
  };
};
