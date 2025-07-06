import React from 'react';

export const IconSend: React.FC = () => (
  <span 
    className="inline-block w-4 h-4 text-current"
    style={{ transform: 'rotate(90deg)' }}
  >
    ➤
  </span>
);

export const IconTerminal: React.FC = () => (
  <span className="inline-block w-4 h-4 text-green-400 font-mono font-bold">
    {'>'}
  </span>
);

export const IconType: React.FC = () => (
  <span className="inline-block w-4 h-4 text-blue-600 font-bold">
    T
  </span>
);

export const IconMenu: React.FC = () => (
  <span className="inline-block w-4 h-4 text-gray-600">
    ☰
  </span>
);

export const IconX: React.FC = () => (
  <span className="inline-block w-4 h-4 text-gray-600">
    ✕
  </span>
); 