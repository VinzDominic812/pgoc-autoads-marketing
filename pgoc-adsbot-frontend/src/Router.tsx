import React from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/screens/main/mainpage";
import LandingPage from "./pages/screens/registration/landingpage";
import ForgotPasswordPage from "./pages/screens/registration/forgotpassword";
import ResetPassword from "./pages/screens/registration/resetpassword";
import ProtectedRoute from "./ProtectedRoutes"; // Import the ProtectedRoute

function Router() {
    return (
      <Routes>
       <Route path="/" element={<LandingPage />} /> {/* Start Page */}
       <Route path="/forgot-password" element={<ForgotPasswordPage />} />
       <Route path="/reset-password/:token" element={<ResetPassword />} /> {/* Reset password route */}

       {/* Protected Route for Authenticated Users */}
       <Route element={<ProtectedRoute />}>
         <Route path="/main" element={<Dashboard />} />
       </Route>
      </Routes>
    );
  }
  
export default Router;
