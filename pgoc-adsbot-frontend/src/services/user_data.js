import Cookies from "js-cookie";
import CryptoJS from "crypto-js";

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET; // Keep this in .env

const decryptData = (encrypted) => {
  try {
    if (!encrypted) return null; // Handle missing data
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || null;
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
};

export const getUserData = () => {
  return {
    id: decryptData(Cookies.get("xsid_g")),
    accessToken: decryptData(Cookies.get("xsid")),
    userId: decryptData(Cookies.get("usr")),
    redisKey: decryptData(Cookies.get("rsid")),
  };
};

