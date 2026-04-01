import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/components/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:opacity-90 focus-visible:outline-primary',
        ghost: 'bg-transparent text-slate-200 hover:bg-panel',
        outline: 'border border-border text-slate-100 hover:border-slate-300',
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
