import React, { useState } from "react";
import Box from "@mui/material/Box";
import AddIcon from "@mui/icons-material/Add";
import { getUserData } from "../../services/user_data"; // Adjust the path based on your project structure

const DashboardPage = () => {
  const [userData, setUserData] = useState(null);


  return (
    <Box>
      {/* Use Box component for spacing */}
      <div className="flex justify-start">
      Dashboard
      </div>
    </Box>
  );
};

export default DashboardPage;
