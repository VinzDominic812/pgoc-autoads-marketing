import Cookies from "js-cookie";
import CryptoJS from "crypto-js";

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET; // Keep this in .env

export const encryptData = (data) => {
  try {
    if (!data) return null;
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
  } catch (error) {
    console.error("Encryption failed:", error);
    return null;
  }
};

export const decryptData = (encrypted) => {
  try {
    if (!encrypted) return null;
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    try {
      return decrypted ? JSON.parse(decrypted) : null;
    } catch {
      return decrypted; // Return as-is if not JSON
    }
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
};

export const getUserData = () => {
  // Check localStorage first, fallback to cookies if not migrated yet
  const getStoredData = (key) => {
    return localStorage.getItem(key) || Cookies.get(key);
  };

  return {
    id: decryptData(getStoredData("xsid_g")),
    accessToken: decryptData(getStoredData("xsid")),
    userId: decryptData(getStoredData("usr")),
    redisKey: decryptData(getStoredData("rsid")),
    username: decryptData(getStoredData("username")), // New: Get username
    email: decryptData(getStoredData("email")),      // New: Get email
    status: decryptData(getStoredData("status")),    // New: Get status (active/inactive)
    profile_image: decryptData(getStoredData("profile_image")) // New: Get profile image (Base64)
  };
};

export const migrateCookiesToLocalStorage = () => {
  const keys = ["xsid_g", "xsid", "usr", "rsid", "username", "email", "status", "profile_image"];
  keys.forEach(key => {
    const cookieValue = Cookies.get(key);
    if (cookieValue && !localStorage.getItem(key)) {
      localStorage.setItem(key, cookieValue);
      Cookies.remove(key); // Remove after migration
    }
  });
};