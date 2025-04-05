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
  return {
    id: decryptData(localStorage.getItem("xsid_g")),
    accessToken: decryptData(localStorage.getItem("xsid")),
    userId: decryptData(localStorage.getItem("usr")),
    redisKey: decryptData(localStorage.getItem("rsid")),
  };
};

export const migrateCookiesToLocalStorage = () => {
  const keys = ["xsid_g", "xsid", "usr", "rsid"];
  keys.forEach(key => {
    const cookieValue = Cookies.get(key);
    if (cookieValue && !localStorage.getItem(key)) {
      localStorage.setItem(key, cookieValue);
      Cookies.remove(key); // Remove after migration
    }
  });
};