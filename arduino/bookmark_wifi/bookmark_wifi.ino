/*
  Smart Bookmark - Arduino Wi-Fi Firmware (Option A: Device ID Sync)
  This sketch sets up the Bookmark as a Wi-Fi client that connects to your home/phone Wi-Fi
  and sends HTTP POST API calls directly to the Express server using its unique Hardware Device ID (MAC Address).

  It simulates:
  1. Reading an NFC Tag (updating the Book ID).
  2. Adjusting the page number using two buttons (UP / DOWN).
  3. Clicking a SAVE button to write to EEPROM, connect to Wi-Fi, and sync to the cloud.

  Required Libraries (install via Arduino Library Manager):
  - Adafruit SSD1306 (For OLED screen)
  - Adafruit GFX Library
  - Adafruit PN532 (For NFC Reader)
*/

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
#else
  #error "This sketch is written for ESP32/ESP32-S3 boards (like M5StickS3 or ESP32-C3) supporting WiFi and HTTPClient."
#endif

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_PN532.h>
#include <EEPROM.h>

// --- Wi-Fi CONFIGURATION ---
// Replace with your Wi-Fi name and password or phone Hotspot details
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- SERVER CONFIGURATION ---
// Replace with the IP address of your computer running the Node.js server (Port 5001).
// E.g., if your computer is on 192.168.1.15, the URL is http://192.168.1.15:5001/api/update-progress
const char* serverUrl = "http://192.168.1.15:5001/api/update-progress";

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

// --- STATE VARIABLES ---
String currentBookId = "BOOK_01";
uint16_t currentPage = 1;
bool isNfcConnected = false;
String hardwareDeviceId = "BOOKMARK_01";

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
  EEPROM.begin(512); // ESP32 needs EEPROM.begin
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

  // 4. Connect to Wi-Fi and fetch Hardware MAC Address
  connectWiFi();
  
  // Store unique hardware MAC address
  String mac = WiFi.macAddress();
  if (mac != "" && mac != "00:00:00:00:00:00") {
    hardwareDeviceId = mac;
  }
  
  Serial.print("Bookmark Hardware Device ID: ");
  Serial.println(hardwareDeviceId);

  // Display Device ID on boot for easy pairing on the website
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Device ID for Site:");
  display.println(hardwareDeviceId);
  display.display();
  delay(2500);

  updateDisplay(currentBookId, "Page: " + String(currentPage));
}

void loop() {
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

  delay(50); // Small delay to avoid CPU overloading
}

// --- Wi-Fi CONNECTION LOGIC ---
void connectWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.println(ssid);
  display.display();
  
  WiFi.begin(ssid, password);
  
  int counter = 0;
  while (WiFi.status() != WL_CONNECTED && counter < 10) { // Timeout after 10 tries
    delay(1000);
    Serial.print(".");
    counter++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed/timeout");
  }
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
    // 3. Save State (Writes to EEPROM & Syncs to Cloud using Device ID)
    else if (digitalRead(BUTTON_SAVE_PIN) == LOW) {
      saveState();
      lastDebounceTime = millis();
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
    
    String scannedBookId = "BOOK_01";
    
    // Example mapping: Even first UID byte maps to BOOK_02
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

// --- PERSISTENCE & API SYNC ---
void saveState() {
  Serial.println("Saving state locally to EEPROM...");
  
  // 1. Write to local EEPROM
  EEPROM.write(EEPROM_ADDR_PAGE, currentPage);
  
  // Write book string to EEPROM
  for (unsigned int i = 0; i < currentBookId.length(); i++) {
    EEPROM.write(EEPROM_ADDR_BOOK + i, currentBookId[i]);
  }
  EEPROM.write(EEPROM_ADDR_BOOK + currentBookId.length(), '\0'); // null terminator
  EEPROM.commit(); // Commit to flash

  // 2. Perform API Web Sync using Device ID
  syncToBackend();
}

void syncToBackend() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Saving to cloud...");
  display.println("Page: " + String(currentPage));
  display.display();

  // If Wi-Fi is disconnected, attempt to reconnect first
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    int timer = 0;
    while (WiFi.status() != WL_CONNECTED && timer < 5) {
      delay(1000);
      timer++;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    // Send deviceId (Option A) instead of userId
    String jsonPayload = "{\"deviceId\":\"" + hardwareDeviceId + "\",\"bookId\":\"" + currentBookId + "\",\"currentPage\":" + String(currentPage) + "}";
    
    Serial.print("Sending POST request to: ");
    Serial.println(serverUrl);
    Serial.println("Payload: " + jsonPayload);

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode == 200) {
      String response = http.getString();
      Serial.println("Server responded: " + response);
      
      display.clearDisplay();
      display.setCursor(0, 0);
      display.println("Saved!");
      display.println("Page " + String(currentPage) + " Synced");
      display.display();
      
      // Invert screen quickly for success flash animation
      display.invertDisplay(true);
      delay(200);
      display.invertDisplay(false);
    } else {
      Serial.print("Error sending POST: ");
      Serial.println(httpResponseCode);
      
      display.clearDisplay();
      display.setCursor(0, 0);
      display.println("Sync Failed!");
      display.println("Error: " + String(httpResponseCode));
      display.display();
    }
    http.end(); // Free resources
  } else {
    Serial.println("WiFi offline. Saved locally only.");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("WiFi Offline!");
    display.println("Saved Locally");
    display.display();
  }
  
  delay(1500); // Leave message on screen for feedback
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
