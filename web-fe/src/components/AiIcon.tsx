import type { SVGProps } from 'react'

export interface AiIconProps extends SVGProps<SVGSVGElement> {
  size?: number
  variant?: 'sparkle' | 'bot' | 'compass'
}

export function AiIcon({ size = 20, variant = 'sparkle', className, ...props }: AiIconProps) {
  if (variant === 'bot') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
      >
        <defs>
          <linearGradient id="aiBotGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0d9488" />
            <stop offset="0.5" stopColor="#06b6d4" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        {/* Modern Sleek AI Bot Head / Visor */}
        <rect x="3" y="6" width="18" height="14" rx="5" fill="url(#aiBotGrad)" />
        {/* Antenna */}
        <path d="M12 6V3M12 3C11.1716 3 10.5 2.32843 10.5 1.5C10.5 0.671573 11.1716 0 12 0C12.8284 0 13.5 0.671573 13.5 1.5C13.5 2.32843 12.8284 3 12 3Z" fill="url(#aiBotGrad)" />
        {/* Visor Screen */}
        <rect x="6" y="9.5" width="12" height="7" rx="3" fill="#0f172a" />
        {/* Glowing Eyes */}
        <circle cx="9.5" cy="13" r="1.5" fill="#38bdf8" />
        <circle cx="14.5" cy="13" r="1.5" fill="#38bdf8" />
      </svg>
    )
  }

  if (variant === 'compass') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
      >
        <defs>
          <linearGradient id="aiCompassGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0d9488" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" stroke="url(#aiCompassGrad)" strokeWidth="2" />
        <polygon points="12 4 15 11 12 9 9 11" fill="url(#aiCompassGrad)" />
        <polygon points="12 20 9 13 12 15 15 13" fill="#94a3b8" />
        <circle cx="12" cy="12" r="2" fill="#ffffff" />
      </svg>
    )
  }

  // Default: Modern Premium AI Sparkle & Orbital Constellation (Flagship AI travel style)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="aiPrimarySparkle" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
      </defs>
      {/* Central 4-point AI Star */}
      <path
        d="M12 2C12.5 6.5 15.5 9.5 20 10C15.5 10.5 12.5 13.5 12 18C11.5 13.5 8.5 10.5 4 10C8.5 9.5 11.5 6.5 12 2Z"
        fill="currentColor"
      />
      {/* Secondary Companion Star */}
      <path
        d="M18.5 15.5C18.8 17.2 19.8 18.2 21.5 18.5C19.8 18.8 18.8 19.8 18.5 21.5C18.2 19.8 17.2 18.8 15.5 18.5C17.2 18.2 18.2 17.2 18.5 15.5Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Tertiary Mini Sparkle */}
      <circle cx="6" cy="17" r="1.25" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
