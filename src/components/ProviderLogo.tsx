import type { ProviderId } from '../../packages/shared-types/src/index';

interface ProviderLogoProps {
  providerId: ProviderId;
  size?: number;
}

const BRAND_CONFIG: Record<ProviderId, { bg: string; fg: string; glyph: string }> = {
  deepseek: { bg: '#0E2439', fg: '#38BDF8', glyph: 'DS' },
  zai: { bg: '#16242E', fg: '#2DD4BF', glyph: 'Z' },
  kimi: { bg: '#1C1E2E', fg: '#A5B4FC', glyph: 'K' },
  qwen: { bg: '#1E1B31', fg: '#C4B5FD', glyph: 'Q' },
  claude: { bg: '#2B1E17', fg: '#FDBA74', glyph: 'CL' },
  chatgpt: { bg: '#112924', fg: '#34D399', glyph: 'GP' },
  gemini: { bg: '#152238', fg: '#60A5FA', glyph: 'GM' },
};

export function ProviderLogo({ providerId, size = 32 }: ProviderLogoProps) {
  const cfg = BRAND_CONFIG[providerId];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="shrink-0 rounded-lg border border-slate-800"
    >
      <rect width="36" height="36" rx="8" fill={cfg.bg} />
      <text
        x="18"
        y="22.5"
        textAnchor="middle"
        fill={cfg.fg}
        fontSize="12"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        {cfg.glyph}
      </text>
    </svg>
  );
}
