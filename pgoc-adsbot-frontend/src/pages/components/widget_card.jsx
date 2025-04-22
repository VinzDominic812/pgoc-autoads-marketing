import React from "react";
import { Card, CardContent, Typography } from "@mui/material";

const WidgetCard = ({ title, height, width, children }) => {
  return (
    <Card
      elevation={3}
      sx={{
        width: width || "100%", // Ensures full width inside grid
        height: height || "800px", // Default height is 650px, can be customized
        backgroundColor: "#FFFFFF", // White background
        borderRadius: "12px", // Modern rounded corners
        boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.1)", // Softer shadow for a sleek look
        display: "flex",
        flexDirection: "column",
        overflow: "hidden", // Ensures content respects border radius
      }}
    >
      <CardContent sx={{ padding: "12px", flexGrow: 1 }}> {/* Slightly increased padding */}
        {children} {/* Allows custom content inside */}
      </CardContent>
    </Card>
  );
};

export default WidgetCard;
