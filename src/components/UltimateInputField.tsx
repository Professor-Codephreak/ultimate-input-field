import React, { useState, useRef, useEffect } from 'react';
import { UltimateInputFieldProps } from '../types';
import { Button } from './ui/Button';
import { IconSend, IconTerminal, IconType, IconMenu, IconX } from './ui/Icons';
import '../styles/UltimateInputField.css';


export const UltimateInputField: React.FC<UltimateInputFieldProps> = ({
  value,
  onChange,
  onSend,
  isLoading = false,
  className = '',
  placeholder,
  disabled = false,
  mode: initialMode = 'text',
  initialPosition,
  initialSize = { width: 600, height: 120 },
  minWidth = 300,
  maxWidth = 800,
  minHeight = 60,
  maxHeight = 400,
  draggable = true,
  resizable = true,
  dockable = true,
  glowEffect = true
}) => {
  const [position, setPosition] = useState(initialPosition || { 
    x: window.innerWidth/2 - initialSize.width/2, 
    y: window.innerHeight/2 - initialSize.height/2 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);
  const [isDocked, setIsDocked] = useState<string | null>(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [size, setSize] = useState(initialSize);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: initialSize.width, height: initialSize.height });
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  // Removed unused state to fix build errors
  // const [menuItems, setMenuItems] = useState<MenuItem[]>([
  //   { id: 'dock-top', label: 'Dock to Top', action: () => handleDock('top'), type: 'dock' },
  //   { id: 'dock-bottom', label: 'Dock to Bottom', action: () => handleDock('bottom'), type: 'dock' },
  //   { id: 'dock-left', label: 'Dock to Left', action: () => handleDock('left'), type: 'dock' },
  //   { id: 'dock-right', label: 'Dock to Right', action: () => handleDock('right'), type: 'dock' },
  //   { id: 'undock', label: 'Undock', action: () => handleDock(null), type: 'dock' }
  // ]);
  // const [newMenuItemLabel, setNewMenuItemLabel] = useState('');
  // const [isAddingMenuItem, setIsAddingMenuItem] = useState(false);

  // Drag logic
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDocked || !draggable) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    e.preventDefault();
  };
  
  const handlePointerMove = (e: PointerEvent) => {
    if (isDragging && !isDocked && draggable) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
    if (isResizing && resizable) {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = position.x;
      let newY = position.y;
      
      switch (resizeCorner) {
        case 'br':
          // Bottom-right: add to width and height (working correctly)
          newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + dx));
          newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + dy));
          break;
        case 'bl':
          // Bottom-left: add to height, subtract from width (expand left)
          newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width - dx));
          newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + dy));
          newX = position.x + (resizeStart.width - newWidth);
          break;
        case 'tr':
          // Top-right: add to width, subtract from height (expand up)
          newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + dx));
          newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height - dy));
          newY = position.y + (resizeStart.height - newHeight);
          break;
        case 'tl':
          // Top-left: subtract from both width and height (expand left and up)
          newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width - dx));
          newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height - dy));
          newX = position.x + (resizeStart.width - newWidth);
          newY = position.y + (resizeStart.height - newHeight);
          break;
      }
      
      setSize({ width: newWidth, height: newHeight });
      if (resizeCorner === 'bl' || resizeCorner === 'tr' || resizeCorner === 'tl') {
        setPosition({ x: newX, y: newY });
      }
    }
  };
  
  const handlePointerUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeCorner(null);
  };
  
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, isResizing, isDocked, draggable, resizable, resizeCorner, resizeStart, position, dragOffset, minWidth, maxWidth, minHeight, maxHeight]);

  // Enhanced glow effect
  const triggerGlowEffect = () => {
    if (!glowEffect) return;
    setIsGlowing(true);
    setTimeout(() => setIsGlowing(false), 500);
  };

  // Dock logic with smooth transitions
  const handleDock = (edge: string | null) => {
    if (!dockable) return;
    setIsDocked(edge);
    setIsMenuVisible(false);
    if (edge === null) {
      setPosition({ x: window.innerWidth/2 - size.width/2, y: window.innerHeight/2 - size.height/2 });
    }
  };

  // Keyboard send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      triggerGlowEffect();
    }
  };

  // Enhanced resize logic for corner tabs
  const handleCornerResizePointerDown = (e: React.PointerEvent, corner: string) => {
    if (!resizable) return;
    setIsResizing(true);
    setResizeCorner(corner);
    setResizeStart({ x: e.clientX, y: e.clientY, width: size.width, height: size.height });
    e.stopPropagation();
    e.preventDefault();
  };

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  // Docked style with enhanced positioning
  let dockStyle: React.CSSProperties = {};
  if (isDocked === 'top') dockStyle = { top: 0, left: '50%', transform: 'translateX(-50%)', right: 'auto', bottom: 'auto' };
  if (isDocked === 'bottom') dockStyle = { bottom: 0, left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto' };
  if (isDocked === 'left') dockStyle = { left: 0, top: '50%', transform: 'translateY(-50%)', right: 'auto', bottom: 'auto' };
  if (isDocked === 'right') dockStyle = { right: 0, top: '50%', transform: 'translateY(-50%)', left: 'auto', bottom: 'auto' };
  if (!isDocked) dockStyle = { left: position.x, top: position.y, width: size.width, height: size.height };

  const containerClasses = [
    'ultimate-input-field',
    isGlowing ? 'animate-glow' : '',
    isDocked ? 'transition-all duration-300 ease-out' : '',
    mode === 'terminal' ? 'terminal-glass' : 'glass-effect',
    className
  ].filter(Boolean).join(' ');

  const defaultPlaceholder = mode === 'text' ? 'Type a message...' : 'Enter command...';

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={{
        ...dockStyle,
        width: size.width,
        height: size.height,
        minWidth: minWidth,
        maxWidth: maxWidth,
        minHeight: minHeight,
      }}
    >
      {/* Subtle drag handle that only appears on hover */}
      {draggable && (
        <div
          className={`drag-handle ${isDragging ? 'dragging' : ''}`}
          onPointerDown={handlePointerDown}
        >
          <div className="drag-indicator" />
        </div>
      )}
      
      {/* Enhanced textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || defaultPlaceholder}
        disabled={disabled || isLoading}
        className={`ultimate-textarea ${mode === 'terminal' ? 'terminal-mode' : 'text-mode'} ${isDragging ? 'pointer-events-none' : ''}`}
        style={{ maxHeight: 200 }}
      />
      
      {/* Enhanced controls */}
      <div className="ultimate-controls">
        <div className="ultimate-controls-left">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMode(mode === 'text' ? 'terminal' : 'text')}
            type="button"
          >
            {mode === 'text' ? <IconTerminal /> : <IconType />}
          </Button>
          {dockable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsMenuVisible(v => !v)}
              type="button"
            >
              {isMenuVisible ? <IconX /> : <IconMenu />}
            </Button>
          )}
        </div>
        <Button
          variant="default"
          size="icon"
          className={`h-8 w-8 ${isLoading || !value.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => { onSend(); triggerGlowEffect(); }}
          disabled={isLoading || !value.trim()}
          type="button"
        >
          <IconSend />
        </Button>
      </div>
      
      {/* Corner resize tabs - only show when not docked and resizable */}
      {!isDocked && resizable && (
        <div className="corner-tabs">
          <div
            className="corner-tab br"
            onPointerDown={(e) => handleCornerResizePointerDown(e, 'br')}
          />
          <div
            className="corner-tab bl"
            onPointerDown={(e) => handleCornerResizePointerDown(e, 'bl')}
          />
          <div
            className="corner-tab tr"
            onPointerDown={(e) => handleCornerResizePointerDown(e, 'tr')}
          />
          <div
            className="corner-tab tl"
            onPointerDown={(e) => handleCornerResizePointerDown(e, 'tl')}
          />
        </div>
      )}
      
      {/* Enhanced menu with glass effect */}
      {isMenuVisible && dockable && (
        <div className="ultimate-menu">
          <div className="ultimate-menu-content">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-left"
              onClick={() => handleDock('top')}
              type="button"
            >
              Dock to Top
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-left"
              onClick={() => handleDock('bottom')}
              type="button"
            >
              Dock to Bottom
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-left"
              onClick={() => handleDock('left')}
              type="button"
            >
              Dock to Left
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-left"
              onClick={() => handleDock('right')}
              type="button"
            >
              Dock to Right
            </Button>
            <div className="ultimate-menu-divider" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-left"
              onClick={() => handleDock(null)}
              type="button"
            >
              Undock
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}; 