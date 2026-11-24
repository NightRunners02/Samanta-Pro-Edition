export interface AppIconPreset {
  id: string;
  label: string;
  dataUrl: string;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

export const APP_ICON_PRESETS: AppIconPreset[] = [
  {
    id: 'taflow-crest',
    label: 'TAFlow Crest',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="bg1" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#1D4ED8"/>
          </linearGradient>
          <linearGradient id="cy1" x1="16" y1="16" x2="50" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#38BDF8"/>
            <stop offset="100%" stop-color="#06B6D4"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#bg1)"/>
        <path d="M32 11L49 18.5V31.5C49 42.2 41.7 50.8 32 54C22.3 50.8 15 42.2 15 31.5V18.5L32 11Z" stroke="url(#cy1)" stroke-width="2.75" fill="#0F172A" fill-opacity="0.45"/>
        <path d="M23 26H41M32 26V42" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M24 38C28.5 34.5 35.5 34.5 40 38" stroke="#22D3EE" stroke-width="2.6" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'scholar-cap',
    label: 'Scholar Cap',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="bg2" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1E3A8A"/>
            <stop offset="100%" stop-color="#0F172A"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#bg2)"/>
        <path d="M32 16L52 26L32 36L12 26L32 16Z" fill="#FFFFFF"/>
        <path d="M20 31V41.5C20 44.5 25.4 48 32 48C38.6 48 44 44.5 44 41.5V31L32 37L20 31Z" fill="#38BDF8"/>
        <path d="M49 28V41" stroke="#22D3EE" stroke-width="2.8" stroke-linecap="round"/>
        <circle cx="49" cy="43" r="2.6" fill="#22D3EE"/>
      </svg>
    `),
  },
  {
    id: 'thesis-codex',
    label: 'Thesis Codex',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="bg3" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0B1120"/>
            <stop offset="100%" stop-color="#0369A1"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#bg3)"/>
        <path d="M16 19C16 16.8 17.8 15 20 15H31V47H20C17.8 47 16 48.2 16 49.5V19Z" fill="#FFFFFF" fill-opacity="0.95"/>
        <path d="M48 19C48 16.8 46.2 15 44 15H33V47H44C46.2 47 48 48.2 48 49.5V19Z" fill="#E0F2FE"/>
        <path d="M37 15H43V29L40 26.5L37 29V15Z" fill="#06B6D4"/>
        <path d="M20 23H27M20 29H27M20 35H25" stroke="#1D4ED8" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'cyan-compass',
    label: 'Flow Pulse',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="bg4" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#1E40AF"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#bg4)"/>
        <circle cx="32" cy="32" r="18" stroke="#38BDF8" stroke-width="2.8"/>
        <path d="M32 18L36.8 27.2L46 32L36.8 36.8L32 46L27.2 36.8L18 32L27.2 27.2L32 18Z" fill="#FFFFFF"/>
        <circle cx="32" cy="32" r="3.5" fill="#0284C7"/>
      </svg>
    `),
  },
];

export const DEFAULT_APP_ICON_URL = APP_ICON_PRESETS[0].dataUrl;

/**
 * Converts a chosen local file (from laptop or mobile media/gallery) into a compact Data URL
 * suitable for storing directly as an app icon / favicon and previewing immediately.
 */
export async function processImageFileToIconDataUrl(file: File, targetSize = 192): Promise<string> {
  const lowerName = file.name.toLowerCase();
  const isSvg = file.type === 'image/svg+xml' || lowerName.endsWith('.svg');
  const isIco =
    file.type === 'image/x-icon' ||
    file.type === 'image/vnd.microsoft.icon' ||
    lowerName.endsWith('.ico');

  const readAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Gagal membaca berkas gambar.'));
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
      reader.readAsDataURL(blob);
    });

  if (isSvg || isIco) {
    if (file.size > 250 * 1024) {
      throw new Error('Ukuran file SVG/ICO maksimal 250 KB.');
    }
    return readAsDataUrl(file);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Berkas gambar tidak dapat dimuat.'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return readAsDataUrl(file);
    }

    ctx.clearRect(0, 0, targetSize, targetSize);
    const scale = Math.min(targetSize / img.width, targetSize / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (targetSize - drawW) / 2;
    const dy = (targetSize - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);

    return canvas.toDataURL('image/png', 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function applyDocumentFavicon(iconUrl: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const href = iconUrl?.trim() || DEFAULT_APP_ICON_URL;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (href.startsWith('data:image/svg+xml')) {
    link.type = 'image/svg+xml';
  } else if (href.startsWith('data:image/png') || href.toLowerCase().endsWith('.png')) {
    link.type = 'image/png';
  } else {
    link.removeAttribute('type');
  }
  link.href = href;
}
