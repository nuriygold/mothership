import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/components/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-white hover:opacity-95 focus-visible:outline-[var(--primary)]',
        ghost: 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)]',
        outline: 'border border-border text-[var(--foreground)] hover:bg-[var(--muted)]',
      },
      size: {
        sm: 'px-3 py-1.5',
        md: 'px-4 py-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = ({ className, variant, size, ...props }: ButtonProps) => {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
};
