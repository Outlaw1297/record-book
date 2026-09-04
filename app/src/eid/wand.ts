import { extractEid } from './parseEid';

export const SCANNED_EID_KEY = 'record-book.scannedEid';

export function rememberScannedEid(eid: string): void {
  sessionStorage.setItem(SCANNED_EID_KEY, eid);
}

export function takeScannedEid(): string | undefined {
  const value = sessionStorage.getItem(SCANNED_EID_KEY)?.trim();
  if (!value) return undefined;
  sessionStorage.removeItem(SCANNED_EID_KEY);
  return value;
}

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_SERIAL_SERVICES = [
  NUS,
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

export function bluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
}

type HidHandlers = {
  pushKey: (key: string) => void;
  pushText: (text: string) => void;
  replace: (text: string) => void;
  dispose: () => void;
};

/** Tru-Test HID / HID Smart types the EID as a keyboard. */
export function createHidEidBuffer(onEid: (eid: string) => void): HidHandlers {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    const eid = extractEid(buffer, { complete: true });
    buffer = '';
    if (eid) onEid(eid);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 450);
  }

  function pushText(text: string): void {
    buffer += text;
    if (extractEid(buffer)) {
      if (timer) clearTimeout(timer);
      flush();
      return;
    }
    schedule();
  }

  function replace(text: string): void {
    buffer = text;
    if (extractEid(buffer)) {
      if (timer) clearTimeout(timer);
      flush();
      return;
    }
    schedule();
  }

  function pushKey(key: string): void {
    if (key === 'Enter' || key === 'Tab') {
      if (timer) clearTimeout(timer);
      flush();
      return;
    }
    if (key.length === 1) pushText(key);
  }

  return {
    pushKey,
    pushText,
    replace,
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

export async function connectBleWand(
  onEid: (eid: string) => void,
  onStatus: (label: string) => void,
): Promise<() => void> {
  if (!navigator.bluetooth) {
    throw new Error('This phone browser cannot open Bluetooth. Pair the wand as a keyboard, or use the Android app.');
  }
  onStatus('Choose the wand in the phone list…');
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_SERIAL_SERVICES,
  });
  onStatus(`Connecting to ${device.name || 'wand'}…`);
  const server = await device.gatt?.connect();
  if (!server) throw new Error('The wand did not stay connected.');
  let buffer = '';
  const flush = () => {
    const eid = extractEid(buffer);
    if (eid) {
      buffer = '';
      onEid(eid);
    }
  };
  const handleChunk = (chunk: string) => {
    buffer += chunk;
    if (extractEid(buffer)) flush();
    else if (buffer.length > 80) buffer = buffer.slice(-40);
  };
  const listeners: Array<{
    ch: BluetoothRemoteGATTCharacteristic;
    fn: (event: Event) => void;
  }> = [];
  let subscribed = 0;
  for (const uuid of BLE_SERIAL_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        if (!ch.properties.notify && !ch.properties.indicate) continue;
        await ch.startNotifications();
        const fn = (event: Event) => {
          const value = (event.target as unknown as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          handleChunk(new TextDecoder().decode(value));
        };
        ch.addEventListener('characteristicvaluechanged', fn);
        listeners.push({ ch, fn });
        subscribed += 1;
      }
    } catch {
      // Service not on this wand.
    }
  }
  if (subscribed === 0) {
    server.disconnect();
    throw new Error(
      'Connected, but this wand is not sending over BLE. On an XRS2i set Bluetooth profile to HID, pair it in Android, then scan into the box below.',
    );
  }
  onStatus(`Wand ready · ${device.name || 'connected'}. Scan a tag.`);
  const onDisconnect = () => onStatus('Wand disconnected.');
  device.addEventListener('gattserverdisconnected', onDisconnect);
  return () => {
    device.removeEventListener('gattserverdisconnected', onDisconnect);
    for (const { ch, fn } of listeners) {
      ch.removeEventListener('characteristicvaluechanged', fn);
    }
    server.disconnect();
  };
}
