/*
  Smart Bookmark - Arduino BLE Firmware (MVP)
  This sketch sets up a Bluetooth Low Energy (BLE) peripheral representing the Bookmark.
  It simulates:
  1. Reading an NFC Tag (updating the Book ID).
  2. Adjusting the page number using two buttons (UP / DOWN).
  3. Clicking a SAVE button to write to EEPROM and notify the connected Web Browser.

  Required Libraries (install via Arduino Library Manager):
  - ArduinoBLE
  - Adafruit SSD1306 (For OLED screen)
  - Adafruit GFX Library
  - Adafruit PN532 (For NFC Reader)
*/

#include <ArduinoBLE.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_PN532.h>
#include <EEPROM.h>

// --- PIN DEFINITIONS ---
#define BUTTON_UP_PIN    2
#define BUTTON_DOWN_PIN  3
#define BUTTON_SAVE_PIN  4

// --- OLED CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32 // 128x32 OLED is narrow and perfect for a bookmark
#define OLED_RESET    -1 // Sharing reset pin or none
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- NFC CONFIGURATION (PN532 I2C) ---
#define PN532_IRQ   6
#define PN532_RESET 8
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET);

// --- BLE UUIDS (Must match app.js) ---
#define BLE_SERVICE_UUID           "19b10000-e8f2-537e-4f6c-d104768a1214"
#define BLE_BOOK_CHAR_UUID         "19b10001-e8f2-537e-4f6c-d104768a1214"
#define BLE_PAGE_CHAR_UUID         "19b10002-e8f2-537e-4f6c-d104768a1214"

// --- BLE SERVICES & CHARACTERISTICS ---
BLEService bookmarkService(BLE_SERVICE_UUID);

// BLE Characteristics:
// Book ID (string representation, e.g. "BOOK_01")
BLEStringCharacteristic bookCharacteristic(BLE_BOOK_CHAR_UUID, BLERead | BLENotify, 16);
// Page Number (16-bit unsigned integer)
BLEUnsignedShortCharacteristic pageCharacteristic(BLE_PAGE_CHAR_UUID, BLERead | BLEWrite | BLENotify);

// --- STATE VARIABLES ---
String currentBookId = "BOOK_01";
uint16_t currentPage = 1;
bool isNfcConnected = false;

// Address offsets in EEPROM
#define EEPROM_ADDR_PAGE 0
#define EEPROM_ADDR_BOOK 10 // Store book ID string starting here

// --- DEBOUNCE UTILITY ---
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 150; // ms

void setup() {
  Serial.begin(115200);
  
  // Initialize Pins
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);
  pinMode(BUTTON_SAVE_PIN, INPUT_PULLUP);

  // 1. Initialize Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // I2C address 0x3C for 128x32
    Serial.println(F("SSD1306 allocation failed"));
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Smart Bookmark");
    display.println("Initializing...");
    display.display();
  }

  // 2. Initialize EEPROM & Load Saved State
  #if defined(ESP32)
    EEPROM.begin(512); // ESP32 needs EEPROM.begin
  #endif
  loadSavedState();

  // 3. Initialize NFC Reader
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("Didn't find PN532 board");
    isNfcConnected = false;
  } else {
    Serial.print("Found PN532 chip with firmware version: ");
    Serial.println((versiondata>>24) & 0xFF, HEX);
    nfc.SAMConfig(); // Configure board to read RFID tags
    isNfcConnected = true;
  }

  // 4. Initialize BLE
  if (!BLE.begin()) {
    Serial.println("Starting BLE failed!");
    updateDisplay("BLE Error", "Restart device");
    while (1);
  }

  BLE.setLocalName("SmartBookmark");
  BLE.setAdvertisedService(bookmarkService);

  // Add characteristics
  bookmarkService.addCharacteristic(bookCharacteristic);
  bookmarkService.addCharacteristic(pageCharacteristic);

  // Add service
  BLE.addService(bookmarkService);

  // Set initial characteristic values
  bookCharacteristic.writeValue(currentBookId);
  pageCharacteristic.writeValue(currentPage);

  // Start advertising
  BLE.advertise();
  Serial.println("Bluetooth BLE active. Waiting for connections...");
  
  updateDisplay(currentBookId, "Page: " + String(currentPage));
}

void loop() {
  // Listen for BLE centrals
  BLEDevice central = BLE.central();

  // Read current physical buttons
  handleButtons();

  // Check NFC Reader periodically (if connected)
  if (isNfcConnected) {
    handleNFC();
  }

  // Update display if there are state changes
  static uint16_t lastDisplayedPage = 0;
  static String lastDisplayedBook = "";
  if (currentPage != lastDisplayedPage || currentBookId != lastDisplayedBook) {
    updateDisplay(currentBookId, "Page: " + String(currentPage));
    lastDisplayedPage = currentPage;
    lastDisplayedBook = currentBookId;
  }

  // Handle BLE notification updates
  if (central && central.connected()) {
    // If a central is connected, we can monitor updates
    // For example, if the browser writes a value to pageCharacteristic, update local state
    if (pageCharacteristic.written()) {
      currentPage = pageCharacteristic.value();
      Serial.print("Page updated from browser: ");
      Serial.println(currentPage);
    }
  }
  
  delay(50); // Small delay to avoid CPU overloading
}

// --- BUTTONS LOGIC ---
void handleButtons() {
  if ((millis() - lastDebounceTime) > debounceDelay) {
    // 1. Increment Page
    if (digitalRead(BUTTON_UP_PIN) == LOW) {
      currentPage++;
      Serial.print("Page Up: ");
      Serial.println(currentPage);
      lastDebounceTime = millis();
    }
    // 2. Decrement Page
    else if (digitalRead(BUTTON_DOWN_PIN) == LOW) {
      if (currentPage > 1) {
        currentPage--;
        Serial.print("Page Down: ");
        Serial.println(currentPage);
      }
      lastDebounceTime = millis();
    }
    // 3. Save State (Writes to EEPROM and sends BLE update)
    else if (digitalRead(BUTTON_SAVE_PIN) == LOW) {
      saveState();
      lastDebounceTime = millis();
      
      // Flash screen for visual feedback
      display.invertDisplay(true);
      delay(150);
      display.invertDisplay(false);
    }
  }
}

// --- NFC READING LOGIC ---
void handleNFC() {
  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };  // Buffer to store the returned UID
  uint8_t uidLength;                        // Length of the UID (4 or 7 bytes depending on ISO14443A card type)

  // Non-blocking scan attempt (short timeout)
  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50);

  if (success) {
    Serial.println("Found an NFC tag!");
    Serial.print("UID Length: ");Serial.print(uidLength, DEC);Serial.println(" bytes");
    Serial.print("UID Value: ");
    nfc.PrintHex(uid, uidLength);
    
    // For simplicity in MVP: we map specific UIDs to book IDs.
    // In production, we'd read written NDEF text containing "BOOK_01" directly from the tag memory.
    String scannedBookId = "BOOK_01";
    
    // Example: If first byte of UID is different, switch to BOOK_02
    if (uid[0] % 2 == 0) {
      scannedBookId = "BOOK_02";
    } else {
      scannedBookId = "BOOK_01";
    }

    if (scannedBookId != currentBookId) {
      currentBookId = scannedBookId;
      currentPage = 1; // Reset to page 1 for a new book
      Serial.print("Switched to book: ");
      Serial.println(currentBookId);
      
      // Automatically save and broadcast book switch
      saveState();
    }
    
    delay(1000); // Wait 1 second to avoid double scans
  }
}

// --- PERSISTENCE (EEPROM) ---
void saveState() {
  Serial.println("Saving state to EEPROM and updating BLE...");
  
  // Write to EEPROM
  EEPROM.write(EEPROM_ADDR_PAGE, currentPage);
  
  // Write book string to EEPROM
  for (unsigned int i = 0; i < currentBookId.length(); i++) {
    EEPROM.write(EEPROM_ADDR_BOOK + i, currentBookId[i]);
  }
  EEPROM.write(EEPROM_ADDR_BOOK + currentBookId.length(), '\0'); // null terminator
  
  #if defined(ESP32)
    EEPROM.commit(); // ESP32 needs commit to write to flash
  #endif

  // Update BLE Characteristics
  pageCharacteristic.writeValue(currentPage);
  bookCharacteristic.writeValue(currentBookId);
  
  Serial.println("State Saved & Broadcasted!");
}

void loadSavedState() {
  // Load page number
  uint8_t savedPage = EEPROM.read(EEPROM_ADDR_PAGE);
  if (savedPage > 0 && savedPage < 255) {
    currentPage = savedPage;
  } else {
    currentPage = 1;
  }

  // Load Book ID string
  String loadedBook = "";
  for (int i = 0; i < 16; i++) {
    char c = EEPROM.read(EEPROM_ADDR_BOOK + i);
    if (c == '\0' || c == 255) break;
    loadedBook += c;
  }

  if (loadedBook.startsWith("BOOK_")) {
    currentBookId = loadedBook;
  } else {
    currentBookId = "BOOK_01";
  }

  Serial.print("Loaded state from EEPROM: ");
  Serial.print(currentBookId);
  Serial.print(", Page: ");
  Serial.println(currentPage);
}

// --- DISPLAY LOGIC ---
void updateDisplay(String line1, String line2) {
  display.clearDisplay();
  display.setCursor(0, 0);
  
  // Render Book Title/ID
  display.setTextSize(1);
  display.println("Book: " + line1);
  
  // Render Page Number
  display.setTextSize(2);
  display.setCursor(0, 12);
  display.println(line2);
  
  display.display();
}
