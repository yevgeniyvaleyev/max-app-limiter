export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
}

export const light: Palette = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#DADDE2',
  text: '#16181D',
  textMuted: '#6B7280',
  primary: '#3B5BDB',
  onPrimary: '#FFFFFF',
  success: '#2F9E44',
  warning: '#E8890C',
  danger: '#E03131',
};

export const dark: Palette = {
  background: '#0F1115',
  surface: '#181B21',
  surfaceAlt: '#20242C',
  border: '#2C313A',
  text: '#E8EAED',
  textMuted: '#9AA0A6',
  primary: '#748FFC',
  onPrimary: '#0F1115',
  success: '#51CF66',
  warning: '#FFA94D',
  danger: '#FF6B6B',
};
