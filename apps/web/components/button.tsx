import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import styles from './button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'subtle';
export function buttonClassName({
  variant = 'default',
  icon = false,
  className,
}: { variant?: ButtonVariant; icon?: boolean; className?: string } = {}) {
  return clsx(styles.button, styles[variant], icon && styles.icon, className);
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
