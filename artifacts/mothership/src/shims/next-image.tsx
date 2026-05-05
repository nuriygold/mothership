import * as React from 'react';

interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> {
  src: string | { src: string };
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  loader?: any;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
  sizes?: string;
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, width, height, fill, priority, quality, loader, placeholder, blurDataURL, unoptimized, style, ...rest },
  ref,
) {
  const resolved = typeof src === 'string' ? src : src.src;
  const finalStyle = fill
    ? { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const, ...style }
    : style;
  return <img ref={ref} src={resolved} alt={alt} width={width as any} height={height as any} style={finalStyle} {...rest} />;
});

export default Image;
