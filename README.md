# Ultimate Input Field

A draggable, resizable, dockable input field for React, built as the centre of a modular UI bar. It has a chat mode and a **T terminal mode**, extensible action buttons you rearrange by press-and-hold drag and drop, and output fields you can spawn, pop out to other monitors, find with strings, and call back home.

## ✨ Features

- **🎯 Draggable**: Drag the input field anywhere on the screen
- **📏 Resizable**: Resize from any corner with intuitive controls
- **📍 Dockable**: Dock to any edge of the screen
- **💬 / T Modes**: Chat (input → response) and terminal mode, where every action is a command
- **🧩 Extensible actions**: Add actions, hold a button to rearrange by drag and drop, drag it off the bar to hide it
- **🪟 Output fields**: Spawn several, pop them out into windows on other monitors, call them home
- **〰 Strings**: Toggle tether lines to every output, with edge beacons pointing at pop-outs
- **🧱 Modular bar**: `UltimateBar` places modules on either side of the field
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
import 'ultimate-input-field/dist/index.css';

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
import 'ultimate-input-field/dist/index.css';

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

## 🧱 The bar, actions and outputs

```tsx
import { UltimateBar, isOutputWindow, OutputWindow, type Action } from 'ultimate-input-field';
import 'ultimate-input-field/dist/index.css';

const actions: Action[] = [
  {
    id: 'time',
    label: 'Time',
    command: 'time',
    icon: '◷',
    description: 'time - print the current time',
    run: ctx => ctx.print(new Date().toLocaleTimeString()),
  },
];

async function* reply(text: string) {
  yield 'You said: ';
  yield text;
}

export function Root() {
  // Pop-out windows load the same URL with ?uif-output=<id>.
  if (isOutputWindow()) return <OutputWindow />;
  return (
    <UltimateBar
      storageKey="my-app"
      actions={actions}
      onSend={text => reply(text)}   // string | Promise<string> | AsyncIterable<string>
      left={<Clock />}
      right={<Status />}
    />
  );
}
```

Modules (and anything else inside `UltimateBar`) can reach the shared state with `useUIF()`: `registry`, `outputs`, `fields`, `strings`, `setStrings`.

### Actions

- **Run** an action by tapping its button, or by typing its `command` (or an alias) in T mode. In chat mode, start the line with `/`.
- **Rearrange**: press and hold a button (400 ms) to enter arrange mode, then drag it to a new slot. Drag a button off the bar to hide it, and press **Done** or Esc to finish. From the keyboard, choose **+ → Arrange…**, then use the arrow keys to move a button and Delete to hide it.
- **Add**: **+** lists the hidden actions, and lets you make a custom action that runs commands (`spawn logs; strings on`) or sends text.
- The order, the hidden actions and the custom actions are saved in `localStorage` under `storageKey`.

An action's `run(ctx)` receives `ctx.args` and the controls: `print`, `send`, `runCommand`, `setMode`, `dock`, `setStrings`, `outputs` (`spawn`, `close`, `popOut`, `callHome`, `ping`, `append`, `update`, `resolve`, …) and `registry`.

### Terminal commands

| Command | Does |
|---|---|
| `help`, `actions` | List the commands, or the actions and whether each is on the bar |
| `spawn [title]` | Open a new output field |
| `outputs` | List the outputs (`*` marks the active one) |
| `popout [output]` | Move an output into its own window |
| `home [output\|all]` | Close the pop-outs and bring the outputs back beside the field |
| `ping [output]` | Flash an output (and focus its window) |
| `strings [on\|off]` | Toggle the tethers and beacons |
| `close [output]`, `clear [output]` | Close an output, or clear the log or an output |
| `dock [top\|bottom\|left\|right\|off]` | Pin the field to an edge |
| `mode [chat\|terminal]` | Switch modes (the **T** button does the same) |
| `screens` | Ask for permission to place pop-outs on other monitors |

`[output]` can be an id, a 1-based index or a title, and defaults to the active output. A command that matches no action goes to `onCommand(name, args, ctx)`.

### Outputs on other monitors

A pop-out is a real browser window that you can drag to any monitor. It stays in sync with the hub through a `BroadcastChannel`. After you run `screens` and grant window-management permission (Chromium), new pop-outs open on the next screen.

`home` closes the pop-outs and brings their panels back, history included. Closing a pop-out window yourself also brings that output home. If the hub page reloads, pop-outs that are still open reconnect.

With strings on, in-page outputs are tied to the field by coloured curves. Pop-outs get a beacon at the edge of the viewport that points toward their window: click it to flash and focus the window, or double-click it to call the output home.

## 🎛️ API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | - | Controlled value; omit it to let the field manage its own text |
| `onChange` | `(value: string) => void` | - | Called when the value changes |
| `onSend` | `(text, { outputId }) => void \| string \| Promise<string> \| AsyncIterable<string>` | - | Chat-mode send; a returned value is written or streamed into the active output |
| `onCommand` | `(name, args, ctx) => string \| void` | - | Handles terminal commands that match no action |
| `onAction` | `(action, args) => void` | - | Called after any action runs |
| `onModeChange` | `(mode) => void` | - | Called when the mode changes between chat and terminal |
| `actions` | `Action[]` | `[]` | Extra actions, registered next to the built-ins |
| `storageKey` | `string` | `'default'` | Namespaces saved state and the pop-out channel |
| `popoutUrl` | `string` | current page | The page pop-out windows load |
| `defaultStrings` | `boolean` | `false` | Whether the strings start visible |
| `left` / `right` | `ReactNode` | - | Modules on either side of the field |
| `isLoading` | `boolean` | `false` | Whether the component is in a loading state |
| `className` | `string` | `''` | Additional CSS classes |
| `placeholder` | `string` | `'Type a message...'` or `'Enter command...'` | Placeholder text |
| `disabled` | `boolean` | `false` | Whether the input is disabled |
| `mode` | `'chat' \| 'terminal'` | `'chat'` | Initial mode (`'text'` still works as an alias for `'chat'`) |
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
- Resize grips on all four corners of the input field and of every output panel (they appear on hover, and stay visible on touch screens)
- Each corner resizes in the appropriate diagonal direction
- The opposite corner stays put, and a panel never resizes past the edge of the viewport
- Smooth resize animations

### Docking
- Use the dock action (▁) to pin the field to the bottom edge and back, or `dock top|bottom|left|right|off`
- Dock to top, bottom, left, or right edges
- Smooth transitions when docking/undocking
- Maintains functionality while docked

### Modes
- **Chat mode**: Enter sends the text; the reply goes into the active output field
- **T terminal mode**: Enter runs a command and prints the result to a log above the field; ↑/↓ step through the history
- Switch with the **T** button or the `mode` command

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
src/
├── core/            # framework-free: action registry, command parser, built-ins, BroadcastChannel bus
├── hooks/           # useDragResize, usePressHoldDrag
├── components/
│   ├── UltimateInputField.tsx   # the hub: chat / T terminal, action bar
│   ├── UltimateBar.tsx          # modular bar around the hub
│   ├── UIFContext.tsx           # shared provider: registry, outputs, strings
│   ├── ActionBar.tsx            # buttons, press-hold drag and drop, add palette
│   ├── OutputField.tsx          # in-page output panel
│   ├── OutputWindow.tsx         # pop-out window page
│   └── Tethers.tsx              # strings and edge beacons
├── styles/UltimateInputField.css
├── types.ts
└── index.ts
```

Run `pnpm test` for the unit tests and `pnpm typecheck` to type-check.

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
