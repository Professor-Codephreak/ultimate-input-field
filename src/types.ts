export interface UltimateInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  mode?: 'text' | 'terminal';
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  draggable?: boolean;
  resizable?: boolean;
  dockable?: boolean;
  glowEffect?: boolean;
  glassEffect?: boolean;
} 