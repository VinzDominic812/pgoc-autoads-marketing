import Cookies from "js-cookie";
import CryptoJS from "crypto-js";

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET; // Keep this in .env

export const encryptData = (data) => {
  try {
    if (!data) return null;
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
  } catch (error) {
    //console.error("Encryption failed:", error);
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
    const storedValue = localStorage.getItem(key) || Cookies.get(key);
    if (!storedValue) {
      // console.log(`No value found for key: ${key}`);
      return null;
    }
    return storedValue;
  };

  // Get and decrypt the access token first
  const accessToken = getStoredData("xsid");
  // console.log("Raw access token:", accessToken); // Debug log

  if (!accessToken) {
    // console.error("No access token found in storage");
    return null;
  }

  const decryptedToken = decryptData(accessToken);
  // console.log("Decrypted token:", decryptedToken); // Debug log

  if (!decryptedToken) {
    // console.error("Failed to decrypt access token");
    return null;
  }

  return {
    id: decryptData(getStoredData("xsid_g")),
    accessToken: decryptedToken,
    userId: decryptData(getStoredData("usr")),
    redisKey: decryptData(getStoredData("rsid")),
    username: decryptData(getStoredData("username")),
    email: decryptData(getStoredData("email")),
    status: decryptData(getStoredData("status")),
    profile_image: decryptData(getStoredData("profile_image")),
    user_level: decryptData(getStoredData("user_level")),
    user_role: decryptData(getStoredData("user_role"))
  };
};

export const migrateCookiesToLocalStorage = () => {
  const keys = ["xsid_g", "xsid", "usr", "rsid", "username", "email", "status", "profile_image", "user_level", "user_role"];
  keys.forEach(key => {
    const cookieValue = Cookies.get(key);
    if (cookieValue && !localStorage.getItem(key)) {
      localStorage.setItem(key, cookieValue);
      Cookies.remove(key); // Remove after migration
    }
  });
};