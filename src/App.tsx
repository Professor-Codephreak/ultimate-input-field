import React from 'react';
import { UltimateInputField } from './components/UltimateInputField';
import './styles/UltimateInputField.css';

export function App() {
  const [value, setValue] = React.useState('');

  const handleSend = () => {
    alert('Send: ' + value);
    setValue('');
  };

  return (
    <UltimateInputField
      value={value}
      onChange={setValue}
      onSend={handleSend}
      placeholder="Type your message here..."
    />
  );
}
