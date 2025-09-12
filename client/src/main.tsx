// Browser compatibility polyfills
if (typeof window !== 'undefined') {
  // Import buffer dynamically to avoid constructor issues
  import('buffer').then(({ Buffer }) => {
    (window as any).Buffer = Buffer;
    (window as any).global = globalThis;
    
    // Process polyfill
    if (!(window as any).process) {
      (window as any).process = {
        env: {},
        platform: 'browser',
        version: 'v18.0.0',
        versions: { node: '18.0.0' },
        browser: true,
        nextTick: (callback: Function) => setTimeout(callback, 0),
        cwd: () => '/',
        chdir: () => {},
      };
    }
    
    // OS module polyfill
    (window as any).os = {
      type: () => 'Browser',
      platform: () => 'browser',
      arch: () => 'x64',
      release: () => '1.0.0',
      hostname: () => 'localhost',
      tmpdir: () => '/tmp',
      homedir: () => '/home',
      endianness: () => 'LE',
      loadavg: () => [0, 0, 0],
      totalmem: () => 8589934592,
      freemem: () => 4294967296,
      cpus: () => [],
      networkInterfaces: () => ({}),
      EOL: '\n',
      constants: { UV_UDP_REUSEADDR: 4 }
    };
  });
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
