import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, decimals: number = 2): string {
  if (value === 0) return '0';
  
  if (value < 0.01) {
    return value.toExponential(2);
  }
  
  if (value >= 1000000) {
    return (value / 1000000).toFixed(decimals) + 'M';
  }
  
  if (value >= 1000) {
    return (value / 1000).toFixed(decimals) + 'K';
  }
  
  return value.toFixed(decimals);
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}