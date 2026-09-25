type BrandLogoProps = {
  variant?: 'lockup' | 'icon';
  className?: string;
};

export function BrandLogo({ variant = 'lockup', className = '' }: BrandLogoProps) {
  const source = variant === 'icon'
    ? '/brand/divx/v1/divx-icon.png'
    : '/brand/divx/v1/divx-primary.png';

  return (
    <img
      className={`brand-logo brand-logo--${variant}${className ? ` ${className}` : ''}`}
      src={source}
      width={variant === 'icon' ? 1254 : 2138}
      height={variant === 'icon' ? 1254 : 736}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
