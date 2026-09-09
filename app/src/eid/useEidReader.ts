import { useEffect, useRef, useState } from 'react';
import { readEidFromPhoto } from './tagPhoto';
import {
  bluetoothAvailable,
  connectBleWand,
  createHidEidBuffer,
} from './wand';

export function useEidReader(onEid: (eid: string) => void) {
  const onEidRef = useRef(onEid);
  useEffect(() => {
    onEidRef.current = onEid;
  }, [onEid]);

  const hidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const stopBle = useRef<(() => void) | undefined>(undefined);
  const previewUrl = useRef('');
  const hid = useRef(createHidEidBuffer((eid) => onEidRef.current(eid)));

  const [preview, setPreview] = useState('');
  const [photoBusy, setPhotoBusy] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [wandStatus, setWandStatus] = useState(
    'Pair the XRS2i as a keyboard (HID), then scan into the box.',
  );
  const [wandBusy, setWandBusy] = useState(false);

  useEffect(() => {
    hid.current = createHidEidBuffer((eid) => onEidRef.current(eid));
    return () => {
      hid.current.dispose();
      stopBle.current?.();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  async function onPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    setPhotoError('');
    setPhotoBusy('Reading photo…');
    try {
      const result = await readEidFromPhoto(file, setPhotoBusy);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = result.previewUrl;
      setPreview(result.previewUrl);
      onEidRef.current(result.eid);
      if (hidRef.current) hidRef.current.value = result.eid;
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not read the photo.');
    } finally {
      setPhotoBusy('');
    }
  }

  async function onBle(): Promise<void> {
    setWandBusy(true);
    try {
      stopBle.current?.();
      stopBle.current = await connectBleWand((eid) => onEidRef.current(eid), setWandStatus);
    } catch (error) {
      setWandStatus(error instanceof Error ? error.message : 'Could not open Bluetooth.');
    } finally {
      setWandBusy(false);
    }
  }

  return {
    hidRef,
    fileRef,
    cameraRef,
    preview,
    photoBusy,
    photoError,
    wandStatus,
    wandBusy,
    bleAvailable: bluetoothAvailable(),
    openCamera: () => cameraRef.current?.click(),
    openFile: () => fileRef.current?.click(),
    onPhoto,
    onBle,
    onHidChange: (text: string) => hid.current.replace(text),
    onHidEnter: () => hid.current.pushKey('Enter'),
  };
}
