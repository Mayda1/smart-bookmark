// Web Bluetooth helper for the Smart Bookmark hardware.
//
// This is ONLY used for the one-time setup steps — everything day-to-day
// (resolving a scanned NFC tag to a book, saving reading progress) happens
// directly device -> server over WiFi once the device knows its network,
// with no browser involved. The two things this class exists for:
//   1. sendWifiCredentials — hand the device a WiFi SSID/password once
//      (over BLE, since the device has no other way to receive them before
//      it's ever been on a network).
//   2. startNfcLinking — while the reader has a specific book open, wait
//      for them to tap a physical NFC sticker on the bookmark, then hand
//      the raw tag UID back here so it can be saved as tagUid -> bookId.
//
// Device <-> user linking does NOT need Bluetooth at all — the device
// shows its own ID on its little screen, and the reader types that into
// the "Link Device" box on the site (see Library.jsx).

const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const PAGE_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef1";
const NFC_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef2";
const TITLE_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef3";
const COMMAND_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef4";

export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class BookmarkBLE {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristics = { page: null, nfc: null, title: null, cmd: null };
    this._onConnectionChanged = null;
    this._nfcResolver = null;

    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.handleNfcNotification = this.handleNfcNotification.bind(this);
  }

  get isConnected() {
    return !!(this.device && this.device.gatt && this.device.gatt.connected);
  }

  get deviceName() {
    return this.device?.name || "";
  }

  async connect() {
    if (!isWebBluetoothSupported()) {
      throw new Error("הדפדפן הזה לא תומך ב-Web Bluetooth (נסי כרום על מחשב או אנדרואיד)");
    }
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "Bookify-" }],
      optionalServices: [SERVICE_UUID]
    });
    this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);

    this.server = await this.device.gatt.connect();
    const service = await this.server.getPrimaryService(SERVICE_UUID);

    this.characteristics.page = await service.getCharacteristic(PAGE_CHAR_UUID);
    this.characteristics.nfc = await service.getCharacteristic(NFC_CHAR_UUID);
    this.characteristics.title = await service.getCharacteristic(TITLE_CHAR_UUID);
    this.characteristics.cmd = await service.getCharacteristic(COMMAND_CHAR_UUID);

    await this.characteristics.nfc.startNotifications();
    this.characteristics.nfc.addEventListener("characteristicvaluechanged", this.handleNfcNotification);

    if (this._onConnectionChanged) this._onConnectionChanged(true);
    return true;
  }

  disconnect() {
    if (this.isConnected) this.device.gatt.disconnect();
  }

  handleDisconnect() {
    if (this._onConnectionChanged) this._onConnectionChanged(false);
  }

  handleNfcNotification(event) {
    const decoder = new TextDecoder("utf-8");
    const tagUid = decoder.decode(event.target.value).trim();
    if (this._nfcResolver) {
      this._nfcResolver(tagUid);
      this._nfcResolver = null;
    }
  }

  async sendWifiCredentials(ssid, password) {
    if (!this.isConnected) throw new Error("הסימנייה לא מחוברת");
    if (ssid.includes("|")) throw new Error("שם הרשת לא יכול להכיל את התו |");
    const cmd = `wifi:${ssid}|${password}`;
    const encoder = new TextEncoder();
    await this.characteristics.cmd.writeValue(encoder.encode(cmd));
  }

  // Puts the device into "waiting for an NFC tap" mode and resolves with
  // the scanned tag's UID (or rejects after a timeout).
  async startNfcLinking(timeoutMs = 30000) {
    if (!this.isConnected) throw new Error("הסימנייה לא מחוברת");
    const encoder = new TextEncoder();
    await this.characteristics.cmd.writeValue(encoder.encode("linkNFC"));

    return new Promise((resolve, reject) => {
      this._nfcResolver = resolve;
      setTimeout(() => {
        if (this._nfcResolver) {
          this._nfcResolver = null;
          reject(new Error("לא זוהה תג NFC תוך 30 שניות"));
        }
      }, timeoutMs);
    });
  }

  onConnectionChanged(callback) {
    this._onConnectionChanged = callback;
  }
}
