import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import Cookies from "js-cookie";
import CryptoJS from "crypto-js";

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET;

const decryptData = (cipherText) => {
  if (!cipherText) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
};

const ProtectedRoute = () => {
  const isAuthenticated = decryptData(Cookies.get("isxd")) === "true"; 

  return isAuthenticated ? <Outlet /> : <Navigate to="/" replace />;
};

export default ProtectedRoute;
