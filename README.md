# Ultimate Input Field

A powerful, draggable, resizable, and dockable input field component for React with terminal and text modes, featuring glass morphism effects and smooth animations.

## ✨ Features

- **🎯 Draggable**: Drag the input field anywhere on the screen
- **📏 Resizable**: Resize from any corner with intuitive controls
- **📍 Dockable**: Dock to any edge of the screen
- **🎨 Dual Modes**: Switch between text and terminal modes
- **✨ Glass Morphism**: Beautiful backdrop blur effects
- **💫 Smooth Animations**: Glow effects and smooth transitions
- **🎛️ Customizable**: Extensive props for customization
- **📱 Responsive**: Works on desktop and mobile devices
- **♿ Accessible**: Full keyboard navigation support

## 🚀 Installation

```bash
pnpm add ultimate-input-field
# or
npm install ultimate-input-field
# or
yarn add ultimate-input-field
```

## 📦 Usage

### Basic Usage

```tsx
import React, { useState } from 'react';
import { UltimateInputField } from 'ultimate-input-field';
import 'ultimate-input-field/dist/styles.css';

function App() {
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState([]);

  const handleSend = () => {
    if (!value.trim()) return;
    
    const newMessage = { id: Date.now(), text: value, type: 'user' };
    setMessages(prev => [...prev, newMessage]);
    setValue('');
    
    // Simulate response
    setTimeout(() => {
      const response = { id: Date.now(), text: `Echo: ${newMessage.text}`, type: 'bot' };
      setMessages(prev => [...prev, response]);
    }, 1000);
  };

  return (
    <div>
      <UltimateInputField
        value={value}
        onChange={setValue}
        onSend={handleSend}
        placeholder="Type a message..."
      />
    </div>
  );
}
```

### Advanced Usage

```tsx
import React, { useState } from 'react';
import { UltimateInputField } from 'ultimate-input-field';
import 'ultimate-input-field/dist/styles.css';

function AdvancedApp() {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!value.trim()) return;
    
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Message sent:', value);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <UltimateInputField
        value={value}
        onChange={setValue}
        onSend={handleSend}
        isLoading={isLoading}
        mode="terminal"
        initialPosition={{ x: 100, y: 100 }}
        initialSize={{ width: 500, height: 150 }}
        minWidth={300}
        maxWidth={800}
        minHeight={60}
        maxHeight={400}
        draggable={true}
        resizable={true}
        dockable={true}
        glowEffect={true}
        glassEffect={true}
        className="custom-input-field"
        placeholder="Enter command..."
        disabled={false}
      />
    </div>
  );
}
```

## 🎛️ API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | - | **Required.** The current value of the input field |
| `onChange` | `(value: string) => void` | - | **Required.** Callback when the value changes |
| `onSend` | `() => void` | - | **Required.** Callback when the send button is clicked or Enter is pressed |
| `isLoading` | `boolean` | `false` | Whether the component is in a loading state |
| `className` | `string` | `''` | Additional CSS classes |
| `placeholder` | `string` | `'Type a message...'` or `'Enter command...'` | Placeholder text |
| `disabled` | `boolean` | `false` | Whether the input is disabled |
| `mode` | `'text' \| 'terminal'` | `'text'` | The display mode of the input field |
| `initialPosition` | `{ x: number; y: number }` | `{ x: center, y: center }` | Initial position on screen |
| `initialSize` | `{ width: number; height: number }` | `{ width: 600, height: 120 }` | Initial size of the component |
| `minWidth` | `number` | `300` | Minimum width in pixels |
| `maxWidth` | `number` | `800` | Maximum width in pixels |
| `minHeight` | `number` | `60` | Minimum height in pixels |
| `maxHeight` | `number` | `400` | Maximum height in pixels |
| `draggable` | `boolean` | `true` | Whether the component can be dragged |
| `resizable` | `boolean` | `true` | Whether the component can be resized |
| `dockable` | `boolean` | `true` | Whether the component can be docked |
| `glowEffect` | `boolean` | `true` | Whether to show glow effects |
| `glassEffect` | `boolean` | `true` | Whether to apply glass morphism effects |

## 🎨 Styling

The component comes with built-in styles that can be customized using CSS variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96%;
  --accent-foreground: 222.2 84% 4.9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
}
```

### Dark Mode

The component automatically supports dark mode when the `.dark` class is applied to a parent element:

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... other dark mode variables */
}
```

## 🎯 Features in Detail

### Dragging
- Hover over the top area to reveal the drag handle
- Click and drag to move the component anywhere on screen
- Smooth animations during drag operations

### Resizing
- Four corner resize tabs (top-left, top-right, bottom-left, bottom-right)
- Each corner resizes in the appropriate diagonal direction
- Maintains aspect ratio constraints
- Smooth resize animations

### Docking
- Click the menu button (☰) to open docking options
- Dock to top, bottom, left, or right edges
- Smooth transitions when docking/undocking
- Maintains functionality while docked

### Modes
- **Text Mode**: Standard text input with system font
- **Terminal Mode**: Monospace font with green text for command-line feel
- Toggle between modes with the mode button

### Effects
- **Glass Morphism**: Backdrop blur with transparency
- **Glow Effect**: Green glow animation when sending messages
- **Smooth Transitions**: All interactions have smooth animations

## 🔧 Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Professor-Codephreak/ultimate-input-field
cd ultimate-input-field

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Development mode with watch
pnpm run dev

# Clean build artifacts
pnpm run clean
```

### Project Structure

```
ultimate-input-field/
├── src/
│   ├── components/
│   │   ├── UltimateInputField.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── Icons.tsx
│   ├── styles/
│   │   └── UltimateInputField.css
│   ├── types.ts
│   └── index.ts
├── dist/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by modern UI design patterns
- Built with React and TypeScript
- Styled with CSS custom properties and modern CSS features

## 📞 Support

If you have any questions or need help, please open an issue on GitHub or contact the maintainers.

---

Made with ❤️ by the Ultimate Input Field Team 
