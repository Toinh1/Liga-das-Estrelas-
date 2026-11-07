export function createPlayerAvatarSvg(
  name: string,
  accentHex = '#A3E635',
  bgHex = '#141B24'
): string {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgHex}" />
        <stop offset="100%" stop-color="#090B0E" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="40" fill="url(#g)" />
    <circle cx="80" cy="80" r="68" fill="none" stroke="${accentHex}" stroke-opacity="0.35" stroke-width="4" />
    <path d="M40 138 C46 112 114 112 120 138" fill="${accentHex}" fill-opacity="0.22" />
    <text x="80" y="93" text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="800" font-size="46" fill="#F8FAFC">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createPeladaSceneSvg(
  title: string,
  subtitle: string,
  accentHex = '#A3E635',
  theme: 'squad' | 'trophy' | 'match' | 'keeper' = 'squad'
): string {
  const badgeLabel =
    theme === 'squad'
      ? 'FOTO OFICIAL DA RODADA'
      : theme === 'trophy'
      ? 'LINHA CAMPEÃ DE SÁBADO'
      : theme === 'keeper'
      ? 'DEFESAÇA DA RODADA'
      : 'CLÁSSICO NA ARENA';

  const centerGraphic =
    theme === 'trophy'
      ? `<circle cx="600" cy="310" r="115" fill="${accentHex}" fill-opacity="0.14"/>
         <path d="M555 235 H645 V295 C645 330 622 350 600 355 C578 350 555 330 555 295 Z" fill="#FACC15"/>
         <rect x="586" y="352" width="28" height="32" fill="#EAB308"/>
         <rect x="560" y="384" width="80" height="16" rx="6" fill="#FACC15"/>`
      : `<rect x="260" y="190" width="680" height="270" rx="18" fill="#0F291E" stroke="#A3E635" stroke-opacity="0.45" stroke-width="3"/>
         <line x1="600" y1="190" x2="600" y2="460" stroke="#A3E635" stroke-opacity="0.35" stroke-width="3"/>
         <circle cx="600" cy="325" r="52" fill="none" stroke="#A3E635" stroke-opacity="0.35" stroke-width="3"/>
         <circle cx="430" cy="300" r="18" fill="${accentHex}"/><circle cx="490" cy="360" r="18" fill="${accentHex}"/>
         <circle cx="545" cy="275" r="18" fill="${accentHex}"/><circle cx="655" cy="295" r="18" fill="#F8FAFC"/>
         <circle cx="725" cy="355" r="18" fill="#F8FAFC"/><circle cx="775" cy="275" r="18" fill="#F8FAFC"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0B131E"/>
        <stop offset="55%" stop-color="#090D12"/>
        <stop offset="100%" stop-color="#111C15"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="20%" r="60%">
        <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#090B0E" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="675" fill="url(#bg)"/>
    <rect width="1200" height="675" fill="url(#glow)"/>
    ${centerGraphic}
    <rect x="64" y="54" width="290" height="40" rx="20" fill="${accentHex}"/>
    <text x="209" y="80" text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="800" font-size="16" fill="#090B0E">${badgeLabel}</text>
    <text x="64" y="565" font-family="Space Grotesk, Arial, sans-serif" font-weight="700" font-size="44" fill="#F8FAFC">${title}</text>
    <text x="64" y="610" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="500" font-size="24" fill="#94A3B8">${subtitle} • Dados Ilustrativos de Demonstração</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function fileToCompressedDataUrl(
  file: File,
  maxWidth = 1280,
  quality = 0.84
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
