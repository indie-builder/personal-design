import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import styles from './button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'subtle';
export function buttonClassName({
  variant = 'default',
  icon = false,
  className,
}: { variant?: ButtonVariant; icon?: boolean; className?: string } = {}) {
  return cn(styles.button, styles[variant], icon && styles.icon, className);
}

/** Native button; use buttonClassName on Link/a so navigation keeps link semantics. */
export function Button({
  variant,
  icon,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: boolean }) {
  return (
    <button type={type} className={buttonClassName({ variant, icon, className })} {...props} />
  );
}
